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
  bounds: DisasterAreaBounds | null
  focusPlace: SelectedPlace | null
  selectionEnabled: boolean
  onBoundsChange: (bounds: DisasterAreaBounds | null) => void
  onSelectionComplete: () => void
}

const DARK_MAP_STYLE = "mapbox://styles/mapbox/dark-v11"
const FALLBACK_WEST = -80.433
const FALLBACK_EAST = -80.395
const FALLBACK_NORTH = 37.239
const FALLBACK_SOUTH = 37.203

function boundsFromCorners(first: Coordinates, second: Coordinates): DisasterAreaBounds {
  return {
    west: Math.min(first[0], second[0]),
    south: Math.min(first[1], second[1]),
    east: Math.max(first[0], second[0]),
    north: Math.max(first[1], second[1]),
  }
}

function isValidBounds(bounds: DisasterAreaBounds) {
  return bounds.east - bounds.west > 0.000001 && bounds.north - bounds.south > 0.000001
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

function addSelectionLayer(map: MapboxMap, bounds: DisasterAreaBounds | null) {
  if (!map.getSource("selected-disaster-area")) {
    map.addSource("selected-disaster-area", { type: "geojson", data: boundsCollection(bounds) })
    map.addLayer({
      id: "selected-disaster-area-fill",
      type: "fill",
      source: "selected-disaster-area",
      paint: { "fill-color": "#22d3ee", "fill-opacity": 0.16 },
    })
    map.addLayer({
      id: "selected-disaster-area-outline",
      type: "line",
      source: "selected-disaster-area",
      paint: { "line-color": "#67e8f9", "line-width": 2 },
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

function setSelectionData(map: MapboxMap | null, bounds: DisasterAreaBounds | null) {
  const source = map?.getSource("selected-disaster-area") as GeoJSONSource | undefined
  source?.setData(boundsCollection(bounds))
}

function isAuthenticationError(error: Error) {
  const status = (error as Error & { status?: number }).status
  const message = error.message.toLowerCase()
  return status === 401 || status === 403 || message.includes("token") || message.includes("unauthorized")
}

export function DisasterAreaSelectionMap(props: DisasterAreaSelectionMapProps) {
  const { bounds, focusPlace, selectionEnabled } = props
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapboxMap | null>(null)
  const mapboxLibrary = useRef<typeof import("mapbox-gl").default | null>(null)
  const locationPopup = useRef<Popup | null>(null)
  const startCorner = useRef<Coordinates | null>(null)
  const currentProps = useRef(props)
  const [mapReady, setMapReady] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""

  useEffect(() => {
    currentProps.current = props
    setSelectionData(map.current, bounds)
    if (map.current) {
      map.current.getCanvas().style.cursor = selectionEnabled ? "crosshair" : "grab"
      if (!selectionEnabled) {
        startCorner.current = null
        map.current.dragPan.enable()
      }
    }
  }, [bounds, props, selectionEnabled])

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
          pitch: 0,
          bearing: 0,
          attributionControl: false,
        })
        map.current = initializedMap
        initializedMap.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-left")
        initializedMap.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
        loadTimeout = window.setTimeout(() => {
          if (!disposed && !styleLoaded) setMapFailed(true)
        }, 8000)
        initializedMap.on("error", (event) => {
          if (isAuthenticationError(event.error)) setMapFailed(true)
        })
        initializedMap.once("style.load", () => {
          if (!initializedMap || disposed) return
          styleLoaded = true
          if (loadTimeout !== null) window.clearTimeout(loadTimeout)
          addSelectionLayer(initializedMap, currentProps.current.bounds)
          setMapReady(true)
          initializedMap.resize()
          resizeFrame = window.requestAnimationFrame(() => initializedMap?.resize())
        })

        const beginSelection = (coordinates: Coordinates) => {
          if (!currentProps.current.selectionEnabled || !initializedMap) return
          startCorner.current = coordinates
          initializedMap.dragPan.disable()
          setSelectionData(initializedMap, null)
        }
        const updateSelection = (coordinates: Coordinates) => {
          if (!startCorner.current || !initializedMap) return
          setSelectionData(initializedMap, boundsFromCorners(startCorner.current, coordinates))
        }
        const finishSelection = (coordinates: Coordinates) => {
          if (!startCorner.current || !initializedMap) return
          const nextBounds = boundsFromCorners(startCorner.current, coordinates)
          startCorner.current = null
          initializedMap.dragPan.enable()
          if (isValidBounds(nextBounds)) {
            currentProps.current.onBoundsChange(nextBounds)
            currentProps.current.onSelectionComplete()
          } else {
            setSelectionData(initializedMap, currentProps.current.bounds)
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
    map.current.easeTo({ center: [focusPlace.longitude, focusPlace.latitude], zoom: 13.5, duration: 650 })
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
            : selectionEnabled ? "Drag to draw the analysis area" : "Pan and zoom to position the map"}
      </div>
      {!useFallback && mapReady && (
        <button
          type="button"
          className="area-map-recenter"
          onClick={() => map.current?.easeTo({ center: incident.center, zoom: incident.mapView.zoom, duration: 650 })}
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
  bounds,
  selectionEnabled,
  onBoundsChange,
  onSelectionComplete,
}: DisasterAreaSelectionMapProps) {
  const element = useRef<HTMLDivElement>(null)
  const startPoint = useRef<Coordinates | null>(null)
  const [draftBounds, setDraftBounds] = useState<DisasterAreaBounds | null>(null)
  const visibleBounds = draftBounds ?? bounds
  const rect = visibleBounds ? fallbackBoundsRect(visibleBounds) : null

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
        setDraftBounds(null)
      }}
      onPointerMove={(event) => {
        if (!startPoint.current) return
        setDraftBounds(boundsFromCorners(startPoint.current, eventPoint(event)))
      }}
      onPointerUp={(event) => {
        if (!startPoint.current) return
        const nextBounds = boundsFromCorners(startPoint.current, eventPoint(event))
        startPoint.current = null
        setDraftBounds(null)
        if (isValidBounds(nextBounds)) {
          onBoundsChange(nextBounds)
          onSelectionComplete()
        }
      }}
      onPointerCancel={() => {
        startPoint.current = null
        setDraftBounds(null)
      }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 700" preserveAspectRatio="none" aria-hidden="true">
        <g className="fallback-roads" fill="none" strokeLinecap="round">
          <path d="M-40 170 C170 135 250 230 430 210 S690 85 950 160" strokeWidth="7" />
          <path d="M80 760 C180 580 260 510 400 390 S600 185 730 -30" strokeWidth="10" />
          <path d="M-60 520 C180 500 295 580 520 520 S770 390 960 430" strokeWidth="6" />
          <path d="M175 -30 C220 160 330 250 510 300 S780 335 950 270" strokeWidth="5" />
        </g>
        {rect && (
          <rect {...rect} fill="#22d3ee" fillOpacity="0.16" stroke="#67e8f9" strokeWidth="3" />
        )}
      </svg>
    </div>
  )
}
