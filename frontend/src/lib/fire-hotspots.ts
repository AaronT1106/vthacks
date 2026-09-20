import type { DisasterAreaBounds } from "@/src/data/mock-disaster-data"

export interface FireHotspotDetection {
  latitude: number
  longitude: number
  acquisitionDate: string
  acquisitionTime: string
  acquiredAt: string | null
  satellite: string | null
  instrument: string | null
  confidence: string | null
  frp: number | null
  brightness: number | null
  scan: number | null
  track: number | null
  version: string | null
  brightTi5: number | null
  dayNight: string | null
}

export interface FireHotspotResult {
  status: "success"
  analysisType: "active_fire_hotspots"
  source: {
    provider: "NASA FIRMS"
    sensor: "VIIRS"
    product: "VIIRS_NOAA21_NRT"
    dayRange: number
  }
  bounds: DisasterAreaBounds
  detectionCount: number
  detections: FireHotspotDetection[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isDetection(value: unknown): value is FireHotspotDetection {
  if (!value || typeof value !== "object") return false
  const detection = value as Partial<FireHotspotDetection>
  return isFiniteNumber(detection.latitude)
    && detection.latitude >= -90 && detection.latitude <= 90
    && isFiniteNumber(detection.longitude)
    && detection.longitude >= -180 && detection.longitude <= 180
    && typeof detection.acquisitionDate === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(detection.acquisitionDate)
    && typeof detection.acquisitionTime === "string"
    && /^\d{4}$/.test(detection.acquisitionTime)
    && (detection.acquiredAt === null
      || (typeof detection.acquiredAt === "string" && Number.isFinite(Date.parse(detection.acquiredAt))))
    && isNullableString(detection.satellite)
    && isNullableString(detection.instrument)
    && isNullableString(detection.confidence)
    && isNullableNumber(detection.frp)
    && isNullableNumber(detection.brightness)
    && isNullableNumber(detection.scan)
    && isNullableNumber(detection.track)
    && isNullableString(detection.version)
    && isNullableNumber(detection.brightTi5)
    && isNullableString(detection.dayNight)
}

function boundsMatch(responseBounds: unknown, requested: DisasterAreaBounds): responseBounds is DisasterAreaBounds {
  if (!responseBounds || typeof responseBounds !== "object") return false
  const bounds = responseBounds as Partial<DisasterAreaBounds>
  return (["west", "south", "east", "north"] as const).every((key) => (
    isFiniteNumber(bounds[key]) && Math.abs(bounds[key] - requested[key]) <= 0.0000001
  ))
}

function normalizeResponse(value: unknown, requestedBounds: DisasterAreaBounds): FireHotspotResult | null {
  if (!value || typeof value !== "object") return null
  const result = value as Partial<FireHotspotResult>
  const source = result.source as Partial<FireHotspotResult["source"]> | undefined
  if (
    result.status !== "success"
    || result.analysisType !== "active_fire_hotspots"
    || source?.provider !== "NASA FIRMS"
    || source.sensor !== "VIIRS"
    || source.product !== "VIIRS_NOAA21_NRT"
    || !Number.isInteger(source.dayRange)
    || (source.dayRange ?? 0) < 1
    || (source.dayRange ?? 0) > 5
    || !boundsMatch(result.bounds, requestedBounds)
    || !Number.isInteger(result.detectionCount)
    || (result.detectionCount ?? -1) < 0
    || !Array.isArray(result.detections)
    || result.detections.length !== result.detectionCount
    || !result.detections.every(isDetection)
  ) return null

  const { west, south, east, north } = requestedBounds
  if (result.detections.some((detection) => (
    detection.longitude < west || detection.longitude > east
    || detection.latitude < south || detection.latitude > north
  ))) return null
  return result as FireHotspotResult
}

export async function fetchFireHotspots(
  bounds: DisasterAreaBounds,
  signal: AbortSignal,
): Promise<FireHotspotResult> {
  let response: Response
  try {
    response = await fetch("/api/fire-hotspots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bounds),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new Error("Unable to reach NASA FIRMS through the DisasterLens backend.")
  }

  const data = await response.json().catch(() => null) as unknown
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data
      ? (data as { detail?: unknown }).detail
      : null
    if (typeof detail === "string" && detail.length > 0 && detail.length <= 240) {
      throw new Error(detail)
    }
    if (response.status === 422) throw new Error("The confirmed disaster-area bounds are invalid.")
    throw new Error("NASA FIRMS could not complete the hotspot lookup. Please try again.")
  }

  const normalized = normalizeResponse(data, bounds)
  if (!normalized) throw new Error("NASA FIRMS returned an incomplete hotspot response.")
  return normalized
}
