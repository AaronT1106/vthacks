"""Copernicus Sentinel-2 search and preview rendering without file storage."""

import json
import logging
import math
import os
import time
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

SENTINEL_FIRST_DATE = date(2015, 6, 23)
SENTINEL_LAYER = "Sentinel-2 L2A true color"
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CATALOG_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
PREVIEW_TTL_SECONDS = 3600
MAX_CACHED_PREVIEWS = 12
MAX_CACHED_ANALYSIS_RASTERS = 4
_preview_cache: dict[str, tuple[float, bytes, str, tuple[float, float, float, float], str, str]] = {}
_analysis_raster_cache: dict[str, tuple[float, bytes]] = {}
logger = logging.getLogger(__name__)


class ProviderUnavailableError(RuntimeError):
    """Raised when Copernicus cannot provide a usable imagery pair."""

    def __init__(self, code: str, stage: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.stage = stage
        self.detail = detail


def _request_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    request = Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        raise ProviderUnavailableError(
            "no_candidate_scene", "scene-search", f"Copernicus scene search failed: {error}"
        ) from error


def _access_token() -> str:
    client_id = os.getenv("COPERNICUS_CLIENT_ID", "").strip()
    client_secret = os.getenv("COPERNICUS_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise ProviderUnavailableError(
            "provider_authentication_failed", "authentication", "Copernicus credentials are missing."
        )
    body = urlencode({"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}).encode()
    request = Request(TOKEN_URL, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urlopen(request, timeout=20) as response:
            token = json.load(response).get("access_token")
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        raise ProviderUnavailableError(
            "provider_authentication_failed", "authentication", f"Copernicus authentication failed: {error}"
        ) from error
    if not isinstance(token, str) or not token:
        raise ProviderUnavailableError(
            "provider_authentication_failed", "authentication", "Copernicus authentication returned no access token."
        )
    return token


def _selected_dates(before_date: date | None, after_date: date | None) -> tuple[date, date]:
    selected_after = after_date or date.today() - timedelta(days=1)
    return before_date or selected_after - timedelta(days=14), selected_after


def _search_scenes(
    token: str,
    bbox: list[float],
    requested_date: date,
    incident_date: date,
    side: str,
    search_window_days: int,
    max_cloud: float,
    excluded_ids: set[str] | None = None,
    excluded_timestamps: set[str] | None = None,
) -> tuple[list[dict[str, Any]], int, bool]:
    start = max(SENTINEL_FIRST_DATE, requested_date - timedelta(days=search_window_days))
    end = min(date.today(), requested_date + timedelta(days=search_window_days))
    if side == "before":
        end = min(end, incident_date - timedelta(days=1))
    else:
        start = max(start, incident_date)
    if start > end:
        logger.info(
            "Sentinel-2 %s query skipped because chronology produced an empty window start=%s end=%s",
            side,
            start,
            end,
        )
        return [], 0, False
    payload = {
        "bbox": bbox,
        "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "collections": ["sentinel-2-l2a"],
        "limit": 100,
    }
    result = _request_json(CATALOG_URL, payload, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    candidates: list[tuple[float, int, dict[str, Any]]] = []
    features = result.get("features", [])
    if not isinstance(features, list):
        features = []
    rejected_for_chronology = 0
    rejected_for_metadata = 0
    rejected_as_duplicate = 0
    for feature in features:
        if not isinstance(feature, dict):
            rejected_for_metadata += 1
            continue
        properties = feature.get("properties", {})
        captured = properties.get("datetime")
        cloud = properties.get("eo:cloud_cover")
        if isinstance(feature.get("id"), str) and isinstance(captured, str) and isinstance(cloud, (int, float)):
            try:
                captured_date = date.fromisoformat(captured[:10])
            except ValueError:
                rejected_for_metadata += 1
                continue
            if side == "before" and captured_date >= incident_date:
                rejected_for_chronology += 1
                continue
            if side == "after" and captured_date < incident_date:
                rejected_for_chronology += 1
                continue
            if feature["id"] in (excluded_ids or set()) or captured in (excluded_timestamps or set()):
                rejected_as_duplicate += 1
                continue
            candidates.append((float(cloud), abs((captured_date - requested_date).days), feature))
        else:
            rejected_for_metadata += 1
    logger.info(
        "Sentinel-2 %s catalog query bbox=%s collection=sentinel-2-l2a window=%s/%s raw_features=%s accepted=%s rejected_chronology=%s rejected_metadata=%s rejected_duplicate=%s",
        side,
        bbox,
        start,
        end,
        len(features),
        len(candidates),
        rejected_for_chronology,
        rejected_for_metadata,
        rejected_as_duplicate,
    )
    candidates.sort(key=lambda item: (item[0], item[1]))
    candidate_count = len(candidates)
    preferred = [candidate[2] for candidate in candidates if candidate[0] <= max_cloud][:3]
    if preferred:
        return preferred, candidate_count, False
    higher_cloud = next((candidate for candidate in candidates if candidate[0] < 70), None)
    return ([higher_cloud[2]], candidate_count, True) if higher_cloud else ([], candidate_count, False)


def _render_scene(token: str, bbox: list[float], captured_at: str, max_cloud: float) -> tuple[bytes, str]:
    captured_date = captured_at[:10]
    payload = {
        "input": {
            "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"}},
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "timeRange": {"from": f"{captured_date}T00:00:00Z", "to": f"{captured_date}T23:59:59Z"},
                    "maxCloudCoverage": max_cloud,
                    "mosaickingOrder": "leastCC",
                },
            }],
        },
        "output": {"width": 1024, "height": 1024, "responses": [{"identifier": "default", "format": {"type": "image/png"}}]},
        "evalscript": '//VERSION=3\nfunction setup(){return{input:["B04","B03","B02","dataMask"],output:{bands:4}}}function evaluatePixel(s){return[2.5*s.B04,2.5*s.B03,2.5*s.B02,s.dataMask]}',
    }
    request = Request(PROCESS_URL, data=json.dumps(payload).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "image/png"}, method="POST")
    try:
        with urlopen(request, timeout=45) as response:
            status = getattr(response, "status", response.getcode())
            content_type = response.headers.get_content_type()
            image = response.read(8 * 1024 * 1024)
            logger.info("Sentinel-2 preview image fetch status=%s content_type=%s", status, content_type)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        status = getattr(error, "code", "unavailable")
        logger.warning("Sentinel-2 preview image fetch failed status=%s", status)
        raise ProviderUnavailableError(
            "preview_image_fetch_failed", "preview-fetch", f"Sentinel-2 preview image fetch failed: {error}"
        ) from error
    if content_type not in {"image/jpeg", "image/png"} or not image:
        raise ProviderUnavailableError(
            "preview_image_fetch_failed",
            "preview-fetch",
            f"Copernicus returned an unusable Sentinel-2 preview ({content_type or 'missing content type'}).",
        )
    return image, content_type


