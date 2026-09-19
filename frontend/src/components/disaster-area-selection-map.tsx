"use client"

import { useEffect, useRef, useState } from "react"
import { LocateFixed } from "lucide-react"
import type { FeatureCollection, Point, Polygon } from "geojson"
import type { GeoJSONSource, Map as MapboxMap, Popup } from "mapbox-gl"
import {
  incident,
  type Coordinates,
  type DisasterAreaBounds,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

interface DisasterAreaSelectionMapProps {
  confirmedBounds: DisasterAreaBounds | null
  draftBounds: DisasterAreaBounds | null
  focusPlace: SelectedPlace | null
  selectionEnabled: boolean
  onDraftBoundsChange: (bounds: DisasterAreaBounds | null) => void
  onSelectionComplete: () => void
}

const DARK_MAP_STYLE = "mapbox://styles/mapbox/dark-v11"
const TERRAIN_SOURCE_ID = "area-selection-terrain"
const TERRAIN_EXAGGERATION = 1.15
const AREA_MAP_PITCH = 50
const AREA_MAP_BEARING = -18
const FALLBACK_WEST = -80.433
const FALLBACK_EAST = -80.395
const FALLBACK_NORTH = 37.239
const FALLBACK_SOUTH = 37.203

function setNavigationEnabled(map: MapboxMap, enabled: boolean) {
  const action = enabled ? "enable" : "disable"
  map.dragPan[action]()
  map.scrollZoom[action]()
  map.boxZoom[action]()
  map.dragRotate[action]()
  map.doubleClickZoom[action]()
  map.keyboard[action]()
  map.touchZoomRotate[action]()
}

function boundsFromCorners(first: Coordinates, second: Coordinates): DisasterAreaBounds {
  return {
    west: Math.min(first[0], second[0]),
    south: Math.min(first[1], second[1]),
    east: Math.max(first[0], second[0]),
    north: Math.max(first[1], second[1]),
  }
}

function isValidBounds(bounds: DisasterAreaBounds) {
  return bounds.east > bounds.west && bounds.north > bounds.south
}

function boundsCollection(bounds: DisasterAreaBounds | null): FeatureCollection<Polygon> {
  if (!bounds) return { type: "FeatureCollection", features: [] }
  const ring: Coordinates[] = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south],
    [bounds.west, bounds.north],
  ]
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  }
}

function selectedLocationCollection(place: SelectedPlace | null): FeatureCollection<Point> {
  if (!place) return { type: "FeatureCollection", features: [] }
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: place.name },
      geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
    }],
  }
}

function createLocationPopup(place: SelectedPlace) {
  const container = document.createElement("div")
  const label = document.createElement("p")
  label.className = "map-place-popup-role"
  label.textContent = "Search result"
  const name = document.createElement("p")
  name.className = "map-place-popup-name"
  name.textContent = place.name
  container.append(label, name)
  if (place.address) {
    const address = document.createElement("p")
    address.className = "map-place-popup-address"
    address.textContent = place.address
    container.append(address)
  }
  return container
}

function addSelectionLayers(
  map: MapboxMap,
  confirmedBounds: DisasterAreaBounds | null,
  draftBounds: DisasterAreaBounds | null,
) {
  if (!map.getSource("confirmed-disaster-area")) {
    map.addSource("confirmed-disaster-area", { type: "geojson", data: boundsCollection(confirmedBounds) })
    map.addLayer({
      id: "confirmed-disaster-area-fill",
      type: "fill",
      source: "confirmed-disaster-area",
      paint: { "fill-color": "#f59e0b", "fill-opacity": 0.07 },
    })
    map.addLayer({
      id: "confirmed-disaster-area-outline",
      type: "line",
      source: "confirmed-disaster-area",
      paint: {
        "line-color": "#fbbf24",
        "line-opacity": 0.72,
        "line-width": 1.75,
        "line-dasharray": [2, 2],
      },
    })
  }
  if (!map.getSource("draft-disaster-area")) {
    map.addSource("draft-disaster-area", { type: "geojson", data: boundsCollection(draftBounds) })
    map.addLayer({
      id: "draft-disaster-area-fill",
      type: "fill",
      source: "draft-disaster-area",
      paint: { "fill-color": "#22d3ee", "fill-opacity": 0.2 },
    })
    map.addLayer({
      id: "draft-disaster-area-outline",
      type: "line",
      source: "draft-disaster-area",
      paint: { "line-color": "#a5f3fc", "line-opacity": 0.95, "line-width": 2.5 },
    })
  }
  if (!map.getSource("searched-location")) {
    map.addSource("searched-location", { type: "geojson", data: selectedLocationCollection(null) })
    map.addLayer({
      id: "searched-location-point",
      type: "circle",
      source: "searched-location",
      paint: {
        "circle-color": "#22d3ee",
        "circle-radius": 7,
        "circle-stroke-color": "#cffafe",
        "circle-stroke-width": 2,
      },
    })
  }
}

