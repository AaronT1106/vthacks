"""DisasterLens route, imagery, and analysis API."""

import logging
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

from mock_data import DESTINATIONS, ROLE_PROFILES, STARTING_POINTS
from road_routing import RoadNetworkUnavailableError, calculate_road_route
from satellite_imagery import (
    SENTINEL_FIRST_DATE,
    ProviderUnavailableError,
    get_cached_preview,
    prepare_analysis_raster,
    retrieve_satellite_imagery,
)

ResponderMode = Literal[
    "civilian", "ambulance", "firefighter", "supply-vehicle", "emergency-coordinator"
]
StartingPoint = Literal["blacksburg-fire-station", "virginia-tech-rescue"]
Destination = Literal["lewisgale-hospital", "blacksburg-shelter"]
Coordinates = tuple[float, float]
logger = logging.getLogger(__name__)


class RouteSelectedArea(BaseModel):
    model_config = ConfigDict(extra="forbid")

    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def validate_order(self):
        if self.east <= self.west or self.north <= self.south:
            raise ValueError("selectedArea must contain valid ordered bounds")
        return self


class RouteDetectedHazard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    type: str
    severity: Literal["LOW", "MEDIUM", "HIGH"]
    confidence: int = Field(ge=0, le=100)
    affectedInfrastructure: list[str]
    polygon: list[Coordinates] | None = None
    verification: str | None = None
    selected: bool = False


class RoutePlace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class RouteAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startingPoint: StartingPoint | RoutePlace
    destination: Destination | RoutePlace
    responderType: ResponderMode
    selectedArea: RouteSelectedArea | None = None
    detectedHazards: list[RouteDetectedHazard] = Field(default_factory=list, max_length=20)


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
    warning: str | None = None


class Route(BaseModel):
    id: str
    name: str
    kind: Literal["safe"]

    class Geometry(BaseModel):
        type: Literal["LineString"] = "LineString"
        coordinates: list[Coordinates] = Field(min_length=3)

    geometry: Geometry


class RouteAnalysisResponse(RouteAnalysisRequest):
    dataSource: Literal["road-network"] = "road-network"
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
        today = date.today()
        for selected_date in (self.beforeDate, self.afterDate):
            if selected_date and not SENTINEL_FIRST_DATE <= selected_date <= today:
                raise ValueError("imagery dates must be within Sentinel-2 coverage")
        return self


class SatelliteImageMetadata(BaseModel):
    id: str
    source: Literal["Copernicus Sentinel-2"]
    layerName: str
    requestedDate: date
    captureDate: str
    cloudCoverage: float = Field(ge=0, le=100)
    candidateCount: int = Field(ge=0)
    selectionStatus: Literal["automatic", "higher-cloud-option"]
    imageUrl: str | None = None
    dataMode: Literal["live", "demo"]
    bbox: tuple[float, float, float, float]


class SatelliteImageryFailure(BaseModel):
    code: Literal[
        "no_candidate_scene",
        "same_scene_rejected",
        "preview_url_generation_failed",
        "preview_image_fetch_failed",
        "provider_authentication_failed",
    ]
    stage: str
    detail: str


class SatelliteImageryResponse(BaseModel):
    provider: Literal["mock", "sentinel-2"]
    status: Literal["available", "selection-required", "fallback", "unavailable"]
    message: str
    bbox: tuple[float, float, float, float]
    before: SatelliteImageMetadata | None
    after: SatelliteImageMetadata | None
    beforeCandidates: list[SatelliteImageMetadata] = Field(default_factory=list, max_length=3)
    afterCandidates: list[SatelliteImageMetadata] = Field(default_factory=list, max_length=3)
    comparisonReady: bool = False
    comparisonMessage: str = "Comparison unavailable."
    failure: SatelliteImageryFailure | None = None
    manualUploadRecommended: bool


class SatelliteDamageAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    beforeImageUrl: str
    afterImageUrl: str
    bbox: tuple[float, float, float, float]
    beforeSceneId: str
    afterSceneId: str
    beforeCaptureDate: datetime
    afterCaptureDate: datetime
    afterTargetDate: date

    @model_validator(mode="after")
    def validate_sentinel_images(self):
        import re
        west, south, east, north = self.bbox
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise ValueError("bbox must contain valid ordered coordinates")
        expected_scenes = (
            (self.beforeImageUrl, self.beforeSceneId, self.beforeCaptureDate),
            (self.afterImageUrl, self.afterSceneId, self.afterCaptureDate),
        )
        for image_url, scene_id, capture_date in expected_scenes:
            if not re.fullmatch(r"/api/satellite-imagery/preview/[a-f0-9]{32}", image_url):
                raise ValueError("Only generated Sentinel-2 preview URLs are accepted")
            cached = get_cached_preview(image_url.rsplit("/", 1)[-1])
            if (
                not cached
                or cached[2] != self.bbox
                or cached[3] != scene_id
                or datetime.fromisoformat(cached[4].replace("Z", "+00:00")) != capture_date
            ):
                raise ValueError("Sentinel-2 preview is expired or does not match the selected bbox")
        incident_time = datetime.combine(
            self.afterTargetDate, datetime.min.time(), tzinfo=self.afterCaptureDate.tzinfo
        )
        if self.beforeSceneId == self.afterSceneId or self.beforeCaptureDate == self.afterCaptureDate:
            raise ValueError("Before and After must use distinct Sentinel-2 scenes")
        if self.beforeCaptureDate >= incident_time or self.afterCaptureDate < incident_time:
            raise ValueError("Sentinel-2 scenes do not satisfy Before/After chronology")
        if self.afterCaptureDate - self.beforeCaptureDate < timedelta(hours=24):
            raise ValueError("Sentinel-2 scenes are too close for meaningful comparison")
        return self


class DamageAnalysisBoundsResponse(BaseModel):
    west: float
    south: float
    east: float
    north: float


class AnalyzeDamageReceiptResponse(BaseModel):
    status: Literal["received"] = "received"
    message: str
    before_filename: str
    after_filename: str
    before_content_type: str
    after_content_type: str
    bounds: DamageAnalysisBoundsResponse
    analysisPrepared: bool = False
    analysisMessage: str | None = None
    analysisRasters: list["AnalysisRasterMetadata"] = Field(default_factory=list)


class AnalysisRasterMetadata(BaseModel):
    sceneId: str
    captureDate: datetime
    bbox: tuple[float, float, float, float]
    crs: str
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    bandNames: list[str]
    sampleType: str
    estimatedResolutionMeters: float = Field(gt=0)
    byteSize: int = Field(gt=0)
    storage: Literal["temporary-memory"]


AnalyzeDamageReceiptResponse.model_rebuild()


app = FastAPI(title="DisasterLens API", version="0.1.0")

ALLOWED_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


@app.post("/analyze-damage", response_model=AnalyzeDamageReceiptResponse)
async def analyze_damage(
    before_image: UploadFile = File(...),
    after_image: UploadFile = File(...),
    west: float = Form(...),
    south: float = Form(...),
    east: float = Form(...),
    north: float = Form(...),
) -> AnalyzeDamageReceiptResponse:
    """Validate imagery metadata and confirmed bounds without reading or storing file bytes."""
    try:
        if not (east > west and north > south):
            raise HTTPException(status_code=400, detail="Invalid disaster-area bounds.")
        if before_image.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported Before image type.")
        if after_image.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported After image type.")

        return AnalyzeDamageReceiptResponse(
            message="Imagery received successfully.",
            before_filename=before_image.filename or "unnamed-before-image",
            after_filename=after_image.filename or "unnamed-after-image",
            before_content_type=before_image.content_type,
            after_content_type=after_image.content_type,
            bounds=DamageAnalysisBoundsResponse(
                west=west,
                south=south,
                east=east,
                north=north,
            ),
        )
    finally:
        try:
            await before_image.close()
        finally:
            await after_image.close()


@app.post("/analyze-damage/satellite", response_model=AnalyzeDamageReceiptResponse)
def analyze_satellite_damage(request: SatelliteDamageAnalysisRequest) -> AnalyzeDamageReceiptResponse:
    """Prepare temporary analysis GeoTIFFs without running damage detection."""
    west, south, east, north = request.bbox
    try:
        before_raster = prepare_analysis_raster(request.beforeImageUrl.rsplit("/", 1)[-1])
        after_raster = prepare_analysis_raster(request.afterImageUrl.rsplit("/", 1)[-1])
    except ProviderUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    comparable_fields = ("bbox", "crs", "width", "height", "bandNames", "sampleType")
    if any(before_raster[field] != after_raster[field] for field in comparable_fields):
        raise HTTPException(status_code=409, detail="Prepared Before and After rasters are not spatially compatible.")
    return AnalyzeDamageReceiptResponse(
        message="Sentinel-2 analysis rasters prepared successfully.",
        before_filename=request.beforeImageUrl,
        after_filename=request.afterImageUrl,
        before_content_type="image/jpeg",
        after_content_type="image/jpeg",
        bounds=DamageAnalysisBoundsResponse(west=west, south=south, east=east, north=north),
        analysisPrepared=True,
        analysisMessage="GeoTIFF pixels are prepared for a future tiling or analysis step. No damage detection was run.",
        analysisRasters=[AnalysisRasterMetadata(**before_raster), AnalysisRasterMetadata(**after_raster)],
    )


