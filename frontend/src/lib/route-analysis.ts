import type {
  ResponderMode,
  DemoDamageHazard,
  DisasterAreaBounds,
  RouteAnalysisRequest,
  RouteAnalysisResponse,
  RouteRecommendation,
  SelectedPlace,
} from "@/src/data/mock-disaster-data"

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
    const payload = await response.json().catch(() => null) as { detail?: unknown } | null
    throw new Error(response.status === 503
      ? "Road-network route unavailable. Try another start or destination."
      : response.status === 422
        ? "Choose a valid starting point, destination, and responder type."
        : typeof payload?.detail === "string"
          ? payload.detail
          : "Route analysis is unavailable. Check that the backend is running and try again.")
  }

  const data = await response.json() as Partial<RouteAnalysisResponse> & {
    recommendation?: Partial<RouteRecommendation>
  }

  const routeCoordinates = data.route?.geometry?.coordinates
  const validRoadGeometry = data.route?.geometry?.type === "LineString"
    && Array.isArray(routeCoordinates)
    && routeCoordinates.length > 2
    && routeCoordinates.every((coordinate) => Array.isArray(coordinate)
      && coordinate.length === 2
      && coordinate.every((value) => typeof value === "number" && Number.isFinite(value)))
  if (!data.recommendation || !data.route || !validRoadGeometry) {
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
  selectedArea,
  detectedHazards,
  signal,
}: {
  startingPlace: SelectedPlace
  destinationPlace: SelectedPlace
  responderType: ResponderMode
  selectedArea?: DisasterAreaBounds
  detectedHazards?: DemoDamageHazard[]
  signal: AbortSignal
}): Promise<RouteAnalysisResponse> {
  return analyzeRoute({
    startingPoint: { name: startingPlace.name, longitude: startingPlace.longitude, latitude: startingPlace.latitude },
    destination: { name: destinationPlace.name, longitude: destinationPlace.longitude, latitude: destinationPlace.latitude },
    responderType,
    selectedArea,
    detectedHazards,
  }, signal)
}
