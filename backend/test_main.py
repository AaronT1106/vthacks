"""Run with: python -m unittest -v (from backend/)."""

import unittest

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
                        self.assertEqual(recommendation["risk"], ROLE_PROFILES[role]["risk"])
                        self.assertIn(DESTINATIONS[destination]["name"], recommendation["explanation"])
                        self.assertIn("preset demo values", recommendation["explanation"])
                        self.assertEqual(body["route"]["coordinates"][0], list(STARTING_POINTS[start]["coordinates"]))
                        self.assertEqual(body["route"]["coordinates"][-1], list(DESTINATIONS[destination]["coordinates"]))

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


if __name__ == "__main__":
    unittest.main()
