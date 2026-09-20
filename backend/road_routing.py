"""Road-network routing with role-aware hazard costs."""

from functools import lru_cache
import logging
import math
from typing import Any
import warnings

import networkx as nx
import osmnx as ox
from shapely.geometry import LineString, Polygon

logger = logging.getLogger(__name__)


class RoadNetworkUnavailableError(RuntimeError):
    """Raised when a real road-network path cannot be produced."""


ROLE_HAZARD_MULTIPLIERS = {
    "civilian": 12.0,
    "ambulance": 8.0,
    "firefighter": 6.0,
    "supply-vehicle": 14.0,
    "emergency-coordinator": 9.0,
}


def _query_bounds(
    start: tuple[float, float],
    destination: tuple[float, float],
    selected_area: dict[str, float] | None,
) -> tuple[float, float, float, float]:
    longitudes = [start[0], destination[0]]
    latitudes = [start[1], destination[1]]
    if selected_area:
        longitudes.extend([selected_area["west"], selected_area["east"]])
        latitudes.extend([selected_area["south"], selected_area["north"]])
    padding = 0.015
    return (
        round(min(longitudes) - padding, 4),
        round(min(latitudes) - padding, 4),
        round(max(longitudes) + padding, 4),
        round(max(latitudes) + padding, 4),
    )


@lru_cache(maxsize=8)
def _download_drive_graph(west: float, south: float, east: float, north: float) -> nx.MultiDiGraph:
    if int(ox.__version__.split(".", 1)[0]) >= 2:
        bbox = (west, south, east, north)
        graph = ox.graph_from_bbox(bbox=bbox, network_type="drive", simplify=True)
    else:
        bbox = (north, south, east, west)
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="The expected order of coordinates in `bbox` will change",
                category=FutureWarning,
            )
            graph = ox.graph_from_bbox(bbox=bbox, network_type="drive", simplify=True)
    graph = ox.add_edge_speeds(graph)
    return ox.add_edge_travel_times(graph)


def _hazard_polygons(hazards: list[dict[str, Any]]) -> list[tuple[Polygon, dict[str, Any]]]:
    polygons = []
    for hazard in hazards:
        coordinates = hazard.get("polygon")
        if not isinstance(coordinates, list) or len(coordinates) < 3:
            continue
        polygon = Polygon(coordinates)
        if polygon.is_valid and not polygon.is_empty:
            polygons.append((polygon, hazard))
    return polygons


def _edge_line(graph: nx.MultiDiGraph, start_node: int, end_node: int, data: dict[str, Any]) -> LineString:
    geometry = data.get("geometry")
    if geometry is not None:
        return geometry
    return LineString([
        (graph.nodes[start_node]["x"], graph.nodes[start_node]["y"]),
        (graph.nodes[end_node]["x"], graph.nodes[end_node]["y"]),
    ])


def _road_access_multiplier(role: str, highway: Any) -> float:
    road_types = {highway} if isinstance(highway, str) else set(highway or [])
    if role == "supply-vehicle" and road_types & {"service", "living_street", "track"}:
        return 4.0
    if role == "firefighter" and road_types & {"track", "path"}:
        return 5.0
    if role == "ambulance" and road_types & {"service", "living_street"}:
        return 1.8
    if role == "emergency-coordinator" and road_types & {"service", "residential"}:
        return 1.4
    return 1.0


def _apply_role_weights(
    graph: nx.MultiDiGraph,
    role: str,
    hazards: list[dict[str, Any]],
) -> nx.MultiDiGraph:
    weighted = graph.copy()
    polygons = _hazard_polygons(hazards)
    blocked_edges: list[tuple[int, int, int]] = []
    for start_node, end_node, key, data in weighted.edges(keys=True, data=True):
        travel_time = float(data.get("travel_time") or max(float(data.get("length", 1)), 1) / 8.33)
        weight = travel_time * _road_access_multiplier(role, data.get("highway"))
        edge = _edge_line(weighted, start_node, end_node, data)
        blocked = False
        for polygon, hazard in polygons:
            if not edge.intersects(polygon):
                continue
            severity = hazard.get("severity", "MEDIUM")
            hazard_type = hazard.get("type", "")
            verification = str(hazard.get("verification", "")).lower()
            confirmed = "confirmed" in verification
            if confirmed and severity == "HIGH" and (
                hazard_type == "bridge-damage"
                or hazard_type == "flooding" and role in {"civilian", "ambulance", "supply-vehicle"}
                or hazard_type in {"blocked-road", "road-closure"} and role == "firefighter"
            ):
                blocked = True
                break
            severity_factor = {"LOW": 1.5, "MEDIUM": 3.0, "HIGH": 6.0}.get(severity, 3.0)
            weight += travel_time * severity_factor * ROLE_HAZARD_MULTIPLIERS[role]
        if blocked:
            blocked_edges.append((start_node, end_node, key))
        else:
            data["pathfinder_weight"] = weight
    weighted.remove_edges_from(blocked_edges)
    return weighted


