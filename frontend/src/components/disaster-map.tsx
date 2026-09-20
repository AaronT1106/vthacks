"use client"

import { useEffect, useRef, useState } from "react"
import {
  Building2,
  LocateFixed,
  MapPin,
  Navigation,
  TentTree,
} from "lucide-react"
import type { FeatureCollection, LineString, Point, Polygon } from "geojson"
import type { GeoJSONSource, ImageSource, Map as MapboxMap } from "mapbox-gl"
import type { FireHotspotResult } from "@/src/lib/fire-hotspots"
import { createFloodDensityGrid, type FloodDensityProperties } from "@/src/lib/flood-density"
import type { FloodAnalysisResult } from "@/src/lib/flood-analysis"
import {
  hazards,
  hospitals,
  incident,
  shelters,
  type Hazard,
  type DestinationType,
  type MapLayerVisibility,
  type Route,
  type Coordinates,
  type DisasterAreaBounds,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

interface DisasterMapProps {
  layers: MapLayerVisibility
  analysisComplete: boolean
  recommendedRoute: Route | null
  startingPlace: SelectedPlace | null
  destinationPlace: SelectedPlace | null
  destinationType: DestinationType
  disasterAreaBounds: DisasterAreaBounds | null
  floodAnalysisResult: FloodAnalysisResult | null
  fireHotspotResult: FireHotspotResult | null
  onFloodOverlayStatusChange: (message: string) => void
}

interface CurrentMapState {
  layers: MapLayerVisibility
  analysisComplete: boolean
  recommendedRoute: Route | null
  startingPlace: SelectedPlace | null
  destinationPlace: SelectedPlace | null
  destinationType: DestinationType
  disasterAreaBounds: DisasterAreaBounds | null
  floodAnalysisResult: FloodAnalysisResult | null
  fireHotspotResult: FireHotspotResult | null
  floodMaskUrl: string | null
  floodDensityData: FeatureCollection<Polygon, FloodDensityProperties> | null
}

interface StoredCamera {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

const DARK_MAP_STYLE = "mapbox://styles/mapbox/dark-v11"
const SATELLITE_MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"
const FLOOD_ANALYSIS_SOURCE_ID = "analysis-flood-mask"
const FLOOD_ANALYSIS_LAYER_ID = "analysis-flood-mask-raster"
const FLOOD_DENSITY_SOURCE_ID = "analysis-flood-density"
const FLOOD_DENSITY_LAYER_ID = "analysis-flood-density-fill"
const FIRE_ANALYSIS_SOURCE_ID = "analysis-fire-hotspots"
const FIRE_ANALYSIS_LAYER_ID = "analysis-fire-heatmap"

const floodHazard = hazards.find((hazard) => hazard.type === "flooding")!

function polygonCollection(hazard: Hazard): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { hazardId: hazard.id, name: hazard.name },
        geometry: { type: "Polygon", coordinates: [hazard.polygon] },
      },
    ],
  }
}

function pointCollection(
  items: Array<{ id: string; name: string; coordinates: [number, number] }>,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      properties: { id: item.id, name: item.name },
      geometry: { type: "Point", coordinates: item.coordinates },
    })),
  }
}

function selectedPlaceCollection(
  place: SelectedPlace | null,
  role: "Starting Point" | "Destination",
  destinationType?: DestinationType,
): FeatureCollection<Point> {
  if (!place) return { type: "FeatureCollection", features: [] }
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        role,
        name: place.name,
        address: place.address ?? "",
        category: role === "Starting Point"
          ? place.category ?? "Starting point"
          : destinationType?.replaceAll("-", " ") ?? place.category ?? "Destination",
      },
      geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
    }],
  }
}

function destinationMarkerColor(destinationType: DestinationType) {
  const colors: Record<DestinationType, string> = {
    hospital: "#38bdf8",
    shelter: "#34d399",
    "fire-station": "#fb7185",
    "police-station": "#818cf8",
    "emergency-room": "#f87171",
    custom: "#fbbf24",
  }
  return colors[destinationType]
}

function createPlacePopupContent(properties: Record<string, unknown>) {
  const container = document.createElement("div")
  container.className = "map-place-popup"

  const role = document.createElement("p")
  role.className = "map-place-popup-role"
  role.textContent = String(properties.role ?? "Selected place")

  const name = document.createElement("p")
  name.className = "map-place-popup-name"
  name.textContent = String(properties.name ?? "Unknown place")

  container.append(role, name)
  if (properties.address) {
    const address = document.createElement("p")
    address.className = "map-place-popup-address"
    address.textContent = String(properties.address)
    container.append(address)
  }
  return container
}

