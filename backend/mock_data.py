"""Preset values from the existing frontend demo; all values are simulated."""

STARTING_POINTS = {
    "blacksburg-fire-station": {
        "name": "Blacksburg Fire Station", "coordinates": (-80.4202, 37.2306),
    },
    "virginia-tech-rescue": {
        "name": "Virginia Tech Rescue Squad", "coordinates": (-80.4247, 37.2246),
    },
}

DESTINATIONS = {
    "lewisgale-hospital": {
        "name": "LewisGale Hospital Montgomery", "coordinates": (-80.4093, 37.2107),
    },
    "blacksburg-shelter": {
        "name": "Blacksburg Community Shelter", "coordinates": (-80.4015, 37.2226),
    },
}

ROLE_PROFILES = {
    "civilian": {
        "routeName": "Shelter Safety Route", "recommendedDestination": "Blacksburg Community Shelter",
        "destinationCoordinates": (-80.4015, 37.2226),
        "routeCoordinates": [(-80.4265, 37.234), (-80.412, 37.236), (-80.402, 37.229)],
        "travelTime": "12 min", "distance": "5.1 mi",
        "risk": "LOW", "confidence": 97, "priority": "Lowest hazard exposure to a safe shelter",
        "hazardsAvoided": ["Route 460 flooding", "Hospital access congestion"],
        "selectionReason": (
            "The shelter route keeps civilians farthest from floodwater and congested infrastructure, "
            "accepting extra travel time for the largest safety buffer."
        ),
        "alternative": {
            "routeName": "Direct Shelter Route", "risk": "HIGH",
            "rejectionReason": "Rejected because it crosses the simulated Route 460 flood extent.",
        },
    },
    "ambulance": {
        "routeName": "Hospital Priority Route", "recommendedDestination": "LewisGale Hospital Montgomery",
        "destinationCoordinates": (-80.4093, 37.2107),
        "routeCoordinates": [(-80.428, 37.225), (-80.424, 37.215), (-80.416, 37.2115)],
        "travelTime": "8 min", "distance": "4.2 mi",
        "risk": "LOW", "confidence": 94, "priority": "Fast, reliable hospital access",
        "hazardsAvoided": ["Route 460 flooding", "Blocked hospital approach"],
        "selectionReason": (
            "The hospital route minimizes response time while bypassing the flooded hospital approach."
        ),
        "alternative": {
            "routeName": "Route 460 Hospital Express", "risk": "HIGH",
            "rejectionReason": "Rejected because its faster direct corridor intersects simulated flooding.",
        },
    },
    "firefighter": {
        "routeName": "Incident Access Route", "recommendedDestination": "Route 460 Incident Staging",
        "destinationCoordinates": (-80.4182, 37.2225),
        "routeCoordinates": [(-80.423, 37.232), (-80.4195, 37.228), (-80.417, 37.225)],
        "travelTime": "6 min", "distance": "2.9 mi",
        "risk": "MEDIUM", "confidence": 90, "priority": "Incident access for fire apparatus",
        "hazardsAvoided": ["Blocked Route 460 lanes", "Flooded incident approach"],
        "selectionReason": (
            "The staging route approaches the incident on wider roads while bypassing blocked lanes and flooding."
        ),
        "alternative": {
            "routeName": "Downtown Incident Approach", "risk": "HIGH",
            "rejectionReason": "Rejected because a blocked intersection may prevent fire-apparatus access.",
        },
    },
    "supply-vehicle": {
        "routeName": "Heavy Vehicle Supply Route", "recommendedDestination": "Emergency Supply Depot",
        "destinationCoordinates": (-80.3985, 37.228),
        "routeCoordinates": [(-80.429, 37.238), (-80.414, 37.241), (-80.401, 37.236)],
        "travelTime": "16 min", "distance": "7.3 mi",
        "risk": "LOW", "confidence": 88, "priority": "Heavy-vehicle road access",
        "hazardsAvoided": ["Route 460 flooding", "Weight-restricted local roads"],
        "selectionReason": (
            "The supply route uses roads suitable for loaded trucks and avoids the flood zone and restricted roads."
        ),
        "alternative": {
            "routeName": "South Main Freight Route", "risk": "HIGH",
            "rejectionReason": "Rejected because it requires weight-restricted roads near the flood zone.",
        },
    },
    "emergency-coordinator": {
        "routeName": "Critical Access Loop", "recommendedDestination": "Critical Infrastructure Access Hub",
        "destinationCoordinates": (-80.4085, 37.2255),
        "routeCoordinates": [(-80.427, 37.23), (-80.418, 37.235), (-80.409, 37.232)],
        "travelTime": "10 min", "distance": "5.4 mi",
        "risk": "MEDIUM", "confidence": 86, "priority": "Access to the highest-impact infrastructure",
        "hazardsAvoided": ["Route 460 flood core", "Hospital access congestion"],
        "selectionReason": (
            "The critical-access loop maintains links to the hospital, shelter, and incident edge while exposing "
            "the coordinator to the highest-impact simulated areas on the map."
        ),
        "alternative": {
            "routeName": "Single-Corridor Command Route", "risk": "HIGH",
            "rejectionReason": "Rejected because one closure would cut access to multiple critical facilities.",
        },
    },
}