def _analysis_dimensions(bbox: tuple[float, float, float, float]) -> tuple[int, int, float]:
    west, south, east, north = bbox
    center_latitude = (south + north) / 2
    width_meters = (east - west) * 111_320 * math.cos(math.radians(center_latitude))
    height_meters = (north - south) * 110_540
    max_dimension = max(256, min(4096, int(os.getenv("COPERNICUS_ANALYSIS_MAX_DIMENSION", "2048"))))
    width = max(1, min(max_dimension, math.ceil(width_meters / 10)))
    height = max(1, min(max_dimension, math.ceil(height_meters / 10)))
    effective_resolution = max(width_meters / width, height_meters / height)
    return width, height, effective_resolution


def prepare_analysis_raster(preview_id: str) -> dict[str, Any]:
    cached = get_cached_preview(preview_id)
    if not cached:
        raise ProviderUnavailableError(
            "preview_image_fetch_failed", "analysis-raster", "Selected Sentinel-2 preview expired before raster preparation."
        )
    _, _, bbox, scene_id, capture_date = cached
    width, height, resolution_meters = _analysis_dimensions(bbox)
    token = _access_token()
    payload = {
        "input": {
            "bounds": {
                "bbox": list(bbox),
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "timeRange": {
                        "from": f"{capture_date[:10]}T00:00:00Z",
                        "to": f"{capture_date[:10]}T23:59:59Z",
                    },
                    "mosaickingOrder": "leastCC",
                },
            }],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}],
        },
        "evalscript": '//VERSION=3\nfunction setup(){return{input:["B04","B03","B02","dataMask"],output:{bands:4,sampleType:"UINT16"}}}function evaluatePixel(s){return[10000*s.B04,10000*s.B03,10000*s.B02,10000*s.dataMask]}',
    }
    request = Request(
        PROCESS_URL,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "image/tiff"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=90) as response:
            content_type = response.headers.get_content_type()
            raster = response.read(48 * 1024 * 1024)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        raise ProviderUnavailableError(
            "preview_image_fetch_failed", "analysis-raster", f"Sentinel-2 analysis raster preparation failed: {error}"
        ) from error
    if content_type not in {"image/tiff", "image/geotiff", "application/tiff"} or not raster:
        raise ProviderUnavailableError(
            "preview_image_fetch_failed", "analysis-raster", "Copernicus returned no usable analysis GeoTIFF."
        )
    now = time.time()
    for key, (created, _) in list(_analysis_raster_cache.items()):
        if now - created > PREVIEW_TTL_SECONDS:
            _analysis_raster_cache.pop(key, None)
    while len(_analysis_raster_cache) >= MAX_CACHED_ANALYSIS_RASTERS:
        oldest = min(_analysis_raster_cache, key=lambda key: _analysis_raster_cache[key][0])
        _analysis_raster_cache.pop(oldest, None)
    _analysis_raster_cache[preview_id] = (now, raster)
    return {
        "sceneId": scene_id,
        "captureDate": capture_date,
        "bbox": bbox,
        "crs": "OGC:CRS84",
        "width": width,
        "height": height,
        "bandNames": ["B04", "B03", "B02", "dataMask"],
        "sampleType": "UINT16",
        "estimatedResolutionMeters": round(resolution_meters, 2),
        "byteSize": len(raster),
        "storage": "temporary-memory",
    }


