"""NASA FIRMS active-fire hotspot retrieval and normalization."""

from __future__ import annotations

import csv
import io
import logging
import os
import socket
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

FIRMS_AREA_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
DEFAULT_FIRMS_SOURCE = "VIIRS_NOAA21_NRT"
DEFAULT_FIRMS_DAY_RANGE = 1
FIRMS_TIMEOUT_SECONDS = 30
REQUIRED_FIRMS_FIELDS = {
    "latitude",
    "longitude",
    "bright_ti4",
    "scan",
    "track",
    "acq_date",
    "acq_time",
    "satellite",
    "instrument",
    "confidence",
    "version",
    "bright_ti5",
    "frp",
    "daynight",
}

logger = logging.getLogger(__name__)


class FireHotspotError(RuntimeError):
    """Safe provider or configuration error for the FIRMS endpoint."""

    def __init__(self, detail: str, status_code: int, stage: str, provider_status: int | None = None):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.stage = stage
        self.provider_status = provider_status


@dataclass(frozen=True)
class FirmsConfiguration:
    map_key: str
    source: str
    day_range: int


def get_firms_configuration() -> FirmsConfiguration:
    map_key = os.getenv("NASA_FIRMS_MAP_KEY", "").strip()
    source = os.getenv("NASA_FIRMS_SOURCE", DEFAULT_FIRMS_SOURCE).strip()
    raw_day_range = os.getenv("NASA_FIRMS_DAY_RANGE", str(DEFAULT_FIRMS_DAY_RANGE)).strip()
    if not map_key:
        raise FireHotspotError("NASA FIRMS MAP_KEY is not configured.", 503, "configuration")
    if source != DEFAULT_FIRMS_SOURCE:
        raise FireHotspotError("NASA FIRMS source configuration is invalid.", 503, "configuration")
    try:
        day_range = int(raw_day_range)
    except ValueError:
        raise FireHotspotError("NASA FIRMS day range configuration is invalid.", 503, "configuration") from None
    if not 1 <= day_range <= 5:
        raise FireHotspotError("NASA FIRMS day range configuration is invalid.", 503, "configuration")
    return FirmsConfiguration(map_key=map_key, source=source, day_range=day_range)


def build_firms_request(
    configuration: FirmsConfiguration,
    bounds: tuple[float, float, float, float],
) -> Request:
    coordinates = ",".join(format(coordinate, ".15g") for coordinate in bounds)
    url = (
        f"{FIRMS_AREA_API}/{quote(configuration.map_key, safe='')}"
        f"/{quote(configuration.source, safe='')}/{coordinates}/{configuration.day_range}"
    )
    return Request(url, headers={"Accept": "text/csv", "User-Agent": "DisasterLens/1.0"})


def _trusted_ssl_context() -> ssl.SSLContext:
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def _optional_float(row: dict[str, str | None], field: str) -> float | None:
    raw_value = (row.get(field) or "").strip()
    if not raw_value:
        return None
    try:
        return float(raw_value)
    except ValueError:
        raise FireHotspotError("NASA FIRMS returned malformed hotspot data.", 502, "csv-parse") from None


def _required_float(row: dict[str, str | None], field: str) -> float:
    value = _optional_float(row, field)
    if value is None:
        raise FireHotspotError("NASA FIRMS returned malformed hotspot data.", 502, "csv-parse")
    return value


def _optional_text(row: dict[str, str | None], field: str) -> str | None:
    value = (row.get(field) or "").strip()
    return value or None


def _normalized_time(raw_time: str) -> str:
    stripped = raw_time.strip()
    if stripped.isdigit() and 1 <= len(stripped) <= 4:
        return stripped.zfill(4)
    return stripped


def _acquired_at(acquisition_date: str, acquisition_time: str) -> str | None:
    try:
        observed = datetime.strptime(
            f"{acquisition_date} {acquisition_time}",
            "%Y-%m-%d %H%M",
        ).replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return observed.isoformat().replace("+00:00", "Z")


