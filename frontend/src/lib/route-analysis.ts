import type {
  RouteAnalysisRequest,
  RouteAnalysisResponse,
  RouteRecommendation,
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