function addBuildingLayer(map: MapboxMap) {
  if (map.getLayer("area-selection-3d-buildings")) return
  const style = map.getStyle()
  if (!style.sources?.composite) return
  const labelLayer = style.layers?.find(
    (layer) => layer.type === "symbol" && "layout" in layer && layer.layout?.["text-field"],
  )
  try {
    map.addLayer({
      id: "area-selection-3d-buildings",
      source: "composite",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 13.5,
      filter: ["==", "extrude", "true"],
      paint: {
        "fill-extrusion-color": "#182433",
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": ["get", "min_height"],
        "fill-extrusion-height-alignment": "terrain",
        "fill-extrusion-base-alignment": "terrain",
        "fill-extrusion-opacity": 0.55,
      },
    }, labelLayer?.id)
  } catch {
    // Some Mapbox styles do not expose building data; the map remains fully usable without it.
  }
}

function addTerrain(map: MapboxMap) {
  try {
    if (!map.getSource(TERRAIN_SOURCE_ID)) {
      map.addSource(TERRAIN_SOURCE_ID, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      })
    }
    map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION })
    if (!map.getLayer("area-selection-hillshade")) {
      const labelLayer = map.getStyle().layers?.find(
        (layer) => layer.type === "symbol" && "layout" in layer && layer.layout?.["text-field"],
      )
      map.addLayer({
        id: "area-selection-hillshade",
        type: "hillshade",
        source: TERRAIN_SOURCE_ID,
        paint: {
          "hillshade-exaggeration": 0.22,
          "hillshade-shadow-color": "#020617",
          "hillshade-highlight-color": "#334155",
          "hillshade-accent-color": "#0f172a",
        },
      }, labelLayer?.id)
    }
  } catch {
    // Terrain is an enhancement; the Mapbox basemap remains usable when DEM data is unavailable.
  }
}

function addAtmosphere(map: MapboxMap) {
  try {
    map.setFog({
      color: "#0b1220",
      "high-color": "#1e293b",
      "horizon-blend": 0.08,
      "space-color": "#05080e",
      "star-intensity": 0,
    })
  } catch {
    // Fog support can vary by style and projection; it is not required for map interaction.
  }
}

function setBoundsData(map: MapboxMap | null, sourceId: string, bounds: DisasterAreaBounds | null) {
  const source = map?.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData(boundsCollection(bounds))
}

function isAuthenticationError(error: Error) {
  const status = (error as Error & { status?: number }).status
  const message = error.message.toLowerCase()
  return status === 401 || status === 403 || message.includes("token") || message.includes("unauthorized")
}

function isTerrainError(error: Error) {
  const message = error.message.toLowerCase()
  return message.includes("terrain-dem") || message.includes(TERRAIN_SOURCE_ID)
}

interface SavedCamera {
  center: Coordinates
  zoom: number
  pitch: number
  bearing: number
}

