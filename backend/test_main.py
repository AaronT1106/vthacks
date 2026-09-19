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


if __name__ == "__main__":
    unittest.main()
