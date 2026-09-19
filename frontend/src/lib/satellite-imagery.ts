import type { DisasterAreaBounds } from "@/src/data/mock-disaster-data"

export interface SatelliteImageMetadata {
  id: string
  source: string
  capturedAt: string
  cloudCoverage: number | null
  previewUrl: string | null
  dataMode: "live" | "demo"
  bbox: [number, number, number, number]
}

export interface SatelliteImageryResponse {
  provider: "mock" | "copernicus"
  providerRequested: "mock" | "copernicus"
  status: "available" | "fallback" | "unavailable"
  message: string
  bbox: [number, number, number, number]
  before: SatelliteImageMetadata | null
  after: SatelliteImageMetadata | null
  manualUploadRecommended: boolean
}

function isBoundingBox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value)
    && value.length === 4
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
}

function boxesMatch(first: [number, number, number, number], second: [number, number, number, number]) {
  return first.every((coordinate, index) => Math.abs(coordinate - second[index]) < 0.0000001)
}

function normalizeImage(value: unknown): SatelliteImageMetadata | null {
  if (!value || typeof value !== "object") return null
  const image = value as Partial<SatelliteImageMetadata>
  if (
    typeof image.id !== "string"
    || typeof image.source !== "string"
    || typeof image.capturedAt !== "string"
    || Number.isNaN(Date.parse(image.capturedAt))
    || (image.dataMode !== "live" && image.dataMode !== "demo")
    || !isBoundingBox(image.bbox)
  ) return null

  const cloudCoverage = typeof image.cloudCoverage === "number"
    && Number.isFinite(image.cloudCoverage)
    && image.cloudCoverage >= 0
    && image.cloudCoverage <= 100
    ? image.cloudCoverage
    : null
  const previewUrl = typeof image.previewUrl === "string" && image.previewUrl.startsWith("https://")
    ? image.previewUrl
    : null
  return { ...image, cloudCoverage, previewUrl } as SatelliteImageMetadata
}

export async function fetchSatelliteImagery({
  bounds,
  beforeDate,
  afterDate,
  signal,
}: {
  bounds: DisasterAreaBounds
  beforeDate?: string
  afterDate?: string
  signal?: AbortSignal
}): Promise<SatelliteImageryResponse> {
  const response = await fetch("/api/satellite-imagery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
      ...(beforeDate ? { beforeDate } : {}),
      ...(afterDate ? { afterDate } : {}),
    }),
    signal,
  })
  if (!response.ok) {
    throw new Error(response.status === 422
      ? "Choose a valid area and ensure the before date is earlier than the after date."
      : "Satellite imagery lookup is unavailable. Use manual upload or try again.")
  }

  const data = await response.json() as Partial<SatelliteImageryResponse>
  const before = normalizeImage(data.before)
  const after = normalizeImage(data.after)
  const requestedBbox: [number, number, number, number] = [
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ]
  if (
    (data.provider !== "mock" && data.provider !== "copernicus")
    || (data.providerRequested !== "mock" && data.providerRequested !== "copernicus")
    || !["available", "fallback", "unavailable"].includes(data.status ?? "")
    || typeof data.message !== "string"
    || !isBoundingBox(data.bbox)
    || !boxesMatch(data.bbox, requestedBbox)
    || (before && !boxesMatch(before.bbox, requestedBbox))
    || (after && !boxesMatch(after.bbox, requestedBbox))
  ) throw new Error("Satellite imagery lookup returned an incomplete response. Use manual upload.")

  return {
    provider: data.provider,
    providerRequested: data.providerRequested,
    status: data.status as SatelliteImageryResponse["status"],
    message: data.message,
    bbox: data.bbox,
    before,
    after,
    manualUploadRecommended: data.manualUploadRecommended !== false,
  }
}