function routeCollection(geometry: LineString | null): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: geometry ? [
      {
        type: "Feature",
        properties: {},
        geometry,
      },
    ] : [],
  }
}

function disasterAreaCollection(bounds: DisasterAreaBounds | null): FeatureCollection<Polygon> {
  if (!bounds) return { type: "FeatureCollection", features: [] }
  const coordinates: Coordinates[] = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south],
    [bounds.west, bounds.north],
  ]
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } }],
  }
}

function boundsMatchFloodResult(result: FloodAnalysisResult, bounds: DisasterAreaBounds | null) {
  if (!bounds) return false
  const [west, south, east, north] = result.acquisition.bbox
  return Math.abs(bounds.west - west) <= 0.000001
    && Math.abs(bounds.south - south) <= 0.000001
    && Math.abs(bounds.east - east) <= 0.000001
    && Math.abs(bounds.north - north) <= 0.000001
}

function boundsMatchFireResult(result: FireHotspotResult, bounds: DisasterAreaBounds | null) {
  if (!bounds) return false
  return Math.abs(bounds.west - result.bounds.west) <= 0.000001
    && Math.abs(bounds.south - result.bounds.south) <= 0.000001
    && Math.abs(bounds.east - result.bounds.east) <= 0.000001
    && Math.abs(bounds.north - result.bounds.north) <= 0.000001
}

function fireHotspotCollection(result: FireHotspotResult | null): FeatureCollection<Point> {
  const detections = result?.detections.filter((detection) => (
    detection.frp !== null && Number.isFinite(detection.frp) && detection.frp > 0
  )) ?? []
  const maximumFrp = Math.max(0, ...detections.map((detection) => detection.frp ?? 0))
  const normalization = Math.log1p(maximumFrp)
  return {
    type: "FeatureCollection",
    features: detections.map((detection) => ({
      type: "Feature",
      properties: {
        frp: detection.frp,
        weight: normalization > 0 ? Math.log1p(detection.frp ?? 0) / normalization : 0,
        confidence: detection.confidence,
        acquiredAt: detection.acquiredAt,
        source: result?.source.product,
      },
      geometry: { type: "Point", coordinates: [detection.longitude, detection.latitude] },
    })),
  }
}