def _cache_preview(
    image: bytes, content_type: str, bbox: list[float], scene_id: str, capture_date: str
) -> str:
    now = time.time()
    for key, (created, _, _, _, _, _) in list(_preview_cache.items()):
        if now - created > PREVIEW_TTL_SECONDS:
            _preview_cache.pop(key, None)
    while len(_preview_cache) >= MAX_CACHED_PREVIEWS:
        oldest = min(_preview_cache, key=lambda key: _preview_cache[key][0])
        _preview_cache.pop(oldest, None)
    preview_id = uuid.uuid4().hex
    try:
        _preview_cache[preview_id] = (now, image, content_type, tuple(bbox), scene_id, capture_date)
    except (MemoryError, TypeError, ValueError) as error:
        raise ProviderUnavailableError(
            "preview_url_generation_failed", "preview-cache", "A temporary preview URL could not be generated."
        ) from error
    logger.info("Cached Sentinel-2 preview scene_id=%s preview_id=%s content_type=%s", scene_id, preview_id, content_type)
    return f"/api/satellite-imagery/preview/{preview_id}"


def get_cached_preview(
    preview_id: str,
) -> tuple[bytes, str, tuple[float, float, float, float], str, str] | None:
    cached = _preview_cache.get(preview_id)
    if not cached or time.time() - cached[0] > PREVIEW_TTL_SECONDS:
        _preview_cache.pop(preview_id, None)
        return None
    return cached[1], cached[2], cached[3], cached[4], cached[5]


def _metadata(
    scene: dict[str, Any],
    bbox: list[float],
    requested_date: date,
    image_url: str,
    candidate_count: int,
    requires_confirmation: bool,
) -> dict[str, Any]:
    properties = scene["properties"]
    return {
        "id": scene["id"],
        "source": "Copernicus Sentinel-2",
        "layerName": SENTINEL_LAYER,
        "requestedDate": requested_date.isoformat(),
        "captureDate": properties["datetime"],
        "cloudCoverage": float(properties["eo:cloud_cover"]),
        "candidateCount": candidate_count,
        "selectionStatus": "higher-cloud-option" if requires_confirmation else "automatic",
        "imageUrl": image_url,
        "dataMode": "live",
        "bbox": bbox,
    }


def _render_metadata_options(
    token: str,
    scenes: list[dict[str, Any]],
    bbox: list[float],
    requested_date: date,
    candidate_count: int,
    requires_confirmation: bool,
    max_cloud: float,
) -> list[dict[str, Any]]:
    options = []
    for scene in scenes:
        logger.info("Rendering Sentinel-2 scene_id=%s capture_time=%s", scene["id"], scene["properties"]["datetime"])
        cloud = float(scene["properties"]["eo:cloud_cover"])
        image, content_type = _render_scene(
            token, bbox, scene["properties"]["datetime"], max(max_cloud, cloud)
        )
        options.append(_metadata(
            scene, bbox, requested_date, _cache_preview(
                image, content_type, bbox, scene["id"], scene["properties"]["datetime"]
            ),
            candidate_count, requires_confirmation,
        ))
    return options