def normalize_fire_detection(
    row: dict[str, str | None],
    bounds: tuple[float, float, float, float],
) -> dict[str, Any]:
    west, south, east, north = bounds
    latitude = _required_float(row, "latitude")
    longitude = _required_float(row, "longitude")
    if not (west <= longitude <= east and south <= latitude <= north):
        raise FireHotspotError("NASA FIRMS returned a hotspot outside the requested area.", 502, "csv-parse")

    acquisition_date = (row.get("acq_date") or "").strip()
    acquisition_time = _normalized_time((row.get("acq_time") or "").strip())
    if not acquisition_date or not acquisition_time:
        raise FireHotspotError("NASA FIRMS returned malformed hotspot data.", 502, "csv-parse")

    return {
        "latitude": latitude,
        "longitude": longitude,
        "acquisitionDate": acquisition_date,
        "acquisitionTime": acquisition_time,
        "acquiredAt": _acquired_at(acquisition_date, acquisition_time),
        "satellite": _optional_text(row, "satellite"),
        "instrument": _optional_text(row, "instrument"),
        "confidence": _optional_text(row, "confidence"),
        "frp": _optional_float(row, "frp"),
        "brightness": _optional_float(row, "bright_ti4"),
        "scan": _optional_float(row, "scan"),
        "track": _optional_float(row, "track"),
        "version": _optional_text(row, "version"),
        "brightTi5": _optional_float(row, "bright_ti5"),
        "dayNight": _optional_text(row, "daynight"),
    }


def parse_firms_csv(
    csv_text: str,
    bounds: tuple[float, float, float, float],
) -> list[dict[str, Any]]:
    lowered = csv_text.strip().lower()
    if "map_key" in lowered and any(word in lowered for word in ("invalid", "rejected", "denied")):
        raise FireHotspotError("NASA FIRMS rejected the configured MAP_KEY.", 502, "authentication")

    reader = csv.DictReader(io.StringIO(csv_text))
    field_names = set(reader.fieldnames or [])
    if not REQUIRED_FIRMS_FIELDS.issubset(field_names):
        raise FireHotspotError("NASA FIRMS returned an unexpected CSV response.", 502, "csv-parse")

    detections = [normalize_fire_detection(row, bounds) for row in reader]
    detections.sort(key=lambda detection: detection["acquiredAt"] or "", reverse=True)
    return detections


def fetch_fire_hotspots(bounds: tuple[float, float, float, float]) -> dict[str, Any]:
    configuration = get_firms_configuration()
    request = build_firms_request(configuration, bounds)
    try:
        with urlopen(request, timeout=FIRMS_TIMEOUT_SECONDS, context=_trusted_ssl_context()) as response:
            csv_bytes = response.read()
    except HTTPError as error:
        detail = (
            "NASA FIRMS rejected the configured MAP_KEY."
            if error.code in {401, 403}
            else "NASA FIRMS returned an HTTP error."
        )
        logger.warning("NASA FIRMS request failed stage=http status=%s", error.code)
        raise FireHotspotError(detail, 502, "http", error.code) from None
    except (TimeoutError, socket.timeout):
        logger.warning("NASA FIRMS request failed stage=timeout")
        raise FireHotspotError("NASA FIRMS request timed out.", 504, "timeout") from None
    except URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            logger.warning("NASA FIRMS request failed stage=timeout")
            raise FireHotspotError("NASA FIRMS request timed out.", 504, "timeout") from None
        logger.warning("NASA FIRMS request failed stage=network")
        raise FireHotspotError("NASA FIRMS service is unavailable.", 503, "network") from None
    except OSError:
        logger.warning("NASA FIRMS request failed stage=network")
        raise FireHotspotError("NASA FIRMS service is unavailable.", 503, "network") from None

    try:
        csv_text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise FireHotspotError("NASA FIRMS returned an unexpected response.", 502, "csv-parse") from None

    detections = parse_firms_csv(csv_text, bounds)
    return {
        "source": {
            "provider": "NASA FIRMS",
            "sensor": "VIIRS",
            "product": configuration.source,
            "dayRange": configuration.day_range,
        },
        "detections": detections,
    }
