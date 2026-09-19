"""Minimal mock route-analysis API. No live routing or AI inference is performed."""

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from mock_data import DESTINATIONS, ROLE_PROFILES, STARTING_POINTS

ResponderMode = Literal[
    "civilian", "ambulance", "firefighter", "supply-vehicle", "emergency-coordinator"
]
StartingPoint = Literal["blacksburg-fire-station", "virginia-tech-rescue"]
Destination = Literal["lewisgale-hospital", "blacksburg-shelter"]
Coordinates = tuple[float, float]


class RouteAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startingPoint: StartingPoint
    destination: Destination
    responderType: ResponderMode


class RouteRecommendation(BaseModel):
    role: ResponderMode
    routeName: str
    travelTime: str
    distance: str
    risk: Literal["LOW", "MEDIUM", "HIGH"]
    confidence: int = Field(ge=0, le=100)
    priority: str
    explanation: str


class Route(BaseModel):
    id: str
    name: str
    kind: Literal["safe"]
    coordinates: list[Coordinates]


class RouteAnalysisResponse(RouteAnalysisRequest):
    dataSource: Literal["mock"] = "mock"
    recommendation: RouteRecommendation
    route: Route


app = FastAPI(title="DisasterLens Mock Route API", version="0.1.0")


@app.post("/api/analyze-route", response_model=RouteAnalysisResponse)
def analyze_route(request: RouteAnalysisRequest) -> RouteAnalysisResponse:
    """Return preset demo metrics and illustrative geometry for known location IDs."""
    start = STARTING_POINTS[request.startingPoint]
    destination = DESTINATIONS[request.destination]
    profile = ROLE_PROFILES[request.responderType]
    route_name = profile["routeName"]
    # These are illustrative corridors, not road-network paths or safety calculations.
    if request.destination == "blacksburg-shelter":
        corridor = [(-80.426, 37.233), (-80.4015, 37.233)]
    else:
        corridor = [(-80.426, 37.226), (-80.425, 37.2165), (-80.417, 37.2118)]

    recommendation = RouteRecommendation(
        role=request.responderType,
        **profile,
        explanation=(
            f"Mock recommendation from {start['name']} to {destination['name']}: "
            f"{route_name} illustrates a detour around the simulated Route 460 flood "
            "and South Main bridge damage. "
            f"The selected responder priority is {profile['priority'].lower()}. "
            "Time, distance, risk, and confidence are preset demo values, not calculated "
            "for this journey. Geometry is illustrative and not verified against roads. "
            "Human verification is required before operational use."
        ),
    )
    return RouteAnalysisResponse(
        **request.model_dump(),
        recommendation=recommendation,
        route=Route(
            id=f"mock-{request.startingPoint}-{request.destination}-{request.responderType}",
            name=route_name,
            kind="safe",
            coordinates=[start["coordinates"], *corridor, destination["coordinates"]],
        ),
    )