@app.get("/api/satellite-imagery/preview/{preview_id}")
def satellite_imagery_preview(preview_id: str) -> Response:
    cached = get_cached_preview(preview_id)
    if not cached:
        logger.warning("Sentinel-2 preview request preview_id=%s status=404", preview_id)
        raise HTTPException(status_code=404, detail="Sentinel-2 preview expired or is unavailable.")
    image, content_type, _, scene_id, _ = cached
    logger.info(
        "Sentinel-2 preview request scene_id=%s preview_id=%s status=200 content_type=%s",
        scene_id,
        preview_id,
        content_type,
    )
    return Response(
        content=image,
        media_type=content_type,
        headers={
            "Cache-Control": "private, max-age=300, stale-if-error=60",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.post("/api/analyze-route", response_model=RouteAnalysisResponse)
def analyze_route(request: RouteAnalysisRequest) -> RouteAnalysisResponse:
    """Calculate a role-weighted route over the OpenStreetMap drive network."""
    start = STARTING_POINTS[request.startingPoint] if isinstance(request.startingPoint, str) else {
        "name": request.startingPoint.name,
        "coordinates": (request.startingPoint.longitude, request.startingPoint.latitude),
    }
    requested_destination = DESTINATIONS[request.destination] if isinstance(request.destination, str) else {
        "name": request.destination.name,
        "coordinates": (request.destination.longitude, request.destination.latitude),
    }
    profile = ROLE_PROFILES[request.responderType]
    route_name = profile["routeName"]
    selected_hazard_names = [hazard.name for hazard in request.detectedHazards]
    hazards_avoided = list(dict.fromkeys([*profile.get("hazardsAvoided", []), *selected_hazard_names]))
    selected_area_explanation = ""
    if request.selectedArea and selected_hazard_names:
        area = request.selectedArea
        selected_area_explanation = (
            " It avoids the demo hazards detected in the selected area "
            f"({area.west:.4f}, {area.south:.4f} to {area.east:.4f}, {area.north:.4f}): "
            f"{', '.join(selected_hazard_names)}."
        )

    hazard_payloads = [hazard.model_dump() for hazard in request.detectedHazards]
    try:
        road_route = calculate_road_route(
            start["coordinates"],
            requested_destination["coordinates"],
            request.responderType,
            request.selectedArea.model_dump() if request.selectedArea else None,
            hazard_payloads,
        )
    except RoadNetworkUnavailableError as error:
        logger.error("Road-network route unavailable: %s", error)
        raise HTTPException(status_code=503, detail="Road-network route unavailable.") from error

    recommendation = RouteRecommendation(
        role=request.responderType,
        routeName=route_name,
        recommendedDestination=requested_destination["name"],
        travelTime=f"{road_route['travelMinutes']} min",
        distance=f"{road_route['distanceMiles']:.1f} mi",
        risk=profile["risk"],
        confidence=profile["confidence"],
        priority=profile["priority"],
        hazardsAvoided=hazards_avoided,
        alternative=AlternativeRoute(**profile["alternative"]),
        explanation=(
            f"{profile['selectionReason']}{selected_area_explanation} Dijkstra routing follows OpenStreetMap drive "
            f"edges from {start['name']} to {requested_destination['name']} using role-specific access and hazard "
            "weights. Road and hazard conditions require human verification."
        ),
        warning=road_route.get("warning"),
    )
    return RouteAnalysisResponse(
        **request.model_dump(),
        recommendation=recommendation,
        route=Route(
            id=f"road-network-{request.responderType}",
            name=route_name,
            kind="safe",
            geometry=Route.Geometry(**road_route["geometry"]),
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
