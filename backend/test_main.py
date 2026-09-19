"""Run with: python -m unittest -v (from backend/)."""

import unittest
from datetime import date, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from mock_data import DESTINATIONS, ROLE_PROFILES, STARTING_POINTS


class RouteAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
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
                        self.assertEqual(body["dataSource"], "mock")
                        for key, value in request.items():
                            self.assertEqual(body[key], value)
                        recommendation = body["recommendation"]
                        self.assertEqual(recommendation["role"], role)
                        self.assertEqual(
                            recommendation["recommendedDestination"],
                            ROLE_PROFILES[role]["recommendedDestination"],
                        )
                        self.assertEqual(recommendation["risk"], ROLE_PROFILES[role]["risk"])
                        self.assertEqual(recommendation["routeName"], ROLE_PROFILES[role]["routeName"])
                        self.assertEqual(recommendation["travelTime"], ROLE_PROFILES[role]["travelTime"])
                        self.assertEqual(recommendation["distance"], ROLE_PROFILES[role]["distance"])
                        self.assertEqual(recommendation["confidence"], ROLE_PROFILES[role]["confidence"])
                        self.assertEqual(recommendation["hazardsAvoided"], ROLE_PROFILES[role]["hazardsAvoided"])
                        self.assertIsInstance(recommendation["hazardsAvoided"], list)
                        self.assertNotIn("hazards_avoided", recommendation)
                        self.assertEqual(recommendation["alternative"], ROLE_PROFILES[role]["alternative"])
                        self.assertIn(DESTINATIONS[destination]["name"], recommendation["explanation"])
                        self.assertIn(ROLE_PROFILES[role]["recommendedDestination"], recommendation["explanation"])
                        self.assertIn("preset demo values", recommendation["explanation"])
                        self.assertEqual(body["route"]["coordinates"][0], list(STARTING_POINTS[start]["coordinates"]))
                        self.assertEqual(
                            body["route"]["coordinates"][-1],
                            list(ROLE_PROFILES[role]["destinationCoordinates"]),
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
            "recommendedDestination",
            "travelTime",
            "distance",
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
        geometries = {str(result["route"]["coordinates"]) for result in results.values()}
        self.assertEqual(len(geometries), len(ROLE_PROFILES))

        self.assertEqual(results["civilian"]["recommendation"]["recommendedDestination"], "Blacksburg Community Shelter")
        self.assertEqual(results["ambulance"]["recommendation"]["recommendedDestination"], "LewisGale Hospital Montgomery")
        self.assertEqual(results["firefighter"]["recommendation"]["recommendedDestination"], "Route 460 Incident Staging")
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

    def test_mock_satellite_imagery_returns_complete_pair_for_exact_bbox(self):
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
        self.assertEqual(body["status"], "available")
        self.assertEqual(body["bbox"], request["bbox"])
        for image_type in ("before", "after"):
            image = body[image_type]
            self.assertEqual(image["bbox"], request["bbox"])
            self.assertEqual(image["dataMode"], "demo")
            self.assertIn("source", image)
            self.assertIn("capturedAt", image)
            self.assertIn("cloudCoverage", image)
            self.assertIn("previewUrl", image)
        self.assertLess(datetime.fromisoformat(body["before"]["capturedAt"]).date(), date(2026, 8, 1))
        self.assertGreater(datetime.fromisoformat(body["after"]["capturedAt"]).date(), date(2026, 8, 5))

    def test_copernicus_missing_credentials_returns_demo_fallback(self):
        with patch.dict("os.environ", {
            "SATELLITE_IMAGERY_PROVIDER": "copernicus",
            "COPERNICUS_CLIENT_ID": "",
            "COPERNICUS_CLIENT_SECRET": "",
        }):
            response = self.client.post(
                "/api/satellite-imagery",
                json={"bbox": [-80.43, 37.20, -80.39, 37.25]},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["providerRequested"], "copernicus")
        self.assertEqual(body["provider"], "mock")
        self.assertEqual(body["status"], "fallback")
        self.assertTrue(body["manualUploadRecommended"])
        self.assertIn("unavailable", body["message"].lower())

    @patch("satellite_imagery._search_copernicus")
    @patch("satellite_imagery._copernicus_access_token", return_value="test-token")
    def test_copernicus_returns_live_metadata_pair(self, _token, search):
        search.side_effect = [
            [{
                "id": "before-item",
                "properties": {"datetime": "2026-07-28T10:00:00Z", "eo:cloud_cover": 4.5},
                "assets": {"thumbnail": {"href": "https://example.test/before.jpg"}},
            }],
            [{
                "id": "after-item",
                "properties": {"datetime": "2026-08-08T10:00:00Z", "eo:cloud_cover": 12.0},
                "assets": {"preview": {"href": "https://example.test/after.jpg"}},
            }],
        ]
        bbox = [-80.43, 37.20, -80.39, 37.25]
        with patch.dict("os.environ", {"SATELLITE_IMAGERY_PROVIDER": "copernicus"}):
            response = self.client.post(
                "/api/satellite-imagery",
                json={"bbox": bbox, "beforeDate": "2026-08-01", "afterDate": "2026-08-05"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["provider"], "copernicus")
        self.assertEqual(body["status"], "available")
        self.assertEqual(body["before"]["id"], "before-item")
        self.assertEqual(body["after"]["id"], "after-item")
        self.assertEqual(body["before"]["dataMode"], "live")
        self.assertEqual(body["after"]["previewUrl"], "https://example.test/after.jpg")
        self.assertFalse(body["manualUploadRecommended"])

    def test_satellite_imagery_rejects_invalid_bounds_dates_and_fields(self):
        invalid_requests = [
            {"bbox": [-80.39, 37.20, -80.43, 37.25]},
            {"bbox": [-181, 37.20, -80.39, 37.25]},
            {"bbox": [-80.43, 37.20, -80.39]},
            {"bbox": [-80.43, 37.20, -80.39, 37.25], "beforeDate": "2026-08-05", "afterDate": "2026-08-01"},
            {"bbox": [-80.43, 37.20, -80.39, 37.25], "unexpected": True},
        ]
        for request in invalid_requests:
            with self.subTest(request=request):
                self.assertEqual(self.client.post("/api/satellite-imagery", json=request).status_code, 422)


if __name__ == "__main__":
    unittest.main()
