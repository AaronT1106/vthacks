import type {
  ResponderMode,
  RouteAnalysisRequest,
  RouteAnalysisResponse,
  RouteRecommendation,
  SelectedPlace,
} from "@/src/data/mock-disaster-data"

const coordinateRouteProfiles: Record<ResponderMode, {
  routeName: string
  travelTime: string
  distance: string
  risk: "LOW" | "MEDIUM"
  confidence: number
  priority: string
  explanation: string
  offset: [number, number]
}> = {
  civilian: {
    routeName: "Safest Route",
    travelTime: "12 min",
    distance: "5.1 mi",
    risk: "LOW",
    confidence: 91,
    priority: "Lowest hazard exposure",
    explanation: "Uses an illustrative wider corridor to avoid the simulated flood and damaged bridge, accepting extra travel time for lower exposure.",
    offset: [-0.006, 0.006],
  },
  ambulance: {
    routeName: "Fastest Safe Route",
    travelTime: "8 min",
    distance: "4.2 mi",
    risk: "LOW",
    confidence: 89,
    priority: "Fast emergency access",
    explanation: "Uses an illustrative direct corridor that avoids the blocked bridge while preserving quick access to the selected destination.",
    offset: [0.002, -0.001],
  },
  firefighter: {
    routeName: "Emergency Access Route",
    travelTime: "7 min",
    distance: "3.8 mi",
    risk: "MEDIUM",
    confidence: 87,
    priority: "Emergency vehicle access",
    explanation: "Uses an illustrative apparatus-access corridor that avoids impassable roads while allowing limited moderate exposure near the incident.",
    offset: [-0.002, 0.003],
  },
  "supply-vehicle": {
    routeName: "Heavy Vehicle Route",
    travelTime: "16 min",
    distance: "7.3 mi",
    risk: "LOW",
    confidence: 85,
    priority: "Stable roads suitable for loaded vehicles",
    explanation: "Uses an illustrative larger-road corridor that avoids flooded local roads, narrow approaches, and the damaged bridge.",
    offset: [0.007, 0.005],
  },
  "emergency-coordinator": {
    routeName: "Operations Route",
    travelTime: "10 min",
    distance: "5.4 mi",
    risk: "MEDIUM",
    confidence: 84,
    priority: "Balanced critical-infrastructure access",
    explanation: "Uses an illustrative route balancing travel time, broader hazard exposure, and access between critical facilities.",
    offset: [0.004, 0.003],
  },
}

export async function analyzeRoute(
  request: RouteAnalysisRequest,
  signal: AbortSignal,
): Promise<RouteAnalysisResponse> {
  const response = await fetch("/api/analyze-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    throw new Error(response.status === 422
      ? "Choose a supported starting point, destination, and responder type."
      : "Route analysis is unavailable. Check that the backend is running and try again.")
  }

  const data = await response.json() as Partial<RouteAnalysisResponse> & {
    recommendation?: Partial<RouteRecommendation>
  }

  if (!data.recommendation || !data.route) {
    throw new Error("Route analysis returned an incomplete response. Restart the backend and try again.")
  }

  const hazardsAvoided = Array.isArray(data.recommendation.hazardsAvoided)
    ? data.recommendation.hazardsAvoided.filter((hazard): hazard is string => typeof hazard === "string")
    : []
  const alternative = data.recommendation.alternative ?? {
    routeName: "Alternative unavailable",
    risk: "HIGH" as const,
    rejectionReason: "The backend did not provide alternative-route details.",
  }

  return {
    ...data,
    recommendation: {
      ...data.recommendation,
      recommendedDestination: data.recommendation.recommendedDestination ?? "Requested destination",
      hazardsAvoided,
      alternative,
    },
  } as RouteAnalysisResponse
}

export async function analyzeCoordinateRoute({
  startingPlace,
  destinationPlace,
  responderType,
  signal,
}: {
  startingPlace: SelectedPlace
  destinationPlace: SelectedPlace
  responderType: ResponderMode
  signal: AbortSignal
}): Promise<RouteAnalysisResponse> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 650)
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer)
      reject(new DOMException("Route analysis cancelled.", "AbortError"))
    }, { once: true })
  })

  const profile = coordinateRouteProfiles[responderType]
  const midpointLongitude = (startingPlace.longitude + destinationPlace.longitude) / 2
  const midpointLatitude = (startingPlace.latitude + destinationPlace.latitude) / 2

  return {
    startingPoint: startingPlace.presetId ?? "selected-mapbox-start",
    destination: destinationPlace.presetId ?? "selected-mapbox-destination",
    responderType,
    dataSource: "mock",
    recommendation: {
      role: responderType,
      routeName: profile.routeName,
      recommendedDestination: destinationPlace.name,
      travelTime: profile.travelTime,
      distance: profile.distance,
      risk: profile.risk,
      confidence: profile.confidence,
      priority: profile.priority,
      explanation: `${profile.explanation} This frontend-only route uses mock coordinates and requires human verification.`,
      hazardsAvoided: ["Simulated flood zone", "Simulated damaged bridge"],
      alternative: {
        routeName: "Direct Hazard Corridor",
        risk: "HIGH",
        rejectionReason: "Rejected because the illustrative direct path intersects simulated hazards.",
      },
    },
    route: {
      id: `mock-coordinate-${responderType}`,
      name: profile.routeName,
      kind: "safe",
      coordinates: [
        [startingPlace.longitude, startingPlace.latitude],
        [midpointLongitude + profile.offset[0], midpointLatitude + profile.offset[1]],
        [destinationPlace.longitude, destinationPlace.latitude],
      ],
    },
  }
}