export function DisasterAreaSelectionMap(props: DisasterAreaSelectionMapProps) {
  const { confirmedBounds, draftBounds, focusPlace, selectionEnabled } = props
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapboxMap | null>(null)
  const mapboxLibrary = useRef<typeof import("mapbox-gl").default | null>(null)
  const locationPopup = useRef<Popup | null>(null)
  const startCorner = useRef<Coordinates | null>(null)
  const savedCamera = useRef<SavedCamera | null>(null)
  const selectionModeActive = useRef(false)
  const drawingReadyRef = useRef(false)
  const currentProps = useRef(props)
  const [mapReady, setMapReady] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [drawingReady, setDrawingReady] = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""

  useEffect(() => {
    currentProps.current = props
    setBoundsData(map.current, "confirmed-disaster-area", confirmedBounds)
    setBoundsData(map.current, "draft-disaster-area", draftBounds)
    if (map.current) {
      const activeMap = map.current
      activeMap.getCanvas().style.cursor = selectionEnabled ? "crosshair" : "grab"
      startCorner.current = null
      setNavigationEnabled(activeMap, !selectionEnabled)
      if (selectionEnabled && !selectionModeActive.current) {
        const center = activeMap.getCenter()
        savedCamera.current = {
          center: [center.lng, center.lat],
          zoom: activeMap.getZoom(),
          pitch: activeMap.getPitch(),
          bearing: activeMap.getBearing(),
        }
        selectionModeActive.current = true
        drawingReadyRef.current = false
        setDrawingReady(false)
        activeMap.stop()
        activeMap.easeTo({ pitch: 0, bearing: 0, duration: 400 })
        activeMap.once("moveend", () => {
          if (!currentProps.current.selectionEnabled) return
          drawingReadyRef.current = true
          setDrawingReady(true)
        })
      } else if (!selectionEnabled && selectionModeActive.current) {
        selectionModeActive.current = false
        drawingReadyRef.current = false
        setDrawingReady(false)
        activeMap.stop()
        const previousCamera = savedCamera.current
        savedCamera.current = null
        if (previousCamera) activeMap.easeTo({ ...previousCamera, duration: 400 })
      }
    }
  }, [confirmedBounds, draftBounds, props, selectionEnabled])

  useEffect(() => {
    if (!mapboxToken || !container.current || mapFailed) return
    let disposed = false
    let styleLoaded = false
    let initializedMap: MapboxMap | null = null
    let loadTimeout: number | null = null
    let initializationFrame: number | null = null
    let resizeFrame: number | null = null

    async function initializeMap() {
      try {
        const mapboxgl = (await import("mapbox-gl")).default
        if (disposed || !container.current) return
        mapboxgl.accessToken = mapboxToken
        mapboxLibrary.current = mapboxgl
        initializedMap = new mapboxgl.Map({
          container: container.current,
          style: DARK_MAP_STYLE,
          center: incident.center,
          zoom: incident.mapView.zoom,
          pitch: AREA_MAP_PITCH,
          bearing: AREA_MAP_BEARING,
          attributionControl: false,
        })
        map.current = initializedMap
        initializedMap.addControl(
          new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
          "bottom-left",
        )
        initializedMap.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
        loadTimeout = window.setTimeout(() => {
          if (!disposed && !styleLoaded) setMapFailed(true)
        }, 8000)
        initializedMap.on("error", (event) => {
          if (!isTerrainError(event.error) && isAuthenticationError(event.error)) setMapFailed(true)
        })
        initializedMap.once("style.load", () => {
          if (!initializedMap || disposed) return
          styleLoaded = true
          if (loadTimeout !== null) window.clearTimeout(loadTimeout)
          addTerrain(initializedMap)
          addAtmosphere(initializedMap)
          addBuildingLayer(initializedMap)
          addSelectionLayers(
            initializedMap,
            currentProps.current.confirmedBounds,
            currentProps.current.draftBounds,
          )
          setNavigationEnabled(initializedMap, !currentProps.current.selectionEnabled)
          initializedMap.getCanvas().style.cursor = currentProps.current.selectionEnabled ? "crosshair" : "grab"
          if (currentProps.current.selectionEnabled) {
            const center = initializedMap.getCenter()
            savedCamera.current = {
              center: [center.lng, center.lat],
              zoom: initializedMap.getZoom(),
              pitch: initializedMap.getPitch(),
              bearing: initializedMap.getBearing(),
            }
            selectionModeActive.current = true
            initializedMap.jumpTo({ pitch: 0, bearing: 0 })
            drawingReadyRef.current = true
            setDrawingReady(true)
          }
          setMapReady(true)
          initializedMap.resize()
          resizeFrame = window.requestAnimationFrame(() => initializedMap?.resize())
        })

        const beginSelection = (coordinates: Coordinates) => {
          if (!currentProps.current.selectionEnabled || !drawingReadyRef.current || !initializedMap) return
          startCorner.current = coordinates
          setBoundsData(initializedMap, "draft-disaster-area", null)
        }
        const updateSelection = (coordinates: Coordinates) => {
          if (!startCorner.current || !initializedMap) return
          setBoundsData(initializedMap, "draft-disaster-area", boundsFromCorners(startCorner.current, coordinates))
        }
        const finishSelection = (coordinates: Coordinates) => {
          if (!startCorner.current || !initializedMap) return
          const nextBounds = boundsFromCorners(startCorner.current, coordinates)
          startCorner.current = null
          if (isValidBounds(nextBounds)) {
            currentProps.current.onDraftBoundsChange(nextBounds)
            currentProps.current.onSelectionComplete()
          } else {
            setBoundsData(initializedMap, "draft-disaster-area", currentProps.current.draftBounds)
          }
        }

        initializedMap.on("mousedown", (event) => beginSelection([event.lngLat.lng, event.lngLat.lat]))
        initializedMap.on("mousemove", (event) => updateSelection([event.lngLat.lng, event.lngLat.lat]))
        initializedMap.on("mouseup", (event) => finishSelection([event.lngLat.lng, event.lngLat.lat]))
        initializedMap.on("touchstart", (event) => beginSelection([event.lngLat.lng, event.lngLat.lat]))
        initializedMap.on("touchmove", (event) => updateSelection([event.lngLat.lng, event.lngLat.lat]))
        initializedMap.on("touchend", (event) => finishSelection([event.lngLat.lng, event.lngLat.lat]))
      } catch {
        if (!disposed) setMapFailed(true)
      }
    }

    initializationFrame = window.requestAnimationFrame(() => void initializeMap())
    return () => {
      disposed = true
      if (initializationFrame !== null) window.cancelAnimationFrame(initializationFrame)
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
      if (loadTimeout !== null) window.clearTimeout(loadTimeout)
      initializedMap?.remove()
      locationPopup.current?.remove()
      locationPopup.current = null
      if (map.current === initializedMap) map.current = null
    }
  }, [mapFailed, mapboxToken])

  useEffect(() => {
    if (!map.current || !mapReady) return
    const source = map.current.getSource("searched-location") as GeoJSONSource | undefined
    source?.setData(selectedLocationCollection(focusPlace))
    locationPopup.current?.remove()
    locationPopup.current = null
    if (!focusPlace || !mapboxLibrary.current) return
    const drawing = currentProps.current.selectionEnabled
    if (drawing) {
      drawingReadyRef.current = false
      setDrawingReady(false)
      if (savedCamera.current) {
        savedCamera.current.center = [focusPlace.longitude, focusPlace.latitude]
        savedCamera.current.zoom = 13.5
      }
    }
    map.current.stop()
    map.current.flyTo({
      center: [focusPlace.longitude, focusPlace.latitude],
      zoom: 13.5,
      pitch: drawing ? 0 : Math.max(map.current.getPitch(), AREA_MAP_PITCH),
      bearing: drawing ? 0 : map.current.getBearing(),
      duration: 750,
    })
    if (drawing) {
      map.current.once("moveend", () => {
        if (!currentProps.current.selectionEnabled) return
        drawingReadyRef.current = true
        setDrawingReady(true)
      })
    }
    locationPopup.current = new mapboxLibrary.current.Popup({
      closeButton: false,
      closeOnMove: false,
      offset: 12,
      className: "disaster-map-popup",
    })
      .setLngLat([focusPlace.longitude, focusPlace.latitude])
      .setDOMContent(createLocationPopup(focusPlace))
      .addTo(map.current)
  }, [focusPlace, mapReady])

  useEffect(() => {
    if (!container.current || !map.current || !mapReady) return
    const observer = new ResizeObserver(() => map.current?.resize())
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [mapReady])

  const useFallback = !mapboxToken || mapFailed

  return (
    <div className="relative h-[clamp(420px,58vh,720px)] min-h-[420px] flex-none overflow-hidden rounded-xl border border-white/[0.09] bg-[#07101b]">
      {useFallback ? (
        <FallbackAreaMap {...props} />
      ) : (
        <div ref={container} className="absolute inset-0" />
      )}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-[#07101b]/90 px-2.5 py-1.5 text-[10px] text-slate-400 shadow-lg backdrop-blur">
        {useFallback
          ? selectionEnabled ? "Demo map · Drag to draw the analysis area" : "Demo map"
          : !mapReady ? "Loading Mapbox…"
            : selectionEnabled
              ? drawingReady ? "Drag to draw the analysis area" : "Preparing top-down selection view…"
              : "Pan, zoom, rotate, and tilt to explore"}
      </div>
      {!useFallback && mapReady && !selectionEnabled && (
        <button
          type="button"
          className="area-map-recenter"
          onClick={() => map.current?.easeTo({
            center: incident.center,
            zoom: incident.mapView.zoom,
            pitch: AREA_MAP_PITCH,
            bearing: AREA_MAP_BEARING,
            duration: 650,
          })}
          aria-label="Recenter map on Blacksburg"
        >
          <LocateFixed className="size-4" />
        </button>
      )}
    </div>
  )
}

function fallbackPointToCoordinates(x: number, y: number): Coordinates {
  return [
    FALLBACK_WEST + (x / 900) * (FALLBACK_EAST - FALLBACK_WEST),
    FALLBACK_NORTH - (y / 700) * (FALLBACK_NORTH - FALLBACK_SOUTH),
  ]
}

function fallbackBoundsRect(bounds: DisasterAreaBounds) {
  const x = ((bounds.west - FALLBACK_WEST) / (FALLBACK_EAST - FALLBACK_WEST)) * 900
  const y = ((FALLBACK_NORTH - bounds.north) / (FALLBACK_NORTH - FALLBACK_SOUTH)) * 700
  const width = ((bounds.east - bounds.west) / (FALLBACK_EAST - FALLBACK_WEST)) * 900
  const height = ((bounds.north - bounds.south) / (FALLBACK_NORTH - FALLBACK_SOUTH)) * 700
  return { x, y, width, height }
}

function FallbackAreaMap({
  confirmedBounds,
  draftBounds,
  selectionEnabled,
  onDraftBoundsChange,
  onSelectionComplete,
}: DisasterAreaSelectionMapProps) {
  const element = useRef<HTMLDivElement>(null)
  const startPoint = useRef<Coordinates | null>(null)
  const [draftSelectionBounds, setDraftSelectionBounds] = useState<DisasterAreaBounds | null>(null)
  const previewBounds = draftSelectionBounds ?? draftBounds
  const confirmedRect = confirmedBounds ? fallbackBoundsRect(confirmedBounds) : null
  const draftRect = previewBounds ? fallbackBoundsRect(previewBounds) : null

  function eventPoint(event: React.PointerEvent<HTMLDivElement>) {
    const box = element.current!.getBoundingClientRect()
    return fallbackPointToCoordinates(
      ((event.clientX - box.left) / box.width) * 900,
      ((event.clientY - box.top) / box.height) * 700,
    )
  }

  return (
    <div
      ref={element}
      className={`fallback-map absolute inset-0 touch-none ${selectionEnabled ? "cursor-crosshair" : "cursor-default"}`}
      onPointerDown={(event) => {
        if (!selectionEnabled) return
        event.currentTarget.setPointerCapture(event.pointerId)
        startPoint.current = eventPoint(event)
        setDraftSelectionBounds(null)
      }}
      onPointerMove={(event) => {
        if (!startPoint.current) return
        setDraftSelectionBounds(boundsFromCorners(startPoint.current, eventPoint(event)))
      }}
      onPointerUp={(event) => {
        if (!startPoint.current) return
        const nextBounds = boundsFromCorners(startPoint.current, eventPoint(event))
        startPoint.current = null
        setDraftSelectionBounds(null)
        if (isValidBounds(nextBounds)) {
          onDraftBoundsChange(nextBounds)
          onSelectionComplete()
        }
      }}
      onPointerCancel={() => {
        startPoint.current = null
        setDraftSelectionBounds(null)
      }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 700" preserveAspectRatio="none" aria-hidden="true">
        <g className="fallback-roads" fill="none" strokeLinecap="round">
          <path d="M-40 170 C170 135 250 230 430 210 S690 85 950 160" strokeWidth="7" />
          <path d="M80 760 C180 580 260 510 400 390 S600 185 730 -30" strokeWidth="10" />
          <path d="M-60 520 C180 500 295 580 520 520 S770 390 960 430" strokeWidth="6" />
          <path d="M175 -30 C220 160 330 250 510 300 S780 335 950 270" strokeWidth="5" />
        </g>
        {confirmedRect && (
          <rect
            {...confirmedRect}
            fill="#f59e0b"
            fillOpacity="0.07"
            stroke="#fbbf24"
            strokeOpacity="0.72"
            strokeWidth="2"
            strokeDasharray="8 7"
          />
        )}
        {draftRect && (
          <rect {...draftRect} fill="#22d3ee" fillOpacity="0.2" stroke="#a5f3fc" strokeWidth="3" />
        )}
      </svg>
    </div>
  )
}
