import type { FeatureCollection, Polygon } from "geojson"
import type { DisasterAreaBounds } from "@/src/data/mock-disaster-data"

const MAX_GRID_CELLS_PER_AXIS = 32
const MIN_VISIBLE_DENSITY = 0.08

export interface FloodDensityProperties {
  density: number
  densityPercent: number
}

export async function createFloodDensityGrid(
  mask: Blob,
  bounds: DisasterAreaBounds,
): Promise<FeatureCollection<Polygon, FloodDensityProperties>> {
  const bitmap = await createImageBitmap(mask)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Flood density canvas is unavailable.")
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const landscape = bitmap.width >= bitmap.height
    const columns = landscape
      ? MAX_GRID_CELLS_PER_AXIS
      : Math.max(1, Math.round(MAX_GRID_CELLS_PER_AXIS * bitmap.width / bitmap.height))
    const rows = landscape
      ? Math.max(1, Math.round(MAX_GRID_CELLS_PER_AXIS * bitmap.height / bitmap.width))
      : MAX_GRID_CELLS_PER_AXIS
    const longitudeSpan = bounds.east - bounds.west
    const latitudeSpan = bounds.north - bounds.south
    const features: FeatureCollection<Polygon, FloodDensityProperties>["features"] = []

    for (let row = 0; row < rows; row += 1) {
      const startY = Math.floor(row * bitmap.height / rows)
      const endY = Math.floor((row + 1) * bitmap.height / rows)
      for (let column = 0; column < columns; column += 1) {
        const startX = Math.floor(column * bitmap.width / columns)
        const endX = Math.floor((column + 1) * bitmap.width / columns)
        let waterPixels = 0
        const cellPixels = (endX - startX) * (endY - startY)

        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            if (pixels[(y * bitmap.width + x) * 4 + 3] > 0) waterPixels += 1
          }
        }

        const density = cellPixels > 0 ? waterPixels / cellPixels : 0
        if (density < MIN_VISIBLE_DENSITY) continue
        const west = bounds.west + (startX / bitmap.width) * longitudeSpan
        const east = bounds.west + (endX / bitmap.width) * longitudeSpan
        const north = bounds.north - (startY / bitmap.height) * latitudeSpan
        const south = bounds.north - (endY / bitmap.height) * latitudeSpan
        features.push({
          type: "Feature",
          properties: { density, densityPercent: Math.round(density * 1000) / 10 },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [west, north],
              [east, north],
              [east, south],
              [west, south],
              [west, north],
            ]],
          },
        })
      }
    }

    return { type: "FeatureCollection", features }
  } finally {
    bitmap.close()
  }
}
