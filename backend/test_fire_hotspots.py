"""NASA FIRMS hotspot tests. Normal tests never contact NASA."""

import socket
import unittest
from urllib.error import HTTPError, URLError
from unittest.mock import patch

from fire_hotspots import (
    DEFAULT_FIRMS_SOURCE,
    FireHotspotError,
    FirmsConfiguration,
    build_firms_request,
    fetch_fire_hotspots,
    get_firms_configuration,
    parse_firms_csv,
)
from main import app

CSV_HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_ti5,frp,daynight\n"
)
CSV_ROW = "37.23,-80.42,335.2,0.4,0.5,2026-09-19,842,N21,VIIRS,n,2.0NRT,291.1,12.4,D\n"
BOUNDS = (-80.45, 37.20, -80.40, 37.25)


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class FireHotspotUnitTests(unittest.TestCase):
    def test_configuration_defaults_and_validation(self):
        with patch.dict("os.environ", {"NASA_FIRMS_MAP_KEY": "fake-key"}, clear=True):
            configuration = get_firms_configuration()
        self.assertEqual(configuration.source, DEFAULT_FIRMS_SOURCE)
        self.assertEqual(configuration.day_range, 1)

        invalid_environments = [
            {"NASA_FIRMS_MAP_KEY": ""},
            {"NASA_FIRMS_MAP_KEY": "key", "NASA_FIRMS_SOURCE": "MODIS_NRT"},
            {"NASA_FIRMS_MAP_KEY": "key", "NASA_FIRMS_DAY_RANGE": "0"},
            {"NASA_FIRMS_MAP_KEY": "key", "NASA_FIRMS_DAY_RANGE": "not-a-number"},
        ]
        for environment in invalid_environments:
            with self.subTest(environment=set(environment)):
                with patch.dict("os.environ", environment, clear=True):
                    with self.assertRaises(FireHotspotError):
                        get_firms_configuration()

    def test_request_uses_exact_west_south_east_north_order(self):
        request = build_firms_request(FirmsConfiguration("fake-key", DEFAULT_FIRMS_SOURCE, 1), BOUNDS)
        self.assertEqual(
            request.full_url,
            "https://firms.modaps.eosdis.nasa.gov/api/area/csv/fake-key/"
            "VIIRS_NOAA21_NRT/-80.45,37.2,-80.4,37.25/1",
        )

    def test_csv_normalization_preserves_route_heatmap_fields(self):
        detection = parse_firms_csv(CSV_HEADER + CSV_ROW, BOUNDS)[0]
        self.assertEqual(detection["latitude"], 37.23)
        self.assertEqual(detection["longitude"], -80.42)
        self.assertEqual(detection["frp"], 12.4)
        self.assertEqual(detection["confidence"], "n")
        self.assertEqual(detection["acquisitionDate"], "2026-09-19")
        self.assertEqual(detection["acquisitionTime"], "0842")
        self.assertEqual(detection["acquiredAt"], "2026-09-19T08:42:00Z")
        self.assertEqual(detection["brightness"], 335.2)
        self.assertEqual(detection["brightTi5"], 291.1)
        self.assertEqual(detection["dayNight"], "D")

    def test_optional_blank_values_become_null(self):
        row = "37.23,-80.42,,,,2026-09-19,1842,N21,VIIRS,,2.0NRT,,,D\n"
        detection = parse_firms_csv(CSV_HEADER + row, BOUNDS)[0]
        self.assertIsNone(detection["frp"])
        self.assertIsNone(detection["confidence"])
        self.assertIsNone(detection["brightness"])

    def test_zero_detections_is_a_successful_parse(self):
        self.assertEqual(parse_firms_csv(CSV_HEADER, BOUNDS), [])

    def test_malformed_csv_and_rows_are_rejected(self):
        invalid_documents = [
            "latitude,longitude\n37.23,-80.42\n",
            CSV_HEADER + CSV_ROW.replace("12.4", "invalid"),
            CSV_HEADER + CSV_ROW.replace("37.23", "invalid"),
            CSV_HEADER + CSV_ROW.replace("-80.42", "-81.42"),
        ]
        for document in invalid_documents:
            with self.subTest(document=document[:30]):
                with self.assertRaises(FireHotspotError):
                    parse_firms_csv(document, BOUNDS)

    def test_key_rejection_text_is_identified(self):
        with self.assertRaisesRegex(FireHotspotError, "rejected"):
            parse_firms_csv("Invalid MAP_KEY", BOUNDS)

    def test_fetch_handles_http_network_and_timeout_without_logging_key(self):
        configuration = {
            "NASA_FIRMS_MAP_KEY": "do-not-log-this-key",
            "NASA_FIRMS_SOURCE": DEFAULT_FIRMS_SOURCE,
            "NASA_FIRMS_DAY_RANGE": "1",
        }
        failures = [
            (HTTPError("https://redacted", 403, "forbidden", {}, None), 502),
            (URLError("offline"), 503),
            (socket.timeout(), 504),
        ]
        for failure, status_code in failures:
            with self.subTest(status_code=status_code):
                with (
                    patch.dict("os.environ", configuration, clear=True),
                    patch("fire_hotspots.urlopen", side_effect=failure),
                    self.assertLogs("fire_hotspots", level="WARNING") as logs,
                ):
                    with self.assertRaises(FireHotspotError) as raised:
                        fetch_fire_hotspots(BOUNDS)
                self.assertEqual(raised.exception.status_code, status_code)
                self.assertNotIn(configuration["NASA_FIRMS_MAP_KEY"], " ".join(logs.output))

    def test_fetch_parses_successful_csv_response(self):
        with (
            patch.dict("os.environ", {"NASA_FIRMS_MAP_KEY": "fake-key"}, clear=True),
            patch("fire_hotspots.urlopen", return_value=FakeResponse((CSV_HEADER + CSV_ROW).encode())),
        ):
            result = fetch_fire_hotspots(BOUNDS)
        self.assertEqual(result["source"]["provider"], "NASA FIRMS")
        self.assertEqual(result["source"]["product"], DEFAULT_FIRMS_SOURCE)
        self.assertEqual(len(result["detections"]), 1)


class FireHotspotApiTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient

        self.client = TestClient(app)
        self.request = {"west": -80.45, "south": 37.20, "east": -80.40, "north": 37.25}

    @patch("main.fetch_fire_hotspots")
    def test_endpoint_returns_normalized_response_and_exact_bounds(self, fetch):
        detection = parse_firms_csv(CSV_HEADER + CSV_ROW, BOUNDS)[0]
        fetch.return_value = {
            "source": {
                "provider": "NASA FIRMS",
                "sensor": "VIIRS",
                "product": DEFAULT_FIRMS_SOURCE,
                "dayRange": 1,
            },
            "detections": [detection],
        }
        response = self.client.post("/api/fire-hotspots", json=self.request)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["analysisType"], "active_fire_hotspots")
        self.assertEqual(body["bounds"], self.request)
        self.assertEqual(body["detectionCount"], 1)
        self.assertEqual(body["detections"][0]["frp"], 12.4)
        fetch.assert_called_once_with(BOUNDS)

    @patch("main.fetch_fire_hotspots")
    def test_endpoint_returns_zero_detections_as_success(self, fetch):
        fetch.return_value = {
            "source": {
                "provider": "NASA FIRMS",
                "sensor": "VIIRS",
                "product": DEFAULT_FIRMS_SOURCE,
                "dayRange": 1,
            },
            "detections": [],
        }
        response = self.client.post("/api/fire-hotspots", json=self.request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["detectionCount"], 0)
        self.assertEqual(response.json()["detections"], [])

    def test_endpoint_rejects_invalid_bounds(self):
        invalid_requests = [
            {**self.request, "east": -80.45},
            {**self.request, "north": 37.20},
            {**self.request, "west": -181},
            {**self.request, "south": -91},
            {**self.request, "unexpected": True},
        ]
        for request in invalid_requests:
            with self.subTest(request=request):
                self.assertEqual(self.client.post("/api/fire-hotspots", json=request).status_code, 422)


if __name__ == "__main__":
    unittest.main()