function removeLayerAndSource(map: MapboxMap, layerId: string, sourceId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

function addLayerBelowRoute(map: MapboxMap, layer: Parameters<MapboxMap["addLayer"]>[0]) {
  const beforeId = map.getLayer("safe-route-line-shadow") ? "safe-route-line-shadow" : undefined
  if (beforeId) map.addLayer(layer, beforeId)
  else map.addLayer(layer)
}

function synchronizeAnalysisLayers(map: MapboxMap, currentState: CurrentMapState) {
  const floodResult = currentState.floodAnalysisResult
  const canShowFlood = Boolean(
    floodResult
    && floodResult.acquisition.source === "satellite"
    && floodResult.flood.floodPixelCount > 0
    && floodResult.mask.width === floodResult.image.width
    && floodResult.mask.height === floodResult.image.height
    && boundsMatchFloodResult(floodResult, currentState.disasterAreaBounds)
    && currentState.floodMaskUrl,
  )

  if (!canShowFlood || !floodResult || !currentState.floodMaskUrl) {
    removeLayerAndSource(map, FLOOD_ANALYSIS_LAYER_ID, FLOOD_ANALYSIS_SOURCE_ID)
    removeLayerAndSource(map, FLOOD_DENSITY_LAYER_ID, FLOOD_DENSITY_SOURCE_ID)
  } else {
    const [west, south, east, north] = floodResult.acquisition.bbox
    const coordinates: [Coordinates, Coordinates, Coordinates, Coordinates] = [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ]
    const source = map.getSource(FLOOD_ANALYSIS_SOURCE_ID) as ImageSource | undefined
    if (source) source.updateImage({ url: currentState.floodMaskUrl, coordinates })
    else {
      map.addSource(FLOOD_ANALYSIS_SOURCE_ID, {
        type: "image",
        url: currentState.floodMaskUrl,
        coordinates,
      })
      addLayerBelowRoute(map, {
        id: FLOOD_ANALYSIS_LAYER_ID,
        type: "raster",
        source: FLOOD_ANALYSIS_SOURCE_ID,
        paint: { "raster-opacity": 0.72, "raster-fade-duration": 0 },
      })
    }
    setLayerVisibility(map, FLOOD_ANALYSIS_LAYER_ID, currentState.layers.floodAnalysis)

    const densityData = currentState.floodDensityData
    if (!densityData || densityData.features.length === 0) {
      removeLayerAndSource(map, FLOOD_DENSITY_LAYER_ID, FLOOD_DENSITY_SOURCE_ID)
    } else {
      const densitySource = map.getSource(FLOOD_DENSITY_SOURCE_ID) as GeoJSONSource | undefined
      if (densitySource) densitySource.setData(densityData)
      else {
        map.addSource(FLOOD_DENSITY_SOURCE_ID, { type: "geojson", data: densityData })
        addLayerBelowRoute(map, {
          id: FLOOD_DENSITY_LAYER_ID,
          type: "fill",
          source: FLOOD_DENSITY_SOURCE_ID,
          paint: {
            "fill-color": [
              "interpolate", ["linear"], ["get", "density"],
              0.08, "#67e8f9",
              0.35, "#22d3ee",
              0.7, "#0891b2",
              1, "#164e63",
            ],
            "fill-opacity": [
              "interpolate", ["linear"], ["get", "density"],
              0.08, 0.08,
              0.35, 0.22,
              0.7, 0.42,
              1, 0.62,
            ],
          },
        })
      }
      setLayerVisibility(map, FLOOD_DENSITY_LAYER_ID, currentState.layers.floodAnalysis)
    }
  }

  const fireResult = currentState.fireHotspotResult
  const fireData = fireHotspotCollection(
    fireResult && boundsMatchFireResult(fireResult, currentState.disasterAreaBounds) ? fireResult : null,
  )
  if (fireData.features.length === 0) {
    removeLayerAndSource(map, FIRE_ANALYSIS_LAYER_ID, FIRE_ANALYSIS_SOURCE_ID)
  } else {
    const source = map.getSource(FIRE_ANALYSIS_SOURCE_ID) as GeoJSONSource | undefined
    if (source) source.setData(fireData)
    else {
      map.addSource(FIRE_ANALYSIS_SOURCE_ID, { type: "geojson", data: fireData })
      addLayerBelowRoute(map, {
        id: FIRE_ANALYSIS_LAYER_ID,
        type: "heatmap",
        source: FIRE_ANALYSIS_SOURCE_ID,
        maxzoom: 18,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 15, 1.25],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 14, 15, 34],
          "heatmap-opacity": 0.78,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(251, 191, 36, 0)",
            0.25, "rgba(251, 191, 36, 0.58)",
            0.5, "rgba(249, 115, 22, 0.72)",
            0.75, "rgba(220, 38, 38, 0.82)",
            1, "rgba(127, 29, 29, 0.92)",
          ],
        },
      })
    }
    setLayerVisibility(map, FIRE_ANALYSIS_LAYER_ID, currentState.layers.activeFire)
  }
}