def retrieve_satellite_imagery(bbox: list[float], before_date: date | None, after_date: date | None) -> dict[str, Any]:
    selected_before, selected_after = _selected_dates(before_date, after_date)
    if os.getenv("SATELLITE_IMAGERY_PROVIDER", "sentinel-2").strip().lower() == "mock":
        return {"provider": "mock", "status": "fallback", "message": "Demo mode does not fetch Sentinel-2 imagery. Upload Before and After images manually.", "bbox": bbox, "before": None, "after": None, "comparisonReady": False, "comparisonMessage": "Automated imagery is disabled in demo mode.", "failure": {"code": "no_candidate_scene", "stage": "provider-selection", "detail": "The mock provider does not return satellite scenes."}, "manualUploadRecommended": True}
    try:
        token = _access_token()
        max_cloud = float(os.getenv("COPERNICUS_MAX_CLOUD_COVER", "40"))
        search_window_days = max(1, int(os.getenv("COPERNICUS_SEARCH_WINDOW_DAYS", "14")))
        before_scenes, before_count, before_confirmation = _search_scenes(
            token, bbox, selected_before, selected_after, "before", search_window_days, max_cloud
        )
        before_scene = before_scenes[0] if before_scenes else None
        logger.info("Sentinel-2 before candidates=%s selected_scene_id=%s", before_count, before_scene["id"] if before_scene else "none")
        after_scenes, after_count, after_confirmation = _search_scenes(
            token, bbox, selected_after, selected_after, "after", search_window_days, max_cloud,
            {before_scene["id"]} if before_scene else set(),
            {before_scene["properties"]["datetime"]} if before_scene else set(),
        )
        after_scene = after_scenes[0] if after_scenes else None
        logger.info("Sentinel-2 after candidates=%s selected_scene_id=%s", after_count, after_scene["id"] if after_scene else "none")
        if not before_scene or not after_scene:
            missing = []
            if not before_scene:
                missing.append(f"Before ({before_count} candidates checked)")
            if not after_scene:
                missing.append(f"After ({after_count} candidates checked)")
            raise ProviderUnavailableError(
                "no_candidate_scene", "scene-selection",
                f"No usable Sentinel-2 scene below 70% cloud cover for {', '.join(missing)}.",
            )
        before_capture = datetime.fromisoformat(before_scene["properties"]["datetime"].replace("Z", "+00:00"))
        after_capture = datetime.fromisoformat(after_scene["properties"]["datetime"].replace("Z", "+00:00"))
        if before_scene["id"] == after_scene["id"] or before_capture == after_capture:
            raise ProviderUnavailableError(
                "same_scene_rejected", "scene-selection",
                "The provider returned the same scene for Before and After; duplicate imagery was rejected.",
            )
        if after_capture - before_capture < timedelta(hours=24):
            raise ProviderUnavailableError(
                "same_scene_rejected", "scene-selection",
                "The distinct scenes are less than 24 hours apart and cannot support comparison.",
            )
        before_options = _render_metadata_options(
            token, before_scenes, bbox, selected_before, before_count, before_confirmation, max_cloud
        )
        after_options = _render_metadata_options(
            token, after_scenes, bbox, selected_after, after_count, after_confirmation, max_cloud
        )
        before, after = before_options[0], after_options[0]
    except ProviderUnavailableError as error:
        logger.warning("Sentinel-2 retrieval failed code=%s stage=%s detail=%s", error.code, error.stage, error.detail)
        return {"provider": "sentinel-2", "status": "unavailable", "message": f"{error.detail} Try other dates or use manual upload.", "bbox": bbox, "before": None, "after": None, "comparisonReady": False, "comparisonMessage": error.detail, "failure": {"code": error.code, "stage": error.stage, "detail": error.detail}, "manualUploadRecommended": True}
    except ValueError as error:
        detail = f"Sentinel-2 configuration is invalid: {error}"
        logger.warning("Sentinel-2 retrieval failed code=preview_url_generation_failed stage=configuration detail=%s", detail)
        return {"provider": "sentinel-2", "status": "unavailable", "message": f"{detail} Use manual upload.", "bbox": bbox, "before": None, "after": None, "comparisonReady": False, "comparisonMessage": detail, "failure": {"code": "preview_url_generation_failed", "stage": "configuration", "detail": detail}, "manualUploadRecommended": True}
    selection_required = before_confirmation or after_confirmation
    return {
        "provider": "sentinel-2",
        "status": "selection-required" if selection_required else "available",
        "message": (
            "Higher cloud cover — verification limited. Review and accept the optional scene pair, or use manual upload."
            if selection_required
            else "Sentinel-2 before and after imagery is ready for human review and demo analysis."
        ),
        "bbox": bbox,
        "before": before,
        "after": after,
        "beforeCandidates": before_options,
        "afterCandidates": after_options,
        "comparisonReady": True,
        "comparisonMessage": "Distinct chronological scenes are ready for comparison.",
        "failure": None,
        "manualUploadRecommended": selection_required,
    }
