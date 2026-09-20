import type { DisasterAreaBounds } from "@/src/data/mock-disaster-data"
import type { SatelliteImageMetadata } from "@/src/lib/satellite-imagery"

export interface FloodAnalysisResult {
  status: "success"
  analysisType: "flood_segmentation"
  model: {
    architecture: "SegFormer-B0"
    identifier: string
    revision: string
    device: "cuda" | "mps" | "cpu"
  }
  image: {
    width: number
    height: number
    format: string
    mode: string
    byteSize: number
  }
  processing: {
    inputWidth: number
    inputHeight: number
    rawOutputShape: number[]
  }
  flood: {
    floodPixelCount: number
    totalPixelCount: number
    invalidPixelCount: number
    floodCoveragePercent: number
  }
  mask: {
    url: string
    width: number
    height: number
  }
  acquisition: {
    source: "manual" | "satellite"
    bbox: [number, number, number, number]
    provider: string | null
    sceneId: string | null
    capturedAt: string | null
    cloudCoverage: number | null
    dataMode: "live" | null
    filename: string | null
    contentType: string | null
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isBounds(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber)
}

function isFloodAnalysisResult(value: unknown): value is FloodAnalysisResult {
  if (!value || typeof value !== "object") return false
  const result = value as Partial<FloodAnalysisResult>
  const model = result.model as Partial<FloodAnalysisResult["model"]> | undefined
  const image = result.image as Partial<FloodAnalysisResult["image"]> | undefined
  const processing = result.processing as Partial<FloodAnalysisResult["processing"]> | undefined
  const flood = result.flood as Partial<FloodAnalysisResult["flood"]> | undefined
  const mask = result.mask as Partial<FloodAnalysisResult["mask"]> | undefined
  const acquisition = result.acquisition as Partial<FloodAnalysisResult["acquisition"]> | undefined
  const acquisitionIsValid = acquisition?.source === "manual"
    ? typeof acquisition.filename === "string" && acquisition.filename.length > 0
      && typeof acquisition.contentType === "string" && acquisition.contentType.startsWith("image/")
    : acquisition?.source === "satellite"
      && acquisition.provider === "Copernicus Sentinel-2"
      && typeof acquisition.sceneId === "string" && acquisition.sceneId.length > 0
      && typeof acquisition.capturedAt === "string" && Number.isFinite(Date.parse(acquisition.capturedAt))
      && isFiniteNumber(acquisition.cloudCoverage)
      && acquisition.cloudCoverage >= 0 && acquisition.cloudCoverage <= 100
      && acquisition.dataMode === "live"
  return result.status === "success"
    && result.analysisType === "flood_segmentation"
    && model?.architecture === "SegFormer-B0"
    && typeof model.identifier === "string"
    && typeof model.revision === "string"
    && ["cuda", "mps", "cpu"].includes(model.device ?? "")
    && isFiniteNumber(image?.width) && image.width > 0
    && isFiniteNumber(image?.height) && image.height > 0
    && typeof image.format === "string"
    && typeof image.mode === "string"
    && isFiniteNumber(image.byteSize) && image.byteSize > 0
    && isFiniteNumber(processing?.inputWidth) && processing.inputWidth > 0
    && isFiniteNumber(processing?.inputHeight) && processing.inputHeight > 0
    && Array.isArray(processing.rawOutputShape) && processing.rawOutputShape.every(isFiniteNumber)
    && isFiniteNumber(flood?.floodPixelCount) && flood.floodPixelCount >= 0
    && isFiniteNumber(flood?.totalPixelCount) && flood.totalPixelCount >= 0
    && isFiniteNumber(flood?.invalidPixelCount) && flood.invalidPixelCount >= 0
    && isFiniteNumber(flood?.floodCoveragePercent)
    && flood.floodCoveragePercent >= 0 && flood.floodCoveragePercent <= 100
    && typeof mask?.url === "string"
    && /^\/api\/flood-analysis\/mask\/[a-f0-9]{32}$/.test(mask.url)
    && mask.width === image.width && mask.height === image.height
    && acquisitionIsValid
    && acquisition !== undefined
    && isBounds(acquisition.bbox)
}

function previewId(image: SatelliteImageMetadata) {
  const match = image.imageUrl?.match(/^\/api\/satellite-imagery\/preview\/([a-f0-9]{32})$/)
  return match?.[1] ?? null
}

export async function analyzeFlood({
  bounds,
  afterImage,
  satelliteImage,
  signal,
}: {
  bounds: DisasterAreaBounds
  afterImage?: File
  satelliteImage?: SatelliteImageMetadata
  signal: AbortSignal
}): Promise<FloodAnalysisResult> {
  const formData = new FormData()
  formData.append("west", String(bounds.west))
  formData.append("south", String(bounds.south))
  formData.append("east", String(bounds.east))
  formData.append("north", String(bounds.north))

  if (afterImage) {
    formData.append("source", "manual")
    formData.append("after_image", afterImage)
  } else if (satelliteImage) {
    const id = previewId(satelliteImage)
    if (!id) throw new Error("The selected Sentinel-2 After image has expired. Fetch the imagery again.")
    formData.append("source", "satellite")
    formData.append("after_preview_id", id)
  } else {
    throw new Error("A valid After image is required for flood analysis.")
  }

  let response: Response
  try {
    response = await fetch("/api/analyze-flood", {
      method: "POST",
      body: formData,
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new Error("Unable to reach the flood-analysis service. Check that the backend is running and try again.")
  }
  const data = await response.json().catch(() => null) as unknown
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data
      ? (data as { detail?: unknown }).detail
      : null
    if (typeof detail === "string" && detail.length > 0 && detail.length <= 240) throw new Error(detail)
    throw new Error("Flood-analysis service returned an error. Please try again.")
  }
  if (!isFloodAnalysisResult(data)) {
    throw new Error("Flood-analysis service returned an incomplete response.")
  }
  return data
}
