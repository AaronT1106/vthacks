"""Minimal mock route-analysis API. No live routing or AI inference is performed."""

from datetime import date, datetime
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field, model_validator

from mock_data import DESTINATIONS, ROLE_PROFILES, STARTING_POINTS
from satellite_imagery import retrieve_satellite_imagery

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


class AlternativeRoute(BaseModel):
    routeName: str
    risk: Literal["LOW", "MEDIUM", "HIGH"]
    rejectionReason: str


class RouteRecommendation(BaseModel):
    role: ResponderMode
    routeName: str
    recommendedDestination: str
    travelTime: str
    distance: str
    risk: Literal["LOW", "MEDIUM", "HIGH"]
    confidence: int = Field(ge=0, le=100)
    priority: str
    explanation: str
    hazardsAvoided: list[str] = Field(default_factory=list)
    alternative: AlternativeRoute


class Route(BaseModel):
    id: str
    name: str
    kind: Literal["safe"]
    coordinates: list[Coordinates]


class RouteAnalysisResponse(RouteAnalysisRequest):
    dataSource: Literal["mock"] = "mock"
    recommendation: RouteRecommendation
    route: Route


class SatelliteImageryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bbox: tuple[float, float, float, float]
    beforeDate: date | None = None
    afterDate: date | None = None

    @model_validator(mode="after")
    def validate_bounds_and_dates(self):
        min_lng, min_lat, max_lng, max_lat = self.bbox
        if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
            raise ValueError("bbox must be [minLng, minLat, maxLng, maxLat] with valid ordered coordinates")
        if self.beforeDate and self.afterDate and self.beforeDate >= self.afterDate:
            raise ValueError("beforeDate must be earlier than afterDate")
        return self


class SatelliteImageMetadata(BaseModel):
    id: str
    source: str
    capturedAt: datetime
    cloudCoverage: float | None = Field(default=None, ge=0, le=100)
    previewUrl: str | None = None
    dataMode: Literal["live", "demo"]
    bbox: tuple[float, float, float, float]


class SatelliteImageryResponse(BaseModel):
    provider: Literal["mock", "copernicus"]
    providerRequested: Literal["mock", "copernicus"]
    status: Literal["available", "fallback", "unavailable"]
    message: str
    bbox: tuple[float, float, float, float]
    before: SatelliteImageMetadata | None
    after: SatelliteImageMetadata | None
    manualUploadRecommended: bool


app = FastAPI(title="DisasterLens Mock Route API", version="0.1.0")


@app.post("/api/analyze-route", response_model=RouteAnalysisResponse)
def analyze_route(request: RouteAnalysisRequest) -> RouteAnalysisResponse:
    """Return preset demo metrics and illustrative geometry for known location IDs."""
    start = STARTING_POINTS[request.startingPoint]
    requested_destination = DESTINATIONS[request.destination]
    profile = ROLE_PROFILES[request.responderType]
    route_name = profile["routeName"]

    recommendation = RouteRecommendation(
        role=request.responderType,
        routeName=route_name,
        recommendedDestination=profile["recommendedDestination"],
        travelTime=profile["travelTime"],
        distance=profile["distance"],
        risk=profile["risk"],
        confidence=profile["confidence"],
        priority=profile["priority"],
        hazardsAvoided=profile.get("hazardsAvoided", []),
        alternative=AlternativeRoute(**profile["alternative"]),
        explanation=(
            f"{profile['selectionReason']} This is a mock recommendation from {start['name']} "
            f"to {profile['recommendedDestination']}. The requested destination, "
            f"{requested_destination['name']}, remains request context; metrics are preset demo values "
            "and require human verification."
        ),
    )
    return RouteAnalysisResponse(
        **request.model_dump(),
        recommendation=recommendation,
        route=Route(
            id=f"mock-{request.startingPoint}-{request.responderType}",
            name=route_name,
            kind="safe",
            coordinates=[
                start["coordinates"],
                *profile["routeCoordinates"],
                profile["destinationCoordinates"],
            ],
        ),
    )


@app.post("/api/satellite-imagery", response_model=SatelliteImageryResponse)
def satellite_imagery(request: SatelliteImageryRequest) -> SatelliteImageryResponse:
    """Return before/after satellite metadata for the exact requested WGS84 bounds."""
    response = retrieve_satellite_imagery(
        list(request.bbox),
        request.beforeDate,
        request.afterDate,
    )
    return SatelliteImageryResponse.model_validate(response)
