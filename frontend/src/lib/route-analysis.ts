import type { RouteAnalysisRequest, RouteAnalysisResponse } from "@/src/data/mock-disaster-data"

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

  return response.json() as Promise<RouteAnalysisResponse>
}
