"""Run with: python -m unittest -v (from backend/)."""

import asyncio
import json
from datetime import date
from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

import networkx as nx
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import analyze_damage, app
from mock_data import DESTINATIONS, ROLE_PROFILES, STARTING_POINTS
from road_routing import RoadNetworkUnavailableError


class RouteAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        role_offsets = {role: index * 0.0001 for index, role in enumerate(ROLE_PROFILES, start=1)}
        self.route_patcher = patch("main.calculate_road_route", side_effect=lambda start, destination, role, _area, _hazards: {
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    list(start),
                    [(start[0] + destination[0]) / 2 + role_offsets[role], (start[1] + destination[1]) / 2],
                    list(destination),
                ],
            },
            "distanceMiles": 3.25,
            "travelMinutes": 9,
            "warning": None,
        })
        self.route_patcher.start()
        self.addCleanup(self.route_patcher.stop)
        self.request = {
            "startingPoint": "blacksburg-fire-station",
            "destination": "lewisgale-hospital",
            "responderType": "ambulance",
        }

    def test_all_supported_journeys_and_roles(self):
        for start in STARTING_POINTS:
            for destination in DESTINATIONS:
                for role in ROLE_PROFILES:
                    with self.subTest(start=start, destination=destination, role=role):
                        request = dict(startingPoint=start, destination=destination, responderType=role)
                        response = self.client.post("/api/analyze-route", json=request)
                        self.assertEqual(response.status_code, 200)
                        body = response.json()
                        self.assertEqual(body["dataSource"], "road-network")
                        for key, value in request.items():
                            self.assertEqual(body[key], value)
                        recommendation = body["recommendation"]
                        self.assertEqual(recommendation["role"], role)
                        self.assertEqual(
                            recommendation["recommendedDestination"],
                            DESTINATIONS[destination]["name"],
                        )
                        self.assertEqual(recommendation["risk"], ROLE_PROFILES[role]["risk"])
                        self.assertEqual(recommendation["routeName"], ROLE_PROFILES[role]["routeName"])
                        self.assertEqual(recommendation["travelTime"], "9 min")
                        self.assertEqual(recommendation["distance"], "3.2 mi")
                        self.assertEqual(recommendation["confidence"], ROLE_PROFILES[role]["confidence"])
                        self.assertEqual(recommendation["hazardsAvoided"], ROLE_PROFILES[role]["hazardsAvoided"])
                        self.assertIsInstance(recommendation["hazardsAvoided"], list)
                        self.assertNotIn("hazards_avoided", recommendation)
                        self.assertEqual(recommendation["alternative"], ROLE_PROFILES[role]["alternative"])
                        self.assertIn(DESTINATIONS[destination]["name"], recommendation["explanation"])
                        self.assertIn("Dijkstra routing follows OpenStreetMap", recommendation["explanation"])
                        self.assertEqual(body["route"]["geometry"]["coordinates"][0], list(STARTING_POINTS[start]["coordinates"]))
                        self.assertEqual(
                            body["route"]["geometry"]["coordinates"][-1],
                            list(DESTINATIONS[destination]["coordinates"]),
                        )

    def test_roles_produce_distinct_recommendation_profiles(self):
        results = {}
        for role in ROLE_PROFILES:
            response = self.client.post(
                "/api/analyze-route",
                json={**self.request, "responderType": role},
            )
            results[role] = response.json()

        self.assertEqual(set(results), set(ROLE_PROFILES))
        recommendations = [result["recommendation"] for result in results.values()]
        distinct_fields = [
            "routeName",
            "confidence",
            "hazardsAvoided",
            "explanation",
            "alternative",
        ]
        for field in distinct_fields:
            with self.subTest(field=field):
                values = [str(recommendation[field]) for recommendation in recommendations]
                self.assertEqual(len(set(values)), len(ROLE_PROFILES))

        risk_profiles = {
            (recommendation["risk"], recommendation["confidence"])
            for recommendation in recommendations
        }
        self.assertEqual(len(risk_profiles), len(ROLE_PROFILES))
        geometries = {str(result["route"]["geometry"]["coordinates"]) for result in results.values()}
        self.assertEqual(len(geometries), len(ROLE_PROFILES))

        self.assertEqual(results["civilian"]["recommendation"]["recommendedDestination"], "LewisGale Hospital Montgomery")
        self.assertEqual(results["ambulance"]["recommendation"]["recommendedDestination"], "LewisGale Hospital Montgomery")
        self.assertEqual(results["firefighter"]["recommendation"]["recommendedDestination"], "LewisGale Hospital Montgomery")
        self.assertEqual(results["supply-vehicle"]["recommendation"]["routeName"], "Heavy Vehicle Supply Route")
        self.assertEqual(results["emergency-coordinator"]["recommendation"]["risk"], "MEDIUM")

    def test_missing_fixture_hazards_returns_empty_camel_case_array(self):
        profile = ROLE_PROFILES["civilian"]
        hazards_avoided = profile.pop("hazardsAvoided")
        try:
            response = self.client.post(
                "/api/analyze-route",
                json={**self.request, "responderType": "civilian"},
            )
        finally:
            profile["hazardsAvoided"] = hazards_avoided

        self.assertEqual(response.status_code, 200)
        recommendation = response.json()["recommendation"]
        self.assertEqual(recommendation["hazardsAvoided"], [])
        self.assertNotIn("hazards_avoided", recommendation)

    def test_selected_area_hazards_are_included_in_route_explanation(self):
        request = {
            **self.request,
            "selectedArea": {"west": -80.45, "south": 37.20, "east": -80.40, "north": 37.25},
            "detectedHazards": [{
                "id": "demo-flood",
                "name": "Potential Flooded Road Segment",
                "type": "flooding",
                "severity": "HIGH",
                "confidence": 88,
                "affectedInfrastructure": ["Primary road access"],
            }],
        }
        response = self.client.post("/api/analyze-route", json=request)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["selectedArea"], request["selectedArea"])
        self.assertEqual(body["detectedHazards"][0]["id"], request["detectedHazards"][0]["id"])
        self.assertIsNone(body["detectedHazards"][0]["polygon"])
        self.assertIn("Potential Flooded Road Segment", body["recommendation"]["hazardsAvoided"])
        self.assertIn("demo hazards detected in the selected area", body["recommendation"]["explanation"])
        self.assertIn("-80.4500, 37.2000 to -80.4000, 37.2500", body["recommendation"]["explanation"])

    def test_rejects_invalid_requests(self):
        invalid_requests = [
            {},
            {**self.request, "startingPoint": "unknown"},
            {**self.request, "destination": "blacksburg-fire-station"},
            {**self.request, "responderType": "pilot"},
            {**self.request, "startingPoint": [0, 0]},
            {**self.request, "destination": None},
            {**self.request, "unexpected": True},
        ]
        for request in invalid_requests:
            with self.subTest(request=request):
                self.assertEqual(self.client.post("/api/analyze-route", json=request).status_code, 422)

    def test_malformed_json_and_wrong_method(self):
        response = self.client.post("/api/analyze-route", content="{", headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/analyze-route").status_code, 405)

    def test_coordinate_places_use_backend_road_routing(self):
        response = self.client.post("/api/analyze-route", json={
            "startingPoint": {"name": "Selected start", "longitude": -80.42, "latitude": 37.23},
            "destination": {"name": "Selected hospital", "longitude": -80.40, "latitude": 37.21},
            "responderType": "ambulance",
        })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["recommendation"]["recommendedDestination"], "Selected hospital")
        self.assertGreater(len(body["route"]["geometry"]["coordinates"]), 2)

    def test_road_network_failure_returns_clear_503(self):
        with patch("main.calculate_road_route", side_effect=RoadNetworkUnavailableError("offline")):
            response = self.client.post("/api/analyze-route", json=self.request)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Road-network route unavailable.")

    def test_hazard_aware_fallback_warning_is_returned(self):
        with patch("main.calculate_road_route", return_value={
            "geometry": {
                "type": "LineString",
                "coordinates": [[-80.42, 37.23], [-80.41, 37.22], [-80.40, 37.21]],
            },
            "distanceMiles": 2.0,
            "travelMinutes": 7,
            "warning": "Hazard-aware route unavailable; showing the normal road-network route for operator review.",
        }):
            response = self.client.post("/api/analyze-route", json=self.request)
        self.assertEqual(response.status_code, 200)
        self.assertIn("Hazard-aware route unavailable", response.json()["recommendation"]["warning"])

    def test_mock_satellite_imagery_returns_manual_fallback_for_exact_bbox(self):
        request = {
            "bbox": [-80.43, 37.20, -80.39, 37.25],
            "beforeDate": "2026-08-01",
            "afterDate": "2026-08-05",
        }
        with patch.dict("os.environ", {"SATELLITE_IMAGERY_PROVIDER": "mock"}):
            response = self.client.post("/api/satellite-imagery", json=request)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["provider"], "mock")
        self.assertEqual(body["status"], "fallback")
        self.assertEqual(body["bbox"], request["bbox"])
        self.assertIsNone(body["before"])
        self.assertIsNone(body["after"])
        self.assertTrue(body["manualUploadRecommended"])
        self.assertEqual(body["failure"]["code"], "no_candidate_scene")

    @patch("satellite_imagery._render_scene", return_value=(b"\x89PNG\r\n\x1a\npreview", "image/png"))
    @patch("satellite_imagery._search_scenes")
    @patch("satellite_imagery._access_token", return_value="token")
    def test_sentinel_returns_low_cloud_live_previews(self, _token, search_scene, render_scene):
        bbox = [-80.43, 37.20, -80.39, 37.25]
        search_scene.side_effect = [
            ([{"id": "before-scene", "properties": {"datetime": "2026-07-30T15:40:00Z", "eo:cloud_cover": 6.5}}], 8, False),
            ([{"id": "after-scene", "properties": {"datetime": "2026-08-06T15:40:00Z", "eo:cloud_cover": 9.0}}], 6, False),
        ]
        with patch.dict("os.environ", {"SATELLITE_IMAGERY_PROVIDER": "sentinel-2"}):
            response = self.client.post(
                "/api/satellite-imagery",
                json={"bbox": bbox, "beforeDate": "2026-08-01", "afterDate": "2026-08-05"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["provider"], "sentinel-2")
        self.assertEqual(body["status"], "available")
        self.assertEqual(body["before"]["source"], "Copernicus Sentinel-2")
        self.assertEqual(body["before"]["captureDate"], "2026-07-30T15:40:00Z")
        self.assertEqual(body["before"]["cloudCoverage"], 6.5)
        self.assertEqual(body["before"]["candidateCount"], 8)
        self.assertEqual(body["before"]["selectionStatus"], "automatic")
        self.assertEqual(body["before"]["dataMode"], "live")
        self.assertRegex(body["before"]["imageUrl"], r"^/api/satellite-imagery/preview/[a-f0-9]{32}$")
        self.assertEqual(render_scene.call_count, 2)
        self.assertFalse(body["manualUploadRecommended"])
        self.assertTrue(body["comparisonReady"])
        self.assertIsNone(body["failure"])

    @patch("satellite_imagery._render_scene", return_value=(b"\x89PNG\r\n\x1a\npreview", "image/png"))
    @patch("satellite_imagery._search_scenes")
    @patch("satellite_imagery._access_token", return_value="token")
    def test_higher_cloud_pair_requires_explicit_selection(self, _token, search_scene, _render_scene):
        scene = {"id": "cloudy-scene", "properties": {"datetime": "2026-08-03T15:40:00Z", "eo:cloud_cover": 55.0}}
        after_scene = {"id": "cloudy-after", "properties": {"datetime": "2026-08-06T15:40:00Z", "eo:cloud_cover": 55.0}}
        search_scene.side_effect = [([scene], 4, True), ([after_scene], 5, True)]
        with patch.dict("os.environ", {"SATELLITE_IMAGERY_PROVIDER": "sentinel-2"}):
            response = self.client.post("/api/satellite-imagery", json={
                "bbox": [-80.43, 37.20, -80.39, 37.25],
                "beforeDate": "2026-08-01",
                "afterDate": "2026-08-05",
            })
        body = response.json()
        self.assertEqual(body["status"], "selection-required")
        self.assertEqual(body["before"]["selectionStatus"], "higher-cloud-option")
        self.assertTrue(body["manualUploadRecommended"])
        self.assertIn("verification limited", body["message"])

    @patch("satellite_imagery._search_scenes")
    @patch("satellite_imagery._access_token", return_value="token")
    def test_comparison_unavailable_when_distinct_after_scene_is_missing(self, _token, search_scenes):
        before = {"id": "only-scene", "properties": {"datetime": "2026-08-01T15:40:00Z", "eo:cloud_cover": 8.0}}
        search_scenes.side_effect = [([before], 1, False), ([], 1, False)]
        response = self.client.post("/api/satellite-imagery", json={
            "bbox": [-80.43, 37.20, -80.39, 37.25],
            "beforeDate": "2026-08-01",
            "afterDate": "2026-08-05",
        })
        body = response.json()
        self.assertEqual(body["status"], "unavailable")
        self.assertIsNone(body["before"])
        self.assertIsNone(body["after"])
        self.assertIn("No usable Sentinel-2 scene", body["message"])
        self.assertEqual(body["failure"]["code"], "no_candidate_scene")

    @patch("satellite_imagery._search_scenes")
    @patch("satellite_imagery._access_token", return_value="token")
    def test_same_scene_is_rejected_with_structured_failure(self, _token, search_scenes):
        scene = {"id": "duplicate-scene", "properties": {"datetime": "2026-08-06T15:40:00Z", "eo:cloud_cover": 8.0}}
        search_scenes.side_effect = [([scene], 1, False), ([scene], 1, False)]
        response = self.client.post("/api/satellite-imagery", json={
            "bbox": [-80.43, 37.20, -80.39, 37.25],
            "beforeDate": "2026-08-01",
            "afterDate": "2026-08-05",
        })
        self.assertEqual(response.json()["failure"]["code"], "same_scene_rejected")

    @patch("satellite_imagery._render_scene")
    @patch("satellite_imagery._search_scenes")
    @patch("satellite_imagery._access_token", return_value="token")
    def test_preview_fetch_failure_is_structured(self, _token, search_scenes, render_scene):
        from satellite_imagery import ProviderUnavailableError

        search_scenes.side_effect = [
            ([{"id": "before", "properties": {"datetime": "2026-07-30T15:40:00Z", "eo:cloud_cover": 5}}], 1, False),
            ([{"id": "after", "properties": {"datetime": "2026-08-06T15:40:00Z", "eo:cloud_cover": 5}}], 1, False),
        ]
        render_scene.side_effect = ProviderUnavailableError(
            "preview_image_fetch_failed", "preview-fetch", "Provider returned HTTP 503."
        )
        response = self.client.post("/api/satellite-imagery", json={
            "bbox": [-80.43, 37.20, -80.39, 37.25],
            "beforeDate": "2026-08-01",
            "afterDate": "2026-08-05",
        })
        self.assertEqual(response.json()["failure"]["code"], "preview_image_fetch_failed")

    @patch("satellite_imagery._cache_preview")
    @patch("satellite_imagery._render_scene", return_value=(b"image", "image/png"))
    @patch("satellite_imagery._search_scenes")
    @patch("satellite_imagery._access_token", return_value="token")
    def test_preview_url_generation_failure_is_structured(self, _token, search_scenes, _render, cache_preview):
        from satellite_imagery import ProviderUnavailableError

        search_scenes.side_effect = [
            ([{"id": "before", "properties": {"datetime": "2026-07-30T15:40:00Z", "eo:cloud_cover": 5}}], 1, False),
            ([{"id": "after", "properties": {"datetime": "2026-08-06T15:40:00Z", "eo:cloud_cover": 5}}], 1, False),
        ]
        cache_preview.side_effect = ProviderUnavailableError(
            "preview_url_generation_failed", "preview-cache", "A temporary preview URL could not be generated."
        )
        response = self.client.post("/api/satellite-imagery", json={
            "bbox": [-80.43, 37.20, -80.39, 37.25],
            "beforeDate": "2026-08-01",
            "afterDate": "2026-08-05",
        })
        self.assertEqual(response.json()["failure"]["code"], "preview_url_generation_failed")

    @patch("satellite_imagery._request_json")
    def test_scene_search_applies_before_chronology_in_catalog_window(self, request_json):
        from satellite_imagery import _search_scenes

        request_json.return_value = {"features": [
            {"id": "near-cloudy", "properties": {"datetime": "2026-08-10T12:00:00Z", "eo:cloud_cover": 20}},
            {"id": "far-clear", "properties": {"datetime": "2026-08-01T12:00:00Z", "eo:cloud_cover": 5}},
            {"id": "near-clear", "properties": {"datetime": "2026-08-09T12:00:00Z", "eo:cloud_cover": 5}},
        ]}
        scenes, count, needs_confirmation = _search_scenes(
            "token", [-80.43, 37.20, -80.39, 37.25],
            date(2026, 8, 10), date(2026, 8, 20), "before", 14, 40
        )
        payload = request_json.call_args.args[1]
        self.assertEqual(payload["datetime"], "2026-07-27T00:00:00Z/2026-08-19T23:59:59Z")
        self.assertEqual(scenes[0]["id"], "near-clear")
        self.assertEqual(count, 3)
        self.assertFalse(needs_confirmation)

    @patch("satellite_imagery.logger.info")
    @patch("satellite_imagery._request_json")
    def test_known_good_blacksburg_dates_keep_after_scenes_inside_catalog_query(self, request_json, log_info):
        from satellite_imagery import _search_scenes

        bbox = [-80.43, 37.20, -80.39, 37.25]
        before_scene = {
            "id": "known-before",
            "properties": {"datetime": "2026-01-04T16:13:22.446Z", "eo:cloud_cover": 4.0},
        }
        after_scene = {
            "id": "known-after",
            "properties": {"datetime": "2026-09-14T16:23:09.795Z", "eo:cloud_cover": 7.0},
        }
        request_json.side_effect = [{"features": [before_scene]}, {"features": [after_scene]}]

        before, before_count, _ = _search_scenes(
            "token", bbox, date(2026, 1, 1), date(2026, 9, 1), "before", 14, 40
        )
        after, after_count, _ = _search_scenes(
            "token", bbox, date(2026, 9, 1), date(2026, 9, 1), "after", 14, 40,
            {before_scene["id"]}, {before_scene["properties"]["datetime"]},
        )

        before_payload = request_json.call_args_list[0].args[1]
        after_payload = request_json.call_args_list[1].args[1]
        self.assertEqual(before_payload["bbox"], bbox)
        self.assertEqual(after_payload["bbox"], bbox)
        self.assertEqual(before_payload["collections"], ["sentinel-2-l2a"])
        self.assertEqual(after_payload["collections"], ["sentinel-2-l2a"])
        self.assertEqual(before_payload["datetime"], "2025-12-18T00:00:00Z/2026-01-15T23:59:59Z")
        self.assertEqual(after_payload["datetime"], "2026-09-01T00:00:00Z/2026-09-15T23:59:59Z")
        self.assertEqual(before[0]["properties"]["datetime"], "2026-01-04T16:13:22.446Z")
        self.assertEqual(after[0]["properties"]["datetime"], "2026-09-14T16:23:09.795Z")
        self.assertEqual((before_count, after_count), (1, 1))
        outbound_logs = [call for call in log_info.call_args_list if "outbound STAC query" in call.args[0]]
        self.assertEqual(len(outbound_logs), 2)
        self.assertEqual(outbound_logs[1].args[1:], (
            "after", bbox, "2026-09-01T00:00:00Z/2026-09-15T23:59:59Z", ["sentinel-2-l2a"], 100,
        ))

    @patch("satellite_imagery._access_token")
    def test_missing_credentials_returns_clear_manual_fallback(self, access_token):
        from satellite_imagery import ProviderUnavailableError

        access_token.side_effect = ProviderUnavailableError(
            "provider_authentication_failed", "authentication", "Copernicus credentials are missing"
        )
        with patch.dict("os.environ", {"SATELLITE_IMAGERY_PROVIDER": "sentinel-2"}):
            response = self.client.post(
                "/api/satellite-imagery",
                json={"bbox": [-80.43, 37.20, -80.39, 37.25], "beforeDate": "2026-08-01", "afterDate": "2026-08-05"},
            )
        body = response.json()
        self.assertEqual(body["status"], "unavailable")
        self.assertIsNone(body["before"])
        self.assertIsNone(body["after"])
        self.assertTrue(body["manualUploadRecommended"])
        self.assertIn("manual", body["message"].lower())
        self.assertEqual(body["failure"]["code"], "provider_authentication_failed")

    def test_next_config_proxies_satellite_search_and_preview(self):
        config = (Path(__file__).parents[1] / "frontend" / "next.config.ts").read_text(encoding="utf-8")
        self.assertIn('source: "/api/satellite-imagery"', config)
        self.assertIn('source: "/api/satellite-imagery/preview/:path*"', config)
        self.assertIn('destination: `${normalizedBackendUrl}/api/satellite-imagery/preview/:path*`', config)
        self.assertIn('source: "/api/analyze-flood"', config)
        self.assertIn('destination: `${normalizedBackendUrl}/api/analyze-flood`', config)
        self.assertIn('source: "/api/flood-analysis/mask/:path*"', config)
        self.assertIn('source: "/api/fire-hotspots"', config)
        self.assertIn('destination: `${normalizedBackendUrl}/api/fire-hotspots`', config)

    @patch("satellite_imagery.urlopen")
    def test_process_api_renders_exact_scene_as_ten_meter_png_preview(self, urlopen):
        from satellite_imagery import PROCESS_URL, _cache_preview, _render_scene

        png_bytes = b"\x89PNG\r\n\x1a\nrendered-sentinel"
        provider_response = MagicMock()
        provider_response.status = 200
        provider_response.getcode.return_value = 200
        provider_response.headers.get_content_type.return_value = "image/png"
        provider_response.read.return_value = png_bytes
        provider_response.__enter__.return_value = provider_response
        urlopen.return_value = provider_response
        bbox = [-80.43, 37.20, -80.39, 37.25]
        scene_id = "S2-known-scene"
        capture_time = "2026-09-14T16:23:09.795Z"

        rendered, content_type = _render_scene("token", bbox, scene_id, capture_time, 40)

        provider_request = urlopen.call_args.args[0]
        payload = json.loads(provider_request.data)
        self.assertEqual(provider_request.full_url, PROCESS_URL)
        self.assertEqual(provider_request.headers["Accept"], "image/png")
        self.assertEqual(payload["input"]["data"][0]["type"], "sentinel-2-l2a")
        self.assertEqual(payload["input"]["data"][0]["dataFilter"]["timeRange"], {
            "from": "2026-09-14T16:22:39.795Z",
            "to": "2026-09-14T16:23:39.795Z",
        })
        self.assertEqual(payload["output"]["resx"], 10)
        self.assertEqual(payload["output"]["resy"], 10)
        self.assertEqual(payload["output"]["responses"][0]["format"]["type"], "image/png")
        self.assertIn('input:["B04","B03","B02"]', payload["evalscript"])
        self.assertEqual(content_type, "image/png")
        self.assertEqual(rendered, png_bytes)

        preview_url = _cache_preview(rendered, content_type, bbox, scene_id, capture_time)
        preview_response = self.client.get(preview_url)
        self.assertEqual(preview_response.status_code, 200)
        self.assertEqual(preview_response.headers["content-type"], "image/png")
        self.assertEqual(preview_response.content, png_bytes)

    def test_satellite_imagery_rejects_invalid_bounds_dates_and_fields(self):
        invalid_requests = [
            {"bbox": [-80.39, 37.20, -80.43, 37.25]},
            {"bbox": [-181, 37.20, -80.39, 37.25]},
            {"bbox": [-80.43, 37.20, -80.39]},
            {"bbox": [-80.43, 37.20, -80.39, 37.25], "beforeDate": "2026-08-05", "afterDate": "2026-08-01"},
            {"bbox": [-80.43, 37.20, -80.39, 37.25], "beforeDate": "1999-08-05", "afterDate": "2026-08-01"},
            {"bbox": [-80.43, 37.20, -80.39, 37.25], "unexpected": True},
        ]
        for request in invalid_requests:
            with self.subTest(request=request):
                self.assertEqual(self.client.post("/api/satellite-imagery", json=request).status_code, 422)


class RoadRoutingTests(unittest.TestCase):
    def test_query_bounds_include_route_endpoints_selected_area_and_padding(self):
        from road_routing import _query_bounds

        west, south, east, north = _query_bounds(
            (-81.0, 38.0),
            (-79.0, 36.0),
            {"west": -80.5, "south": 36.5, "east": -80.0, "north": 37.5},
        )

        self.assertGreater(north, 38.0)
        self.assertLess(south, 36.0)
        self.assertGreater(east, -79.0)
        self.assertLess(west, -81.0)

    @patch("road_routing.ox.simplification.simplify_graph")
    @patch("road_routing.ox.truncate.largest_component")
    @patch("road_routing.ox.truncate.truncate_graph_polygon")
    @patch("road_routing._create_graph")
    @patch("road_routing.requests.post")
    def test_bounded_overpass_query_uses_correct_coordinate_order(
        self, post, create_graph, truncate_graph, largest_component, simplify_graph
    ):
        from road_routing import _download_overpass_graph

        response = MagicMock()
        response.json.return_value = {
            "elements": [
                {"type": "node", "id": 1, "lat": 37.0, "lon": -80.0},
                {"type": "node", "id": 2, "lat": 37.1, "lon": -79.9},
                {"type": "way", "id": 10, "nodes": [1, 2], "tags": {"highway": "primary"}},
                {"type": "way", "id": 11, "nodes": [2, 3], "tags": {"highway": "service"}},
            ]
        }
        post.return_value = response
        graph = nx.MultiDiGraph()
        create_graph.return_value = graph
        truncate_graph.return_value = graph
        largest_component.return_value = graph
        simplify_graph.return_value = graph

        result = _download_overpass_graph(
            "https://overpass.example/api", -81.0, 36.0, -79.0, 38.0, 12
        )

        self.assertIs(result, graph)
        request = post.call_args
        self.assertEqual(request.args[0], "https://overpass.example/api/interpreter")
        self.assertEqual(request.kwargs["timeout"], 12)
        self.assertIn("(36.0,-81.0,38.0,-79.0)", request.kwargs["data"]["data"])
        response.raise_for_status.assert_called_once_with()
        forwarded_elements = create_graph.call_args.args[0][0]["elements"]
        self.assertEqual([element["id"] for element in forwarded_elements], [1, 2, 10])

    @patch("road_routing.ox.add_edge_travel_times")
    @patch("road_routing.ox.add_edge_speeds")
    @patch("road_routing._download_overpass_graph")
    def test_download_retries_the_next_overpass_endpoint(
        self, download_overpass_graph, add_edge_speeds, add_edge_travel_times
    ):
        from road_routing import _download_drive_graph

        graph = nx.MultiDiGraph()
        download_overpass_graph.side_effect = [ConnectionError("first endpoint unavailable"), graph]
        add_edge_speeds.return_value = graph
        add_edge_travel_times.return_value = graph
        _download_drive_graph.cache_clear()

        with patch.dict("os.environ", {
            "OSMNX_OVERPASS_URLS": "https://first.example/api,https://second.example/api",
            "OSMNX_REQUEST_TIMEOUT_SECONDS": "12",
        }):
            with self.assertLogs("road_routing", level="WARNING") as logs:
                result = _download_drive_graph(-81.0, 36.0, -79.0, 38.0)

        self.assertIs(result, graph)
        self.assertEqual(download_overpass_graph.call_count, 2)
        self.assertEqual(
            [call.args[0] for call in download_overpass_graph.call_args_list],
            ["https://first.example/api", "https://second.example/api"],
        )
        self.assertTrue(any("endpoint=1/2" in line for line in logs.output))

    @patch("road_routing.ox.distance.nearest_nodes", side_effect=[1, 3])
    @patch("road_routing._download_drive_graph")
    def test_dijkstra_returns_street_geometry_and_avoids_high_risk_polygon(self, download_graph, _nearest):
        from road_routing import calculate_road_route

        graph = nx.MultiDiGraph()
        graph.add_node(1, x=-80.42, y=37.23)
        graph.add_node(2, x=-80.41, y=37.225)
        graph.add_node(3, x=-80.40, y=37.21)
        graph.add_node(4, x=-80.41, y=37.22)
        graph.add_edge(1, 4, length=500, travel_time=40, highway="primary")
        graph.add_edge(4, 3, length=500, travel_time=40, highway="primary")
        graph.add_edge(1, 2, length=700, travel_time=60, highway="secondary")
        graph.add_edge(2, 3, length=700, travel_time=60, highway="secondary")
        download_graph.return_value = graph
        hazard = {
            "type": "flooding",
            "severity": "HIGH",
            "selected": True,
            "polygon": [
                [-80.411, 37.219], [-80.409, 37.219], [-80.409, 37.221],
                [-80.411, 37.221], [-80.411, 37.219],
            ],
        }

        result = calculate_road_route(
            (-80.42, 37.23), (-80.40, 37.21), "civilian", None, [hazard]
        )

        coordinates = result["geometry"]["coordinates"]
        self.assertEqual(result["geometry"]["type"], "LineString")
        self.assertGreater(len(coordinates), 2)
        self.assertIn([-80.41, 37.225], coordinates)
        self.assertNotEqual(coordinates, [[-80.42, 37.23], [-80.40, 37.21]])

    @patch("road_routing.ox.distance.nearest_nodes", side_effect=[1, 3])
    @patch("road_routing._download_drive_graph")
    def test_confirmed_hazard_block_falls_back_to_normal_road_route(self, download_graph, _nearest):
        from road_routing import calculate_road_route

        graph = nx.MultiDiGraph()
        graph.add_node(1, x=-80.42, y=37.23)
        graph.add_node(2, x=-80.41, y=37.22)
        graph.add_node(3, x=-80.40, y=37.21)
        graph.add_edge(1, 2, length=500, travel_time=40, highway="primary")
        graph.add_edge(2, 3, length=500, travel_time=40, highway="primary")
        download_graph.return_value = graph
        hazard = {
            "type": "bridge-damage",
            "severity": "HIGH",
            "verification": "Confirmed by operator",
            "polygon": [
                [-80.411, 37.219], [-80.409, 37.219], [-80.409, 37.221],
                [-80.411, 37.221], [-80.411, 37.219],
            ],
        }

        with self.assertLogs("road_routing", level="WARNING") as logs:
            result = calculate_road_route(
                (-80.42, 37.23), (-80.40, 37.21), "ambulance", None, [hazard]
            )

        self.assertGreater(len(result["geometry"]["coordinates"]), 2)
        self.assertIn("Hazard-aware route unavailable", result["warning"])
        self.assertTrue(any("all paths blocked by confirmed hazards" in line for line in logs.output))


class DamageAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.bounds = {
            "west": "-80.45",
            "south": "37.20",
            "east": "-80.40",
            "north": "37.25",
        }

    def files(self, before_type="image/jpeg", after_type="image/jpeg"):
        return {
            "before_image": ("before.jpg", b"before-metadata-test", before_type),
            "after_image": ("after.jpg", b"after-metadata-test", after_type),
        }

    def test_valid_multipart_request_returns_receipt(self):
        response = self.client.post("/analyze-damage", data=self.bounds, files=self.files())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "received",
            "message": "Imagery received successfully.",
            "before_filename": "before.jpg",
            "after_filename": "after.jpg",
            "before_content_type": "image/jpeg",
            "after_content_type": "image/jpeg",
            "bounds": {
                "west": -80.45,
                "south": 37.20,
                "east": -80.40,
                "north": 37.25,
            },
            "analysisPrepared": False,
            "analysisMessage": None,
            "analysisRasters": [],
        })

    @patch("main.prepare_analysis_raster")
    def test_valid_sentinel_references_prepare_compatible_rasters(self, prepare_raster):
        from satellite_imagery import _cache_preview

        bbox = [-80.45, 37.2, -80.4, 37.25]
        before_url = _cache_preview(b"before", "image/jpeg", bbox, "before-scene", "2026-08-01T15:40:00Z")
        after_url = _cache_preview(b"after", "image/jpeg", bbox, "after-scene", "2026-08-05T15:40:00Z")
        base_raster = {
            "bbox": tuple(bbox),
            "crs": "OGC:CRS84",
            "width": 512,
            "height": 512,
            "bandNames": ["B04", "B03", "B02", "dataMask"],
            "sampleType": "UINT16",
            "estimatedResolutionMeters": 10.0,
            "byteSize": 1024,
            "storage": "temporary-memory",
        }
        prepare_raster.side_effect = [
            {**base_raster, "sceneId": "before-scene", "captureDate": "2026-08-01T15:40:00Z"},
            {**base_raster, "sceneId": "after-scene", "captureDate": "2026-08-05T15:40:00Z"},
        ]
        response = self.client.post("/analyze-damage/satellite", json={
            "beforeImageUrl": before_url,
            "afterImageUrl": after_url,
            "beforeSceneId": "before-scene",
            "afterSceneId": "after-scene",
            "beforeCaptureDate": "2026-08-01T15:40:00Z",
            "afterCaptureDate": "2026-08-05T15:40:00Z",
            "afterTargetDate": "2026-08-05",
            "bbox": bbox,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Sentinel-2 analysis rasters prepared successfully.")
        self.assertTrue(response.json()["analysisPrepared"])
        self.assertEqual(len(response.json()["analysisRasters"]), 2)
        self.assertEqual(response.json()["bounds"], {
            "west": -80.45,
            "south": 37.2,
            "east": -80.4,
            "north": 37.25,
        })

    def test_satellite_preview_returns_cached_image_bytes_and_headers(self):
        from satellite_imagery import _cache_preview

        image_bytes = b"\x89PNG\r\n\x1a\npreview"
        preview_url = _cache_preview(
            image_bytes,
            "image/png",
            [-80.45, 37.2, -80.4, 37.25],
            "preview-scene",
            "2026-08-01T15:40:00Z",
        )
        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, image_bytes)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertIn("private", response.headers["cache-control"])
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_satellite_preview_returns_404_for_missing_or_expired_id(self):
        response = self.client.get(f"/api/satellite-imagery/preview/{'f' * 32}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Sentinel-2 preview expired or is unavailable.")
        from satellite_imagery import _cache_preview, _preview_cache

        preview_url = _cache_preview(
            b"expired", "image/jpeg", [-80.45, 37.2, -80.4, 37.25],
            "expired-scene", "2026-08-01T15:40:00Z",
        )
        preview_id = preview_url.rsplit("/", 1)[-1]
        cached = _preview_cache[preview_id]
        _preview_cache[preview_id] = (0, *cached[1:])
        self.assertEqual(self.client.get(preview_url).status_code, 404)

    def test_satellite_analysis_rejects_foreign_or_mismatched_urls(self):
        request = {
            "beforeImageUrl": "https://example.com/before.jpg",
            "afterImageUrl": "https://example.com/after.jpg",
            "bbox": [-80.45, 37.2, -80.4, 37.25],
        }
        self.assertEqual(self.client.post("/analyze-damage/satellite", json=request).status_code, 422)

    def test_negative_coordinates_are_valid_when_normalized(self):
        response = self.client.post(
            "/analyze-damage",
            data={"west": "-70", "south": "-12", "east": "-60", "north": "-10"},
            files=self.files(before_type="image/png", after_type="image/webp"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["bounds"], {
            "west": -70.0,
            "south": -12.0,
            "east": -60.0,
            "north": -10.0,
        })

    def test_rejects_reversed_or_zero_span_bounds(self):
        invalid_bounds = [
            {**self.bounds, "east": self.bounds["west"]},
            {**self.bounds, "east": "-80.50"},
            {**self.bounds, "north": self.bounds["south"]},
            {**self.bounds, "north": "37.10"},
        ]
        for bounds in invalid_bounds:
            with self.subTest(bounds=bounds):
                response = self.client.post("/analyze-damage", data=bounds, files=self.files())
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json(), {"detail": "Invalid disaster-area bounds."})

    def test_rejects_unsupported_image_types_independently(self):
        before_response = self.client.post(
            "/analyze-damage",
            data=self.bounds,
            files=self.files(before_type="application/pdf"),
        )
        after_response = self.client.post(
            "/analyze-damage",
            data=self.bounds,
            files=self.files(after_type="text/plain"),
        )

        self.assertEqual(before_response.status_code, 400)
        self.assertEqual(before_response.json(), {"detail": "Unsupported Before image type."})
        self.assertEqual(after_response.status_code, 400)
        self.assertEqual(after_response.json(), {"detail": "Unsupported After image type."})

    def test_missing_invalid_fields_and_wrong_method(self):
        self.assertEqual(self.client.post("/analyze-damage", data=self.bounds).status_code, 422)
        self.assertEqual(
            self.client.post(
                "/analyze-damage",
                data={**self.bounds, "west": "not-a-number"},
                files=self.files(),
            ).status_code,
            422,
        )
        self.assertEqual(self.client.get("/analyze-damage").status_code, 405)

    def test_upload_handles_close_on_success_and_validation_failures(self):
        cases = [
            ("image/jpeg", "image/jpeg", (-80.45, 37.20, -80.40, 37.25), False),
            ("image/jpeg", "image/jpeg", (-80.40, 37.20, -80.45, 37.25), True),
            ("application/pdf", "image/jpeg", (-80.45, 37.20, -80.40, 37.25), True),
            ("image/jpeg", "text/plain", (-80.45, 37.20, -80.40, 37.25), True),
        ]
        for before_type, after_type, bounds, raises in cases:
            with self.subTest(before_type=before_type, after_type=after_type, bounds=bounds):
                before = UploadFile(
                    BytesIO(b"before"),
                    filename="before.jpg",
                    headers=Headers({"content-type": before_type}),
                )
                after = UploadFile(
                    BytesIO(b"after"),
                    filename="after.jpg",
                    headers=Headers({"content-type": after_type}),
                )
                request = analyze_damage(
                    before_image=before,
                    after_image=after,
                    west=bounds[0],
                    south=bounds[1],
                    east=bounds[2],
                    north=bounds[3],
                )
                if raises:
                    with self.assertRaises(HTTPException):
                        asyncio.run(request)
                else:
                    asyncio.run(request)
                self.assertTrue(before.file.closed)
                self.assertTrue(after.file.closed)


if __name__ == "__main__":
    unittest.main()
