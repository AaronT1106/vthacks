import type { DisasterAreaBounds } from "@/src/data/mock-disaster-data"

export interface AnalyzeDamageResponse {
  status: "received"
  message: string
  before_filename: string
  after_filename: string
  before_content_type: string
  after_content_type: string
  bounds: DisasterAreaBounds
}

function isReceipt(value: unknown): value is AnalyzeDamageResponse {
  if (!value || typeof value !== "object") return false
  const receipt = value as Partial<AnalyzeDamageResponse>
  const bounds = receipt.bounds as Partial<DisasterAreaBounds> | undefined
  return receipt.status === "received"
    && typeof receipt.message === "string"
    && receipt.message.length > 0
    && typeof receipt.before_filename === "string"
    && typeof receipt.after_filename === "string"
    && typeof receipt.before_content_type === "string"
    && typeof receipt.after_content_type === "string"
    && Boolean(bounds)
    && Number.isFinite(bounds?.west)
    && Number.isFinite(bounds?.south)
    && Number.isFinite(bounds?.east)
    && Number.isFinite(bounds?.north)
}

async function parseJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    return null
  }
}

export async function analyzeDamage(
  bounds: DisasterAreaBounds,
  beforeImage: File,
  afterImage: File,
  signal: AbortSignal,
): Promise<AnalyzeDamageResponse> {
  const formData = new FormData()
  formData.append("before_image", beforeImage)
  formData.append("after_image", afterImage)
  formData.append("west", String(bounds.west))
  formData.append("south", String(bounds.south))
  formData.append("east", String(bounds.east))
  formData.append("north", String(bounds.north))

  const response = await fetch("/api/analyze-damage", {
    method: "POST",
    body: formData,
    signal,
  })
  const data = await parseJson(response)

  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data
      ? (data as { detail?: unknown }).detail
      : null
    if (typeof detail === "string" && detail.length > 0 && detail.length <= 200) {
      throw new Error(detail)
    }
    if (response.status >= 500 && data === null) {
      throw new Error("Unable to reach the damage-analysis service. Check that the backend is running and try again.")
    }
    throw new Error("Damage-analysis service returned an error. Please try again.")
  }

  if (!isReceipt(data)) {
    throw new Error("Damage-analysis service returned an incomplete response.")
  }
  return data
}
