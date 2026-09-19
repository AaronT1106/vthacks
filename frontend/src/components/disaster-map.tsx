"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Building2,
  LocateFixed,
  MapPin,
  Navigation,
  TentTree,
  Waves,
} from "lucide-react"
import type { FeatureCollection, LineString, Point, Polygon } from "geojson"
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl"
import {
  hazards,
  hospitals,
  incident,
  routes,
  shelters,
  type Hazard,
  type DestinationType,
  type MapLayerVisibility,
  type Route,
  type Coordinates,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

interface DisasterMapProps {
  layers: MapLayerVisibility
  analysisComplete: boolean
  recommendedRoute: Route | null
  selectedHazardId: string
  onSelectHazard: (hazard: Hazard) => void
  startingPlace: SelectedPlace | null
  destinationPlace: SelectedPlace | null
  destinationType: DestinationType
}

interface CurrentMapState {
  layers: MapLayerVisibility
  analysisComplete: boolean
  recommendedRoute: Route | null
  selectedHazardId: string
  startingPlace: SelectedPlace | null
  destinationPlace: SelectedPlace | null
  destinationType: DestinationType
}

interface StoredCamera {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

const DARK_MAP_STYLE = "mapbox://styles/mapbox/dark-v11"
const SATELLITE_MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"

const floodHazard = hazards.find((hazard) => hazard.type === "flooding")!
const bridgeHazard = hazards.find((hazard) => hazard.type === "bridge-damage")!
const unsafeRoute = routes.find((route) => route.kind === "unsafe")!

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

function placeCoordinates(place: SelectedPlace | null): Coordinates | null {
  return place ? [place.longitude, place.latitude] : null
}

function routeCollection(coordinates: Array<[number, number]>): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      },
    ],
  }
}

