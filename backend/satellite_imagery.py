"""Satellite imagery metadata providers. No imagery files are downloaded."""

import json
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

DEFAULT_STAC_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search"
DEFAULT_TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)


class ProviderUnavailableError(RuntimeError):
    """Raised when live provider metadata cannot be retrieved safely."""


def _iso_at(day: date, end_of_day: bool = False) -> str:
    value = datetime.combine(day, time.max if end_of_day else time.min, tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _search_dates(before_date: date | None, after_date: date | None) -> tuple[date, date]:
    today = datetime.now(timezone.utc).date()
    before_boundary = before_date or today - timedelta(days=14)
    after_boundary = after_date or before_boundary + timedelta(days=1)
    return before_boundary, after_boundary


def _mock_image(label: str, captured_at: datetime, bbox: list[float]) -> dict[str, Any]:
    return {
        "id": f"demo-{label}-{captured_at.date().isoformat()}",
        "source": "DisasterLens simulated Sentinel-2 metadata",
        "capturedAt": captured_at.isoformat().replace("+00:00", "Z"),
        "cloudCoverage": 8.0 if label == "before" else 14.0,
        "previewUrl": None,
        "dataMode": "demo",
        "bbox": bbox,
    }


def mock_imagery_response(
    bbox: list[float],
    before_date: date | None,
    after_date: date | None,
    *,
    status: str = "available",
    message: str = "Demo imagery metadata is ready. Upload local images at any time to replace it.",
    provider_requested: str = "mock",
) -> dict[str, Any]:
    before_boundary, after_boundary = _search_dates(before_date, after_date)
    before_capture = datetime.combine(before_boundary - timedelta(days=3), time(hour=15), tzinfo=timezone.utc)
    after_capture = datetime.combine(after_boundary + timedelta(days=2), time(hour=15), tzinfo=timezone.utc)
    return {
        "provider": "mock",
        "providerRequested": provider_requested,
        "status": status,
        "message": message,
        "bbox": bbox,
        "before": _mock_image("before", before_capture, bbox),
        "after": _mock_image("after", after_capture, bbox),
        "manualUploadRecommended": status != "available",
    }


def _request_json(request: Request, timeout: float = 15.0) -> dict[str, Any]:
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        raise ProviderUnavailableError(str(error)) from error


def _provider_url(variable_name: str, default: str) -> str:
    url = os.getenv(variable_name, default).strip()
    if urlparse(url).scheme != "https":
        raise ProviderUnavailableError(f"{variable_name} must use HTTPS.")
    return url


def _copernicus_access_token() -> str:
    client_id = os.getenv("COPERNICUS_CLIENT_ID", "").strip()
    client_secret = os.getenv("COPERNICUS_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise ProviderUnavailableError("Copernicus client credentials are not configured.")

    body = urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode("utf-8")
    request = Request(
        _provider_url("COPERNICUS_TOKEN_URL", DEFAULT_TOKEN_URL),
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    token = _request_json(request).get("access_token")
    if not isinstance(token, str) or not token:
        raise ProviderUnavailableError("Copernicus authentication returned no access token.")
    return token


def _safe_preview_url(feature: dict[str, Any]) -> str | None:
    assets = feature.get("assets")
    if not isinstance(assets, dict):
        return None
    for name in ("thumbnail", "preview", "quicklook", "visual"):
        asset = assets.get(name)
        href = asset.get("href") if isinstance(asset, dict) else None
        if isinstance(href, str) and urlparse(href).scheme == "https":
            return href
    return None


def _feature_to_image(feature: dict[str, Any], bbox: list[float]) -> dict[str, Any] | None:
    properties = feature.get("properties")
    captured_at = properties.get("datetime") if isinstance(properties, dict) else None
    feature_id = feature.get("id")
    if not isinstance(feature_id, str) or not isinstance(captured_at, str):
        return None
    cloud_cover = properties.get("eo:cloud_cover")
    return {
        "id": feature_id,
        "source": "Copernicus Data Space Sentinel-2 L2A",
        "capturedAt": captured_at,
        "cloudCoverage": float(cloud_cover) if isinstance(cloud_cover, (int, float)) else None,
        "previewUrl": _safe_preview_url(feature),
        "dataMode": "live",
        "bbox": bbox,
    }


def _search_copernicus(
    token: str,
    bbox: list[float],
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    request_body = json.dumps({
        "bbox": bbox,
        "datetime": f"{_iso_at(start_date)}/{_iso_at(end_date, end_of_day=True)}",
        "collections": [os.getenv("COPERNICUS_COLLECTION", "sentinel-2-l2a")],
        "limit": 20,
    }).encode("utf-8")
    request = Request(
        _provider_url("COPERNICUS_STAC_URL", DEFAULT_STAC_URL),
        data=request_body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    features = _request_json(request).get("features")
    if not isinstance(features, list):
        return []
    valid_features = [feature for feature in features if isinstance(feature, dict)]
    def cloud_sort_key(feature: dict[str, Any]) -> tuple[bool, float]:
        properties = feature.get("properties")
        cloud_cover = properties.get("eo:cloud_cover") if isinstance(properties, dict) else None
        return (not isinstance(cloud_cover, (int, float)), float(cloud_cover) if isinstance(cloud_cover, (int, float)) else 101.0)

    return sorted(valid_features, key=cloud_sort_key)


def _first_valid_image(features: list[dict[str, Any]], bbox: list[float]) -> dict[str, Any] | None:
    for feature in features:
        image = _feature_to_image(feature, bbox)
        if image:
            return image
    return None


def copernicus_imagery_response(
    bbox: list[float],
    before_date: date | None,
    after_date: date | None,
) -> dict[str, Any]:
    before_boundary, after_boundary = _search_dates(before_date, after_date)
    token = _copernicus_access_token()
    before_features = _search_copernicus(
        token,
        bbox,
        before_boundary - timedelta(days=90),
        before_boundary - timedelta(days=1),
    )
    after_features = _search_copernicus(
        token,
        bbox,
        after_boundary + timedelta(days=1),
        after_boundary + timedelta(days=90),
    )
    before = _first_valid_image(before_features, bbox)
    after = _first_valid_image(after_features, bbox)
    if not before or not after:
        raise ProviderUnavailableError(
            "Copernicus did not return a complete before/after pair for this area and date range."
        )

    cloudy = any(
        image["cloudCoverage"] is not None and image["cloudCoverage"] > 40
        for image in (before, after)
    )
    return {
        "provider": "copernicus",
        "providerRequested": "copernicus",
        "status": "available",
        "message": (
            "Live provider metadata is available, but one or more scenes are cloudy; review or upload alternatives."
            if cloudy else
            "Live Copernicus metadata is ready. Preview availability depends on the catalog item."
        ),
        "bbox": bbox,
        "before": before,
        "after": after,
        "manualUploadRecommended": cloudy or not before["previewUrl"] or not after["previewUrl"],
    }


def retrieve_satellite_imagery(
    bbox: list[float],
    before_date: date | None,
    after_date: date | None,
) -> dict[str, Any]:
    provider = os.getenv("SATELLITE_IMAGERY_PROVIDER", "mock").strip().lower()
    if provider != "copernicus":
        return mock_imagery_response(bbox, before_date, after_date)

    try:
        return copernicus_imagery_response(bbox, before_date, after_date)
    except ProviderUnavailableError as error:
        return mock_imagery_response(
            bbox,
            before_date,
            after_date,
            status="fallback",
            provider_requested="copernicus",
            message=f"Live Copernicus imagery is unavailable: {error} Demo metadata is shown; manual upload remains available.",
        )