function addMockSourcesAndLayers(map: MapboxMap, currentState: CurrentMapState) {
  if (!map.getSource("confirmed-disaster-area")) {
    map.addSource("confirmed-disaster-area", {
      type: "geojson",
      data: disasterAreaCollection(currentState.disasterAreaBounds),
    })
    map.addLayer({
      id: "confirmed-disaster-area-fill",
      type: "fill",
      source: "confirmed-disaster-area",
      paint: { "fill-color": "#22d3ee", "fill-opacity": 0.08 },
    })
    map.addLayer({
      id: "confirmed-disaster-area-outline",
      type: "line",
      source: "confirmed-disaster-area",
      paint: { "line-color": "#67e8f9", "line-width": 1.5, "line-opacity": 0.8 },
    })
  }
  if (!map.getSource("risk-area")) {
    map.addSource("risk-area", { type: "geojson", data: polygonCollection(floodHazard) })
    map.addLayer({
      id: "risk-area-fill",
      type: "fill",
      source: "risk-area",
      paint: { "fill-color": "#f97316", "fill-opacity": 0.13 },
    })
  }

  synchronizeAnalysisLayers(map, currentState)

  if (!map.getSource("safe-route")) {
    map.addSource("safe-route", {
      type: "geojson",
      data: routeCollection(currentState.recommendedRoute?.geometry ?? null),
    })
    map.addLayer({
      id: "safe-route-line-shadow",
      type: "line",
      source: "safe-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#062d3b", "line-width": 9, "line-opacity": 0.8 },
    })
    map.addLayer({
      id: "safe-route-line",
      type: "line",
      source: "safe-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#22d3ee", "line-width": 4.5 },
    })
  }

  if (!map.getSource("hospitals")) {
    map.addSource("hospitals", { type: "geojson", data: pointCollection(hospitals) })
    map.addLayer({
      id: "hospital-points",
      type: "circle",
      source: "hospitals",
      paint: {
        "circle-color": "#38bdf8",
        "circle-radius": 7,
        "circle-stroke-color": "#e0f2fe",
        "circle-stroke-width": 2,
      },
    })
  }

  if (!map.getSource("shelters")) {
    map.addSource("shelters", { type: "geojson", data: pointCollection(shelters) })
    map.addLayer({
      id: "shelter-points",
      type: "circle",
      source: "shelters",
      paint: {
        "circle-color": "#34d399",
        "circle-radius": 6,
        "circle-stroke-color": "#d1fae5",
        "circle-stroke-width": 2,
      },
    })
  }

  if (!map.getSource("starting-place")) {
    map.addSource("starting-place", {
      type: "geojson",
      data: selectedPlaceCollection(currentState.startingPlace, "Starting Point"),
    })
    map.addLayer({
      id: "starting-place-point",
      type: "circle",
      source: "starting-place",
      paint: {
        "circle-color": "#22d3ee",
        "circle-radius": 7,
        "circle-stroke-color": "#cffafe",
        "circle-stroke-width": 2,
      },
    })
  }

  if (!map.getSource("destination-place")) {
    map.addSource("destination-place", {
      type: "geojson",
      data: selectedPlaceCollection(
        currentState.destinationPlace,
        "Destination",
        currentState.destinationType,
      ),
    })
    map.addLayer({
      id: "destination-place-point",
      type: "circle",
      source: "destination-place",
      paint: {
        "circle-color": destinationMarkerColor(currentState.destinationType),
        "circle-radius": 8,
        "circle-stroke-color": "#f8fafc",
        "circle-stroke-width": 2,
      },
    })
  }
}

function setLayerVisibility(map: MapboxMap, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none")
  }
}

function synchronizeMockMapState(map: MapboxMap, currentState: CurrentMapState) {
  if (!map.isStyleLoaded()) return

  const disasterAreaSource = map.getSource("confirmed-disaster-area") as GeoJSONSource | undefined
  disasterAreaSource?.setData(disasterAreaCollection(currentState.disasterAreaBounds))

  const startingPlaceSource = map.getSource("starting-place") as GeoJSONSource | undefined
  startingPlaceSource?.setData(selectedPlaceCollection(currentState.startingPlace, "Starting Point"))

  const destinationPlaceSource = map.getSource("destination-place") as GeoJSONSource | undefined
  destinationPlaceSource?.setData(selectedPlaceCollection(
    currentState.destinationPlace,
    "Destination",
    currentState.destinationType,
  ))

  const safeRouteSource = map.getSource("safe-route") as GeoJSONSource | undefined
  safeRouteSource?.setData(routeCollection(currentState.recommendedRoute?.geometry ?? null))

  synchronizeAnalysisLayers(map, currentState)

  if (map.getLayer("destination-place-point")) {
    map.setPaintProperty(
      "destination-place-point",
      "circle-color",
      destinationMarkerColor(currentState.destinationType),
    )
  }

  setLayerVisibility(map, "risk-area-fill", currentState.layers.risk)
  setLayerVisibility(map, "hospital-points", currentState.layers.hospitals)
  setLayerVisibility(map, "shelter-points", currentState.layers.shelters)
  setLayerVisibility(
    map,
    "safe-route-line-shadow",
    currentState.analysisComplete && currentState.layers.safeRoute,
  )
  setLayerVisibility(
    map,
    "safe-route-line",
    currentState.analysisComplete && currentState.layers.safeRoute,
  )

}

function muteBasemapLabels(map: MapboxMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol" || !layer.layout?.["text-field"]) continue
    map.setPaintProperty(layer.id, "text-color", "#8795a8")
    map.setPaintProperty(layer.id, "text-halo-color", "#101722")
    map.setPaintProperty(layer.id, "text-halo-width", 0.8)
  }
}

function isAuthenticationError(error: Error) {
  const errorWithStatus = error as Error & { status?: number }
  const message = error.message.toLowerCase()
  return (
    errorWithStatus.status === 401 ||
    errorWithStatus.status === 403 ||
    message.includes("access token") ||
    message.includes("unauthorized") ||
    message.includes("not authorized") ||
    message.includes("invalid token")
  )
}