function addMockSourcesAndLayers(map: MapboxMap, currentState: CurrentMapState) {
  const startCoordinates = placeCoordinates(currentState.startingPlace) ?? unsafeRoute.coordinates[0]
  const destinationCoordinates = placeCoordinates(currentState.destinationPlace)
    ?? unsafeRoute.coordinates[unsafeRoute.coordinates.length - 1]
  if (!map.getSource("risk-area")) {
    map.addSource("risk-area", { type: "geojson", data: polygonCollection(floodHazard) })
    map.addLayer({
      id: "risk-area-fill",
      type: "fill",
      source: "risk-area",
      paint: { "fill-color": "#f97316", "fill-opacity": 0.13 },
    })
  }

  if (!map.getSource("flooding")) {
    map.addSource("flooding", { type: "geojson", data: polygonCollection(floodHazard) })
    map.addLayer({
      id: "flooding-fill",
      type: "fill",
      source: "flooding",
      paint: {
        "fill-color": "#ef4444",
        "fill-opacity": 0.3,
        "fill-outline-color": "#fda4af",
      },
    })
  }

  if (!map.getSource("bridge-damage")) {
    map.addSource("bridge-damage", { type: "geojson", data: polygonCollection(bridgeHazard) })
    map.addLayer({
      id: "bridge-damage-fill",
      type: "fill",
      source: "bridge-damage",
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": 0.36,
        "fill-outline-color": "#fcd34d",
      },
    })
  }

  if (!map.getSource("unsafe-route")) {
    map.addSource("unsafe-route", {
      type: "geojson",
      data: routeCollection([
        startCoordinates,
        ...unsafeRoute.coordinates.slice(1, -1),
        destinationCoordinates,
      ]),
    })
    map.addLayer({
      id: "unsafe-route-line",
      type: "line",
      source: "unsafe-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#fb7185",
        "line-width": 4,
        "line-opacity": 0.55,
        "line-dasharray": [1.5, 1.5],
      },
    })
  }

  if (!map.getSource("safe-route")) {
    map.addSource("safe-route", {
      type: "geojson",
      data: routeCollection(currentState.recommendedRoute?.coordinates ?? []),
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

  const startingPlaceSource = map.getSource("starting-place") as GeoJSONSource | undefined
  startingPlaceSource?.setData(selectedPlaceCollection(currentState.startingPlace, "Starting Point"))

  const destinationPlaceSource = map.getSource("destination-place") as GeoJSONSource | undefined
  destinationPlaceSource?.setData(selectedPlaceCollection(
    currentState.destinationPlace,
    "Destination",
    currentState.destinationType,
  ))

  const startCoordinates = placeCoordinates(currentState.startingPlace) ?? unsafeRoute.coordinates[0]
  const destinationCoordinates = placeCoordinates(currentState.destinationPlace)
    ?? unsafeRoute.coordinates[unsafeRoute.coordinates.length - 1]

  const unsafeRouteSource = map.getSource("unsafe-route") as GeoJSONSource | undefined
  unsafeRouteSource?.setData(
    routeCollection([
      startCoordinates,
      ...unsafeRoute.coordinates.slice(1, -1),
      destinationCoordinates,
    ]),
  )

  const safeRouteSource = map.getSource("safe-route") as GeoJSONSource | undefined
  safeRouteSource?.setData(routeCollection(currentState.recommendedRoute?.coordinates ?? []))

  if (map.getLayer("destination-place-point")) {
    map.setPaintProperty(
      "destination-place-point",
      "circle-color",
      destinationMarkerColor(currentState.destinationType),
    )
  }

  setLayerVisibility(map, "risk-area-fill", currentState.layers.risk)
  setLayerVisibility(map, "flooding-fill", currentState.layers.flooding)
  setLayerVisibility(map, "bridge-damage-fill", currentState.layers.bridgeDamage)
  setLayerVisibility(map, "hospital-points", currentState.layers.hospitals)
  setLayerVisibility(map, "shelter-points", currentState.layers.shelters)
  setLayerVisibility(map, "unsafe-route-line", currentState.analysisComplete)
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

  if (map.getLayer("flooding-fill")) {
    const floodSelected = currentState.selectedHazardId === floodHazard.id
    map.setPaintProperty("flooding-fill", "fill-color", floodSelected ? "#fb7185" : "#ef4444")
    map.setPaintProperty("flooding-fill", "fill-opacity", floodSelected ? 0.48 : 0.3)
  }

  if (map.getLayer("bridge-damage-fill")) {
    const bridgeSelected = currentState.selectedHazardId === bridgeHazard.id
    map.setPaintProperty("bridge-damage-fill", "fill-color", bridgeSelected ? "#fbbf24" : "#f59e0b")
    map.setPaintProperty("bridge-damage-fill", "fill-opacity", bridgeSelected ? 0.55 : 0.36)
  }
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
  selectedHazardId,
  onSelectHazard,
  startingPlace,
  destinationPlace,
  destinationType,
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
    selectedHazardId,
    startingPlace,
    destinationPlace,
    destinationType,
  })
  const hazardSelectionHandler = useRef(onSelectHazard)
  const [mapFailed, setMapFailed] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""

  useEffect(() => {
    currentMapState.current = {
      layers,
      analysisComplete,
      recommendedRoute,
      selectedHazardId,
      startingPlace,
      destinationPlace,
      destinationType,
    }
    hazardSelectionHandler.current = onSelectHazard
  }, [
    analysisComplete,
    destinationPlace,
    destinationType,
    layers,
    onSelectHazard,
    recommendedRoute,
    selectedHazardId,
    startingPlace,
  ])

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

          const clickableLayers = ["flooding-fill", "bridge-damage-fill"].filter((layerId) =>
            initializedMap?.getLayer(layerId),
          )
          if (clickableLayers.length === 0) return

          const clickedFeature = initializedMap.queryRenderedFeatures(event.point, {
            layers: clickableLayers,
          })[0]
          const hazardId = clickedFeature?.properties?.hazardId
          const selectedHazard = hazards.find((hazard) => hazard.id === hazardId)
          if (selectedHazard) hazardSelectionHandler.current(selectedHazard)
        })

        initializedMap.on("mousemove", (event) => {
          if (!initializedMap) return
          const clickableLayers = [
            "starting-place-point",
            "destination-place-point",
            "flooding-fill",
            "bridge-damage-fill",
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
    layers,
    mapReady,
    recommendedRoute,
    selectedHazardId,
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
          selectedHazardId={selectedHazardId}
          onSelectHazard={onSelectHazard}
          startingPlace={startingPlace}
          destinationPlace={destinationPlace}
          destinationType={destinationType}
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
          {useFallback ? "Demo Map · Mock Data" : "Mapbox Basemap · Mock Overlays"}
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
        <Legend color="bg-red-400" label="Unsafe" dashed />
        <Legend color="bg-amber-400" label="Hazard" />
      </div>
    </section>
  )
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-0.5 w-4 ${color} ${dashed ? "opacity-60" : ""}`} />
      {label}
    </span>
  )
}

function FallbackMap({
  layers,
  analysisComplete,
  recommendedRoute,
  selectedHazardId,
  onSelectHazard,
  startingPlace,
  destinationPlace,
  destinationType,
}: DisasterMapProps) {
  const routePoints = recommendedRoute?.coordinates.map(projectDemoPoint).map((point) => point.join(",")).join(" ")
  const startPoint = startingPlace
    ? projectDemoPoint([startingPlace.longitude, startingPlace.latitude])
    : null
  const endPoint = destinationPlace
    ? projectDemoPoint([destinationPlace.longitude, destinationPlace.latitude])
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
        <g className="fallback-minor-roads" fill="none" strokeLinecap="round">
          {Array.from({ length: 8 }).map((_, index) => (
            <path
              key={index}
              d={`M${80 + index * 105} -20 C${40 + index * 92} 210 ${175 + index * 70} 420 ${90 + index * 115} 740`}
            />
          ))}
        </g>
        {layers.risk && <ellipse cx="492" cy="360" rx="150" ry="105" fill="#f97316" opacity="0.1" />}
        {analysisComplete && startPoint && endPoint && (
          <polyline
            points={[startPoint, projectDemoPoint(floodHazard.coordinates), endPoint]
              .map((point) => point.join(","))
              .join(" ")}
            fill="none"
            stroke="#fb7185"
            strokeWidth="6"
            strokeDasharray="12 12"
            opacity="0.58"
          />
        )}
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
        {layers.flooding && (
          <path
            d="M414 298 C458 258 545 280 570 342 C585 382 525 420 460 397 C405 378 378 335 414 298Z"
            fill="#ef4444"
            opacity={selectedHazardId === floodHazard.id ? 0.52 : 0.32}
            stroke="#fb7185"
            strokeWidth="2"
          />
        )}
        {layers.bridgeDamage && (
          <rect
            x="588"
            y="443"
            width="70"
            height="40"
            rx="9"
            fill="#f59e0b"
            opacity={selectedHazardId === bridgeHazard.id ? 0.64 : 0.4}
            stroke="#fcd34d"
            strokeWidth="2"
            transform="rotate(-18 623 463)"
          />
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

      {layers.flooding && (
        <button
          type="button"
          aria-label="Select flooded road hazard"
          onClick={() => onSelectHazard(floodHazard)}
          className={`hazard-map-button left-[52%] top-[47%] ${
            selectedHazardId === floodHazard.id ? "ring-4 ring-red-400/25" : ""
          }`}
        >
          <Waves className="size-4" />
        </button>
      )}
      {layers.bridgeDamage && (
        <button
          type="button"
          aria-label="Select bridge damage hazard"
          onClick={() => onSelectHazard(bridgeHazard)}
          className={`hazard-map-button left-[67%] top-[65%] bg-amber-500 text-slate-950 ${
            selectedHazardId === bridgeHazard.id ? "ring-4 ring-amber-400/25" : ""
          }`}
        >
          <AlertTriangle className="size-4" />
        </button>
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