def _route_coordinates(graph: nx.MultiDiGraph, nodes: list[int]) -> list[list[float]]:
    coordinates: list[list[float]] = []
    for start_node, end_node in zip(nodes, nodes[1:]):
        edges = graph.get_edge_data(start_node, end_node)
        if not edges:
            raise RoadNetworkUnavailableError("Road-network edge geometry is unavailable.")
        data = min(
            edges.values(),
            key=lambda edge: edge.get("pathfinder_weight", edge.get("travel_time", math.inf)),
        )
        edge_coordinates = list(_edge_line(graph, start_node, end_node, data).coords)
        start = (graph.nodes[start_node]["x"], graph.nodes[start_node]["y"])
        if math.dist(edge_coordinates[-1], start) < math.dist(edge_coordinates[0], start):
            edge_coordinates.reverse()
        if coordinates and edge_coordinates and coordinates[-1] == list(edge_coordinates[0]):
            edge_coordinates = edge_coordinates[1:]
        coordinates.extend([[float(longitude), float(latitude)] for longitude, latitude in edge_coordinates])
    return coordinates


def calculate_road_route(
    start: tuple[float, float],
    destination: tuple[float, float],
    role: str,
    selected_area: dict[str, float] | None,
    hazards: list[dict[str, Any]],
) -> dict[str, Any]:
    bounds = _query_bounds(start, destination, selected_area)
    west, south, east, north = bounds
    logger.info(
        "Road graph request west=%s south=%s east=%s north=%s start=%s destination=%s",
        west,
        south,
        east,
        north,
        start,
        destination,
    )
    try:
        graph = _download_drive_graph(*bounds)
    except Exception as error:
        logger.exception("Road routing failed: graph download failure")
        raise RoadNetworkUnavailableError(f"graph download failure: {error}") from error
    if not graph or graph.number_of_nodes() == 0:
        logger.error("Road routing failed: graph download returned no road nodes")
        raise RoadNetworkUnavailableError("graph download failure: no road nodes returned")
    try:
        start_node = ox.distance.nearest_nodes(graph, start[0], start[1])
    except Exception as error:
        logger.exception("Road routing failed: start node missing for coordinates=%s", start)
        raise RoadNetworkUnavailableError(f"start node missing: {error}") from error
    if start_node not in graph:
        logger.error("Road routing failed: start node missing after snapping node=%s", start_node)
        raise RoadNetworkUnavailableError("start node missing after snapping")
    try:
        destination_node = ox.distance.nearest_nodes(graph, destination[0], destination[1])
    except Exception as error:
        logger.exception("Road routing failed: destination node missing for coordinates=%s", destination)
        raise RoadNetworkUnavailableError(f"destination node missing: {error}") from error
    if destination_node not in graph:
        logger.error("Road routing failed: destination node missing after snapping node=%s", destination_node)
        raise RoadNetworkUnavailableError("destination node missing after snapping")
    try:
        normal_nodes = nx.dijkstra_path(graph, start_node, destination_node, weight="travel_time")
    except nx.NetworkXNoPath as error:
        logger.error("Road routing failed: no connected path start_node=%s destination_node=%s", start_node, destination_node)
        raise RoadNetworkUnavailableError("no connected path between snapped road nodes") from error
    except nx.NetworkXException as error:
        logger.exception("Road routing failed while calculating normal Dijkstra path")
        raise RoadNetworkUnavailableError(f"no connected path: {error}") from error

    weighted = _apply_role_weights(graph, role, hazards)
    warning = None
    try:
        nodes = nx.dijkstra_path(weighted, start_node, destination_node, weight="pathfinder_weight")
        route_graph = weighted
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        logger.warning(
            "Road routing warning: all paths blocked by confirmed hazards; using normal road route start_node=%s destination_node=%s",
            start_node,
            destination_node,
        )
        nodes = normal_nodes
        route_graph = graph
        warning = "Hazard-aware route unavailable; showing the normal road-network route for operator review."
    except nx.NetworkXException as error:
        logger.exception("Road routing failed while calculating hazard-aware Dijkstra path")
        raise RoadNetworkUnavailableError(f"hazard-aware routing failure: {error}") from error
    coordinates = _route_coordinates(route_graph, nodes)
    if len(coordinates) < 3:
        logger.error("Road routing failed: street geometry has fewer than three coordinates")
        raise RoadNetworkUnavailableError("Road-network route unavailable: insufficient street geometry.")
    distance_meters = sum(
        min(route_graph.get_edge_data(a, b).values(), key=lambda edge: edge.get("pathfinder_weight", edge.get("travel_time", math.inf))).get("length", 0)
        for a, b in zip(nodes, nodes[1:])
    )
    travel_seconds = sum(
        min(route_graph.get_edge_data(a, b).values(), key=lambda edge: edge.get("pathfinder_weight", edge.get("travel_time", math.inf))).get("travel_time", 0)
        for a, b in zip(nodes, nodes[1:])
    )
    return {
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "distanceMiles": distance_meters / 1609.344,
        "travelMinutes": max(1, round(travel_seconds / 60)),
        "warning": warning,
    }
