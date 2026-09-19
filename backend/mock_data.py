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
        "routeName": "Route C", "travelTime": "11 min", "distance": "4.8 mi",
        "risk": "LOW", "confidence": 96, "priority": "Minimum hazard exposure",
    },
    "ambulance": {
        "routeName": "Route B", "travelTime": "8 min", "distance": "4.2 mi",
        "risk": "LOW", "confidence": 94, "priority": "Fast, reliable hospital access",
    },
    "firefighter": {
        "routeName": "Route B", "travelTime": "7 min", "distance": "4.2 mi",
        "risk": "LOW", "confidence": 91, "priority": "Emergency vehicle access",
    },
    "supply-vehicle": {
        "routeName": "Route D", "travelTime": "14 min", "distance": "6.1 mi",
        "risk": "LOW", "confidence": 89, "priority": "Heavy vehicle clearance",
    },
    "emergency-coordinator": {
        "routeName": "Route B + network view", "travelTime": "8 min", "distance": "4.2 mi",
        "risk": "MEDIUM", "confidence": 92, "priority": "Infrastructure-wide awareness",
    },
}
