import type { DisasterAreaBounds } from "@/src/data/mock-disaster-data"

export interface SatelliteImageMetadata {
  id: string
  source: "Copernicus Sentinel-2"
  layerName: string
  requestedDate: string
  captureDate: string
  cloudCoverage: number
  candidateCount: number
  selectionStatus: "automatic" | "higher-cloud-option"
  imageUrl: string | null
  dataMode: "live"
  bbox: [number, number, number, number]
}

export interface SatelliteImageryResponse {
  provider: "mock" | "sentinel-2"
  status: "available" | "selection-required" | "fallback" | "unavailable"
  message: string
  bbox: [number, number, number, number]
  before: SatelliteImageMetadata | null
  after: SatelliteImageMetadata | null
  beforeCandidates: SatelliteImageMetadata[]
  afterCandidates: SatelliteImageMetadata[]
  comparisonReady: boolean
  comparisonMessage: string
  failure: SatelliteImageryFailure | null
  manualUploadRecommended: boolean
}

export interface SatelliteImageryFailure {
  code: "no_candidate_scene" | "same_scene_rejected" | "preview_url_generation_failed" | "preview_image_fetch_failed" | "provider_authentication_failed"
  stage: string
  detail: string
}

export function isValidComparisonPair(before: SatelliteImageMetadata, after: SatelliteImageMetadata) {
  return getComparisonValidationFailure(before, after) === null
}

export function getComparisonValidationFailure(before: SatelliteImageMetadata, after: SatelliteImageMetadata) {
  const beforeTime = Date.parse(before.captureDate)
  const afterTime = Date.parse(after.captureDate)
  const incidentTime = Date.parse(`${after.requestedDate}T00:00:00Z`)
  if (before.id === after.id || before.captureDate === after.captureDate) return "The frontend rejected duplicate Before and After scenes."
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime) || !Number.isFinite(incidentTime)) return "The frontend received an invalid capture or requested date."
  if (beforeTime >= incidentTime) return "The Before scene was not captured before the requested After date."
  if (afterTime < incidentTime) return "The After scene was captured before the requested After date."
  if (afterTime - beforeTime < 24 * 60 * 60 * 1000) return "The selected scenes are less than 24 hours apart."
  return null
}

function isBoundingBox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
}

function boxesMatch(first: [number, number, number, number], second: [number, number, number, number]) {
  return first.every((coordinate, index) => Math.abs(coordinate - second[index]) < 0.0000001)
}

function isSafePreviewUrl(value: unknown) {
  return typeof value === "string" && /^\/api\/satellite-imagery\/preview\/[a-f0-9]{32}$/.test(value)
}

function normalizeImage(value: unknown): SatelliteImageMetadata | null {
  if (!value || typeof value !== "object") return null
  const image = value as Partial<SatelliteImageMetadata>
  if (
    typeof image.id !== "string"
    || image.source !== "Copernicus Sentinel-2"
    || typeof image.layerName !== "string"
    || typeof image.requestedDate !== "string"
    || typeof image.captureDate !== "string"
    || Number.isNaN(Date.parse(image.captureDate))
    || typeof image.cloudCoverage !== "number"
    || image.cloudCoverage < 0
    || image.cloudCoverage > 100
    || typeof image.candidateCount !== "number"
    || !Number.isInteger(image.candidateCount)
    || image.candidateCount < 0
    || (image.selectionStatus !== "automatic" && image.selectionStatus !== "higher-cloud-option")
    || image.dataMode !== "live"
    || !isBoundingBox(image.bbox)
    || !isSafePreviewUrl(image.imageUrl)
  ) return null
  return image as SatelliteImageMetadata
}

export async function fetchSatelliteImagery({ bounds, beforeDate, afterDate, signal }: {
  bounds: DisasterAreaBounds
  beforeDate?: string
  afterDate?: string
  signal?: AbortSignal
}): Promise<SatelliteImageryResponse> {
  const requestedBbox: [number, number, number, number] = [bounds.west, bounds.south, bounds.east, bounds.north]
  let response: Response
  try {
    response = await fetch("/api/satellite-imagery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox: requestedBbox, beforeDate, afterDate }),
      signal,
    })
  } catch {
    throw new Error(process.env.NODE_ENV === "development"
      ? "Next.js proxy failure: /api/satellite-imagery could not reach the configured BACKEND_URL."
      : "Satellite imagery lookup is unavailable. Use manual upload or try again.")
  }
  const data = await response.json().catch(() => null) as Partial<SatelliteImageryResponse> | null
  if (!response.ok) {
    if (response.status === 422) throw new Error("Choose valid Sentinel-2 dates, with Before earlier than After.")
    throw new Error(process.env.NODE_ENV === "development"
      ? `Next.js proxy/backend request failed with HTTP ${response.status}.`
      : "Sentinel-2 imagery lookup is unavailable. Use manual upload or try again.")
  }
  if (!data) throw new Error("Sentinel-2 returned no response. Use manual upload.")
  const before = normalizeImage(data.before)
  const after = normalizeImage(data.after)
  const beforeCandidates = Array.isArray(data.beforeCandidates)
    ? data.beforeCandidates.map(normalizeImage).filter((image): image is SatelliteImageMetadata => Boolean(image)).slice(0, 3)
    : []
  const afterCandidates = Array.isArray(data.afterCandidates)
    ? data.afterCandidates.map(normalizeImage).filter((image): image is SatelliteImageMetadata => Boolean(image)).slice(0, 3)
    : []
  const failure = data.failure && typeof data.failure === "object"
    && typeof data.failure.code === "string"
    && typeof data.failure.stage === "string"
    && typeof data.failure.detail === "string"
    ? data.failure as SatelliteImageryFailure
    : null
  if (
    (data.provider !== "mock" && data.provider !== "sentinel-2")
    || !["available", "selection-required", "fallback", "unavailable"].includes(data.status ?? "")
    || typeof data.message !== "string"
    || typeof data.comparisonReady !== "boolean"
    || typeof data.comparisonMessage !== "string"
    || !isBoundingBox(data.bbox)
    || !boxesMatch(data.bbox, requestedBbox)
    || (before && !boxesMatch(before.bbox, requestedBbox))
    || (after && !boxesMatch(after.bbox, requestedBbox))
  ) throw new Error("Sentinel-2 returned an incomplete response. Use manual upload.")
  if ((data.status === "available" || data.status === "selection-required") && (!before || !after)) {
    throw new Error("Sentinel-2 did not return a complete image pair. Use manual upload.")
  }
  return {
    provider: data.provider,
    status: data.status as SatelliteImageryResponse["status"],
    message: data.message,
    bbox: data.bbox,
    before,
    after,
    beforeCandidates,
    afterCandidates,
    comparisonReady: data.comparisonReady,
    comparisonMessage: data.comparisonMessage,
    failure,
    manualUploadRecommended: data.manualUploadRecommended !== false,
  }
}