export function DisasterMap({
  layers,
  analysisComplete,
  recommendedRoute,
  startingPlace,
  destinationPlace,
  destinationType,
  disasterAreaBounds,
  floodAnalysisResult,
  fireHotspotResult,
  onFloodOverlayStatusChange,
}: DisasterMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<MapboxMap | null>(null)
  const currentStyle = useRef<"dark" | "satellite">(layers.satellite ? "satellite" : "dark")
  const storedCamera = useRef<StoredCamera | null>(null)
  const lastFramedPlaces = useRef("")
  const currentMapState = useRef<CurrentMapState>({
    layers,
    analysisComplete,
    recommendedRoute,
    startingPlace,
    destinationPlace,
    destinationType,
    disasterAreaBounds,
    floodAnalysisResult,
    fireHotspotResult,
    floodMaskUrl: null,
    floodDensityData: null,
  })
  const [loadedFloodMask, setLoadedFloodMask] = useState<{
    sourceUrl: string
    objectUrl: string
    densityData: FeatureCollection<Polygon, FloodDensityProperties> | null
  } | null>(null)
  const floodMaskUrl = floodAnalysisResult && loadedFloodMask?.sourceUrl === floodAnalysisResult.mask.url
    ? loadedFloodMask.objectUrl
    : null
  const floodDensityData = floodAnalysisResult && loadedFloodMask?.sourceUrl === floodAnalysisResult.mask.url
    ? loadedFloodMask.densityData
    : null
  const [mapFailed, setMapFailed] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""

  useEffect(() => {
    currentMapState.current = {
      layers,
      analysisComplete,
      recommendedRoute,
      startingPlace,
      destinationPlace,
      destinationType,
      disasterAreaBounds,
      floodAnalysisResult,
      fireHotspotResult,
      floodMaskUrl,
      floodDensityData,
    }
  }, [
    analysisComplete,
    destinationPlace,
    destinationType,
    disasterAreaBounds,
    fireHotspotResult,
    floodAnalysisResult,
    floodDensityData,
    floodMaskUrl,
    layers,
    recommendedRoute,
    startingPlace,
  ])

  useEffect(() => {
    const result = floodAnalysisResult
    if (
      !mapboxToken
      || !result
      || result.acquisition.source !== "satellite"
      || result.flood.floodPixelCount === 0
      || result.mask.width !== result.image.width
      || result.mask.height !== result.image.height
      || !boundsMatchFloodResult(result, disasterAreaBounds)
    ) {
      onFloodOverlayStatusChange("")
      return
    }

    const controller = new AbortController()
    const maskUrl = result.mask.url
    const [maskWest, maskSouth, maskEast, maskNorth] = result.acquisition.bbox
    let objectUrl: string | null = null
    async function loadFloodMask() {
      try {
        const response = await fetch(maskUrl, { signal: controller.signal })
        if (!response.ok) {
          onFloodOverlayStatusChange(response.status === 404
            ? "Flood overlay expired. Run flood analysis again."
            : "Flood overlay is unavailable. Run flood analysis again.")
          setLoadedFloodMask(null)
          return
        }
        const blob = await response.blob()
        if (blob.type !== "image/png") throw new Error("Unexpected flood mask format")
        objectUrl = URL.createObjectURL(blob)
        const densityData = await createFloodDensityGrid(blob, {
          west: maskWest,
          south: maskSouth,
          east: maskEast,
          north: maskNorth,
        }).catch(() => null)
        if (controller.signal.aborted) return
        setLoadedFloodMask({ sourceUrl: maskUrl, objectUrl, densityData })
        onFloodOverlayStatusChange("")
      } catch {
        if (controller.signal.aborted) return
        setLoadedFloodMask(null)
        onFloodOverlayStatusChange("Flood overlay is unavailable. Run flood analysis again.")
      }
    }
    void loadFloodMask()

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [disasterAreaBounds, floodAnalysisResult, mapboxToken, onFloodOverlayStatusChange])

  useEffect(() => {
    if (!mapboxToken || !mapContainer.current || mapFailed) return

    let disposed = false
    let initializedMap: MapboxMap | null = null

    async function initializeMap() {
      try {
        const mapboxgl = (await import("mapbox-gl")).default
        if (disposed || !mapContainer.current) return

        mapboxgl.accessToken = mapboxToken
        initializedMap = new mapboxgl.Map({
          container: mapContainer.current,
          style: currentStyle.current === "satellite" ? SATELLITE_MAP_STYLE : DARK_MAP_STYLE,
          center: incident.center,
          zoom: incident.mapView.zoom,
          pitch: incident.mapView.pitch,
          bearing: incident.mapView.bearing,
          attributionControl: false,
        })
        map.current = initializedMap

        initializedMap.addControl(
          new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }),
          "bottom-left",
        )
        initializedMap.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")

        initializedMap.on("error", (event) => {
          if (!isAuthenticationError(event.error)) return
          setMapReady(false)
          setMapFailed(true)
        })

        initializedMap.on("style.load", () => {
          if (!initializedMap || disposed) return

          if (currentStyle.current === "dark") muteBasemapLabels(initializedMap)
          addMockSourcesAndLayers(initializedMap, currentMapState.current)
          synchronizeMockMapState(initializedMap, currentMapState.current)

          if (storedCamera.current) {
            initializedMap.jumpTo(storedCamera.current)
            storedCamera.current = null
          }

          setMapReady(true)
          window.requestAnimationFrame(() => initializedMap?.resize())
        })

        initializedMap.on("click", (event) => {
          if (!initializedMap) return
          const placeLayers = ["starting-place-point", "destination-place-point"].filter((layerId) =>
            initializedMap?.getLayer(layerId),
          )
          const selectedPlaceFeature = placeLayers.length > 0
            ? initializedMap.queryRenderedFeatures(event.point, { layers: placeLayers })[0]
            : undefined
          if (selectedPlaceFeature?.properties) {
            new mapboxgl.Popup({ closeButton: false, offset: 12, className: "disaster-map-popup" })
              .setLngLat(event.lngLat)
              .setDOMContent(createPlacePopupContent(selectedPlaceFeature.properties))
              .addTo(initializedMap)
            return
          }

        })

        initializedMap.on("mousemove", (event) => {
          if (!initializedMap) return
          const clickableLayers = [
            "starting-place-point",
            "destination-place-point",
          ].filter((layerId) =>
            initializedMap?.getLayer(layerId),
          )
          const hasInteractiveFeature =
            clickableLayers.length > 0 &&
            initializedMap.queryRenderedFeatures(event.point, { layers: clickableLayers }).length > 0
          initializedMap.getCanvas().style.cursor = hasInteractiveFeature ? "pointer" : ""
        })
      } catch {
        if (!disposed) setMapFailed(true)
      }
    }

    void initializeMap()

    return () => {
      disposed = true
      initializedMap?.remove()
      if (map.current === initializedMap) map.current = null
    }
  }, [mapFailed, mapboxToken])

  useEffect(() => {
    if (!map.current || !mapReady) return
    synchronizeMockMapState(map.current, currentMapState.current)
  }, [
    analysisComplete,
    destinationPlace,
    destinationType,
    disasterAreaBounds,
    fireHotspotResult,
    floodAnalysisResult,
    floodDensityData,
    floodMaskUrl,
    layers,
    mapReady,
    recommendedRoute,
    startingPlace,
  ])

  useEffect(() => {
    if (!map.current || !mapReady || !startingPlace) return
    const selectionKey = [
      startingPlace.longitude,
      startingPlace.latitude,
      destinationPlace?.longitude ?? "",
      destinationPlace?.latitude ?? "",
    ].join(":")
    if (selectionKey === lastFramedPlaces.current) return
    lastFramedPlaces.current = selectionKey

    if (destinationPlace) {
      map.current.fitBounds(
        [
          [startingPlace.longitude, startingPlace.latitude],
          [destinationPlace.longitude, destinationPlace.latitude],
        ],
        { padding: 80, maxZoom: 14, duration: 700 },
      )
    } else {
      map.current.easeTo({
        center: [startingPlace.longitude, startingPlace.latitude],
        zoom: 13.5,
        duration: 650,
      })
    }
  }, [destinationPlace, mapReady, startingPlace])

  useEffect(() => {
    if (!map.current || !mapReady) return

    const requestedStyle = layers.satellite ? "satellite" : "dark"
    if (requestedStyle === currentStyle.current) return

    const center = map.current.getCenter()
    storedCamera.current = {
      center: [center.lng, center.lat],
      zoom: map.current.getZoom(),
      pitch: map.current.getPitch(),
      bearing: map.current.getBearing(),
    }
    currentStyle.current = requestedStyle
    setMapReady(false)
    map.current.setStyle(requestedStyle === "satellite" ? SATELLITE_MAP_STYLE : DARK_MAP_STYLE)
  }, [layers.satellite, mapReady])

  useEffect(() => {
    const container = mapContainer.current
    if (!container || !map.current || !mapReady) return

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => map.current?.resize())
    })
    resizeObserver.observe(container)
    map.current.resize()

    return () => resizeObserver.disconnect()
  }, [mapReady])

  function recenterMap() {
    map.current?.easeTo({
      center: incident.center,
      zoom: incident.mapView.zoom,
      pitch: incident.mapView.pitch,
      bearing: incident.mapView.bearing,
      duration: 650,
    })
  }

  const useFallback = !mapboxToken || mapFailed

  return (
    <section
      className="relative min-h-[520px] flex-1 overflow-hidden bg-[#07101b] lg:min-h-0"
      aria-label="Disaster situation map"
    >
      {useFallback ? (
        <FallbackMap
          layers={layers}
          analysisComplete={analysisComplete}
          recommendedRoute={recommendedRoute}
          startingPlace={startingPlace}
          destinationPlace={destinationPlace}
          destinationType={destinationType}
          disasterAreaBounds={disasterAreaBounds}
          floodAnalysisResult={floodAnalysisResult}
          fireHotspotResult={fireHotspotResult}
          onFloodOverlayStatusChange={onFloodOverlayStatusChange}
        />
      ) : (
        <div ref={mapContainer} className="absolute inset-0 min-h-full min-w-full" />
      )}

      {!useFallback && !mapReady && (
        <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-[#07101b]">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="button-spinner" /> Loading Mapbox basemap
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <span className="mock-badge border-amber-400/20 bg-amber-400/10 text-amber-200">Mock data</span>
        <span className="rounded-md border border-white/10 bg-[#07101b]/85 px-2 py-1 text-[10px] text-slate-400 shadow-lg backdrop-blur">
          {useFallback ? "Demo Map · Mock Data" : "Mapbox Basemap · Mixed Data Layers"}
        </span>
      </div>

      {!useFallback && mapReady && (
        <button
          type="button"
          onClick={recenterMap}
          className="map-recenter-button"
          aria-label="Recenter map on the Blacksburg operations area"
          title="Recenter map"
        >
          <LocateFixed className="size-4" aria-hidden="true" />
        </button>
      )}

      <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-white/10 bg-[#07101b]/90 px-3 py-2 text-[10px] text-slate-400 shadow-xl backdrop-blur">
        <Legend color="bg-cyan-400" label="Recommended" />
        <Legend color="bg-amber-400" label="Hazard" />
        {floodAnalysisResult && <Legend color="bg-sky-400" label="Flood / water" />}
        {fireHotspotResult && <Legend color="bg-red-500" label="Relative fire intensity" />}
      </div>
    </section>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-0.5 w-4 ${color}`} />
      {label}
    </span>
  )
}

function FallbackMap({
  layers,
  analysisComplete,
  recommendedRoute,
  startingPlace,
  destinationPlace,
  destinationType,
  disasterAreaBounds,
}: DisasterMapProps) {
  const routePoints = recommendedRoute?.geometry.coordinates.map(projectDemoPoint).map((point) => point.join(",")).join(" ")
  const startPoint = startingPlace
    ? projectDemoPoint([startingPlace.longitude, startingPlace.latitude])
    : null
  const endPoint = destinationPlace
    ? projectDemoPoint([destinationPlace.longitude, destinationPlace.latitude])
    : null
  const disasterAreaTopLeft = disasterAreaBounds
    ? projectDemoPoint([disasterAreaBounds.west, disasterAreaBounds.north])
    : null
  const disasterAreaBottomRight = disasterAreaBounds
    ? projectDemoPoint([disasterAreaBounds.east, disasterAreaBounds.south])
    : null

  return (
    <div className={`absolute inset-0 ${layers.satellite ? "fallback-map-satellite" : "fallback-map"}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 700" preserveAspectRatio="none" aria-hidden="true">
        <g className="fallback-roads" fill="none" strokeLinecap="round">
          <path d="M-40 170 C170 135 250 230 430 210 S690 85 950 160" strokeWidth="7" />
          <path d="M80 760 C180 580 260 510 400 390 S600 185 730 -30" strokeWidth="10" />
          <path d="M-60 520 C180 500 295 580 520 520 S770 390 960 430" strokeWidth="6" />
          <path d="M175 -30 C220 160 330 250 510 300 S780 335 950 270" strokeWidth="5" />
          <path d="M40 325 C225 290 350 345 455 450 S665 645 850 710" strokeWidth="4" />
          <path d="M330 -40 C360 130 465 160 575 235 S705 440 690 735" strokeWidth="4" />
        </g>
        {disasterAreaTopLeft && disasterAreaBottomRight && (
          <rect
            x={disasterAreaTopLeft[0]}
            y={disasterAreaTopLeft[1]}
            width={disasterAreaBottomRight[0] - disasterAreaTopLeft[0]}
            height={disasterAreaBottomRight[1] - disasterAreaTopLeft[1]}
            fill="#22d3ee"
            fillOpacity="0.08"
            stroke="#67e8f9"
            strokeWidth="2"
          />
        )}
        <g className="fallback-minor-roads" fill="none" strokeLinecap="round">
          {Array.from({ length: 8 }).map((_, index) => (
            <path
              key={index}
              d={`M${80 + index * 105} -20 C${40 + index * 92} 210 ${175 + index * 70} 420 ${90 + index * 115} 740`}
            />
          ))}
        </g>
        {layers.risk && <ellipse cx="492" cy="360" rx="150" ry="105" fill="#f97316" opacity="0.1" />}
        {analysisComplete && layers.safeRoute && recommendedRoute && (
          <>
            <polyline
              points={routePoints}
              fill="none"
              stroke="#07384a"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={routePoints}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>

      {startingPlace && startPoint && (
        <MapMarker
          point={startPoint}
          label={startingPlace.name}
          icon={Navigation}
          tone="bg-cyan-400 text-slate-950"
        />
      )}
      {destinationPlace && endPoint && (
        <MapMarker
          point={endPoint}
          label={destinationPlace.name}
          icon={MapPin}
          tone={destinationMarkerTone(destinationType)}
        />
      )}
      {layers.hospitals && (
        <MapMarker
          className="left-[76%] top-[70%]"
          label="Hospital"
          icon={Building2}
          tone="bg-sky-500 text-white"
        />
      )}
      {layers.shelters && (
        <MapMarker
          className="left-[73%] top-[31%]"
          label="Shelter"
          icon={TentTree}
          tone="bg-emerald-500 text-white"
        />
      )}
      {layers.shelters && (
        <MapMarker
          className="left-[39%] top-[66%]"
          label="Shelter"
          icon={TentTree}
          tone="bg-emerald-500 text-white"
        />
      )}


      <div className="absolute right-4 top-4 rounded-md border border-white/10 bg-[#07101b]/85 px-2.5 py-2 text-right shadow-lg backdrop-blur">
        <p className="font-mono text-[10px] text-slate-300">37.226° N, 80.414° W</p>
        <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">Blacksburg operations area</p>
      </div>
    </div>
  )
}

function MapMarker({
  className,
  point,
  label,
  icon: Icon,
  tone,
}: {
  className?: string
  point?: Coordinates
  label: string
  icon: typeof MapPin
  tone: string
}) {
  return (
    <div
      style={point ? { left: `${point[0] / 9}%`, top: `${point[1] / 7}%` } : undefined}
      className={`pointer-events-none absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${className ?? ""}`}
    >
      <span className={`grid size-7 place-items-center rounded-full border-2 border-[#07101b] shadow-lg ${tone}`}>
        <Icon className="size-3.5" />
      </span>
      <span className="mt-1 max-w-32 truncate rounded bg-[#07101b]/85 px-1.5 py-0.5 text-[9px] font-medium text-slate-200 backdrop-blur">
        {label}
      </span>
    </div>
  )
}

function destinationMarkerTone(destinationType: DestinationType) {
  const tones: Record<DestinationType, string> = {
    hospital: "bg-sky-400 text-slate-950",
    shelter: "bg-emerald-400 text-slate-950",
    "fire-station": "bg-rose-400 text-slate-950",
    "police-station": "bg-indigo-400 text-slate-950",
    "emergency-room": "bg-red-400 text-slate-950",
    custom: "bg-amber-400 text-slate-950",
  }
  return tones[destinationType]
}

// Project backend geometry into the fallback's illustrative coordinate space.
function projectDemoPoint([longitude, latitude]: Coordinates): Coordinates {
  return [((longitude + 80.433) / 0.038) * 900, ((37.239 - latitude) / 0.036) * 700]
}
