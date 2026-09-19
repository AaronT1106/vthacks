"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Building2, MapPin, Navigation, TentTree, Waves } from "lucide-react"
import type { FeatureCollection, LineString, Point, Polygon } from "geojson"
import type { Map as MapboxMap } from "mapbox-gl"
import {
  hazards,
  hospitals,
  incident,
  routes,
  shelters,
  type Hazard,
  type LocationOption,
  type MapLayerVisibility,
} from "@/src/data/mock-disaster-data"

interface DisasterMapProps {
  layers: MapLayerVisibility
  analysisComplete: boolean
  selectedHazardId: string
  onSelectHazard: (hazard: Hazard) => void
  startingLocation: LocationOption
  destination: LocationOption
}

const floodHazard = hazards.find((hazard) => hazard.type === "flooding")!
const bridgeHazard = hazards.find((hazard) => hazard.type === "bridge-damage")!
const unsafeRoute = routes.find((route) => route.kind === "unsafe")!
const safeRoute = routes.find((route) => route.kind === "safe")!

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

function pointCollection(items: Array<{ id: string; name: string; coordinates: [number, number] }>): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      properties: { id: item.id, name: item.name },
      geometry: { type: "Point", coordinates: item.coordinates },
    })),
  }
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

export function DisasterMap({
  layers,
  analysisComplete,
  selectedHazardId,
  onSelectHazard,
  startingLocation,
  destination,
}: DisasterMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

  useEffect(() => {
    if (!mapboxToken || !mapContainer.current || mapFailed) return

    let map: MapboxMap | null = null
    let disposed = false

    async function initializeMap() {
      const mapboxgl = (await import("mapbox-gl")).default
      if (disposed || !mapContainer.current) return

      mapboxgl.accessToken = mapboxToken
      map = new mapboxgl.Map({
        container: mapContainer.current,
        style: layers.satellite
          ? "mapbox://styles/mapbox/satellite-streets-v12"
          : "mapbox://styles/mapbox/dark-v11",
        center: incident.center,
        zoom: 13.4,
        pitch: 20,
        bearing: -8,
        attributionControl: false,
      })

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-left")
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")

      map.on("error", (event) => {
        if (event.error?.message.toLowerCase().includes("token")) setMapFailed(true)
      })

      map.on("load", () => {
        if (!map) return

        map.addSource("risk-area", { type: "geojson", data: polygonCollection(floodHazard) })
        map.addLayer({
          id: "risk-area-fill",
          type: "fill",
          source: "risk-area",
          layout: { visibility: layers.risk ? "visible" : "none" },
          paint: { "fill-color": "#f97316", "fill-opacity": 0.13 },
        })

        map.addSource("flooding", { type: "geojson", data: polygonCollection(floodHazard) })
        map.addLayer({
          id: "flooding-fill",
          type: "fill",
          source: "flooding",
          layout: { visibility: layers.flooding ? "visible" : "none" },
          paint: {
            "fill-color": selectedHazardId === floodHazard.id ? "#fb7185" : "#ef4444",
            "fill-opacity": selectedHazardId === floodHazard.id ? 0.48 : 0.3,
            "fill-outline-color": "#fda4af",
          },
        })

        map.addSource("bridge-damage", { type: "geojson", data: polygonCollection(bridgeHazard) })
        map.addLayer({
          id: "bridge-damage-fill",
          type: "fill",
          source: "bridge-damage",
          layout: { visibility: layers.bridgeDamage ? "visible" : "none" },
          paint: {
            "fill-color": selectedHazardId === bridgeHazard.id ? "#fbbf24" : "#f59e0b",
            "fill-opacity": selectedHazardId === bridgeHazard.id ? 0.55 : 0.36,
            "fill-outline-color": "#fcd34d",
          },
        })

        map.addSource("unsafe-route", { type: "geojson", data: routeCollection(unsafeRoute.coordinates) })
        map.addLayer({
          id: "unsafe-route-line",
          type: "line",
          source: "unsafe-route",
          layout: { visibility: analysisComplete ? "visible" : "none", "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#fb7185", "line-width": 4, "line-opacity": 0.55, "line-dasharray": [1.5, 1.5] },
        })

        map.addSource("safe-route", { type: "geojson", data: routeCollection(safeRoute.coordinates) })
        map.addLayer({
          id: "safe-route-line-shadow",
          type: "line",
          source: "safe-route",
          layout: { visibility: analysisComplete && layers.safeRoute ? "visible" : "none", "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#062d3b", "line-width": 9, "line-opacity": 0.8 },
        })
        map.addLayer({
          id: "safe-route-line",
          type: "line",
          source: "safe-route",
          layout: { visibility: analysisComplete && layers.safeRoute ? "visible" : "none", "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#22d3ee", "line-width": 4.5 },
        })

        map.addSource("hospitals", { type: "geojson", data: pointCollection(hospitals) })
        map.addLayer({
          id: "hospital-points",
          type: "circle",
          source: "hospitals",
          layout: { visibility: layers.hospitals ? "visible" : "none" },
          paint: { "circle-color": "#38bdf8", "circle-radius": 7, "circle-stroke-color": "#e0f2fe", "circle-stroke-width": 2 },
        })

        map.addSource("shelters", { type: "geojson", data: pointCollection(shelters) })
        map.addLayer({
          id: "shelter-points",
          type: "circle",
          source: "shelters",
          layout: { visibility: layers.shelters ? "visible" : "none" },
          paint: { "circle-color": "#34d399", "circle-radius": 6, "circle-stroke-color": "#d1fae5", "circle-stroke-width": 2 },
        })

        map.addSource("route-endpoints", {
          type: "geojson",
          data: pointCollection([startingLocation, destination]),
        })
        map.addLayer({
          id: "route-endpoint-points",
          type: "circle",
          source: "route-endpoints",
          paint: { "circle-color": "#f8fafc", "circle-radius": 6, "circle-stroke-color": "#0f172a", "circle-stroke-width": 3 },
        })

        map.on("click", "flooding-fill", () => onSelectHazard(floodHazard))
        map.on("click", "bridge-damage-fill", () => onSelectHazard(bridgeHazard))
        for (const layerId of ["flooding-fill", "bridge-damage-fill"]) {
          map.on("mouseenter", layerId, () => {
            if (map) map.getCanvas().style.cursor = "pointer"
          })
          map.on("mouseleave", layerId, () => {
            if (map) map.getCanvas().style.cursor = ""
          })
        }
      })
    }

    void initializeMap()
    return () => {
      disposed = true
      map?.remove()
    }
  }, [analysisComplete, destination, layers, mapFailed, mapboxToken, onSelectHazard, selectedHazardId, startingLocation])

  const useFallback = !mapboxToken || mapFailed

  return (
    <section className="relative min-h-[520px] flex-1 overflow-hidden bg-[#07101b] lg:min-h-0" aria-label="Disaster situation map">
      {useFallback ? (
        <FallbackMap
          layers={layers}
          analysisComplete={analysisComplete}
          selectedHazardId={selectedHazardId}
          onSelectHazard={onSelectHazard}
          startingLocation={startingLocation}
          destination={destination}
        />
      ) : (
        <div ref={mapContainer} className="absolute inset-0" />
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <span className="mock-badge border-amber-400/20 bg-amber-400/10 text-amber-200">Mock data</span>
        <span className="rounded-md border border-white/10 bg-[#07101b]/85 px-2 py-1 text-[10px] text-slate-400 backdrop-blur">
          {useFallback ? "Local demo map" : "Mapbox live canvas"}
        </span>
      </div>

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
  selectedHazardId,
  onSelectHazard,
  startingLocation,
  destination,
}: DisasterMapProps) {
  const startPosition = startingLocation.id === "virginia-tech-rescue" ? "left-[22%] top-[32%]" : "left-[27%] top-[22%]"
  const destinationPosition = destination.id === "blacksburg-shelter" ? "left-[73%] top-[47%]" : "left-[72%] top-[78%]"

  return (
    <div className={`absolute inset-0 ${layers.satellite ? "fallback-map-satellite" : "fallback-map"}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
            <path key={index} d={`M${80 + index * 105} -20 C${40 + index * 92} 210 ${175 + index * 70} 420 ${90 + index * 115} 740`} />
          ))}
        </g>
        {layers.risk && <ellipse cx="492" cy="360" rx="150" ry="105" fill="#f97316" opacity="0.1" />}
        {analysisComplete && (
          <path d="M250 170 C335 238 395 280 490 360 S570 470 655 565" fill="none" stroke="#fb7185" strokeWidth="6" strokeDasharray="12 12" opacity="0.58" />
        )}
        {analysisComplete && layers.safeRoute && (
          <>
            <path d="M250 170 C165 260 185 435 305 520 S520 610 655 565" fill="none" stroke="#07384a" strokeWidth="14" strokeLinecap="round" />
            <path d="M250 170 C165 260 185 435 305 520 S520 610 655 565" fill="none" stroke="#22d3ee" strokeWidth="6" strokeLinecap="round" />
          </>
        )}
        {layers.flooding && (
          <path d="M414 298 C458 258 545 280 570 342 C585 382 525 420 460 397 C405 378 378 335 414 298Z" fill="#ef4444" opacity={selectedHazardId === floodHazard.id ? 0.52 : 0.32} stroke="#fb7185" strokeWidth="2" />
        )}
        {layers.bridgeDamage && (
          <rect x="588" y="443" width="70" height="40" rx="9" fill="#f59e0b" opacity={selectedHazardId === bridgeHazard.id ? 0.64 : 0.4} stroke="#fcd34d" strokeWidth="2" transform="rotate(-18 623 463)" />
        )}
      </svg>

      <MapMarker className={startPosition} label={startingLocation.name} icon={Navigation} tone="bg-slate-100 text-slate-950" />
      <MapMarker className={destinationPosition} label={destination.name} icon={MapPin} tone="bg-sky-400 text-slate-950" />
      {layers.hospitals && <MapMarker className="left-[76%] top-[70%]" label="Hospital" icon={Building2} tone="bg-sky-500 text-white" />}
      {layers.shelters && <MapMarker className="left-[73%] top-[31%]" label="Shelter" icon={TentTree} tone="bg-emerald-500 text-white" />}
      {layers.shelters && <MapMarker className="left-[39%] top-[66%]" label="Shelter" icon={TentTree} tone="bg-emerald-500 text-white" />}

      {layers.flooding && (
        <button
          type="button"
          aria-label="Select flooded road hazard"
          onClick={() => onSelectHazard(floodHazard)}
          className={`hazard-map-button left-[52%] top-[47%] ${selectedHazardId === floodHazard.id ? "ring-4 ring-red-400/25" : ""}`}
        >
          <Waves className="size-4" />
        </button>
      )}
      {layers.bridgeDamage && (
        <button
          type="button"
          aria-label="Select bridge damage hazard"
          onClick={() => onSelectHazard(bridgeHazard)}
          className={`hazard-map-button left-[67%] top-[65%] bg-amber-500 text-slate-950 ${selectedHazardId === bridgeHazard.id ? "ring-4 ring-amber-400/25" : ""}`}
        >
          <AlertTriangle className="size-4" />
        </button>
      )}

      <div className="absolute right-4 top-4 rounded-md border border-white/10 bg-[#07101b]/85 px-2.5 py-2 text-right backdrop-blur">
        <p className="font-mono text-[10px] text-slate-300">37.226° N, 80.414° W</p>
        <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">Blacksburg operations area</p>
      </div>
    </div>
  )
}

function MapMarker({
  className,
  label,
  icon: Icon,
  tone,
}: {
  className: string
  label: string
  icon: typeof MapPin
  tone: string
}) {
  return (
    <div className={`pointer-events-none absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${className}`}>
      <span className={`grid size-7 place-items-center rounded-full border-2 border-[#07101b] shadow-lg ${tone}`}>
        <Icon className="size-3.5" />
      </span>
      <span className="mt-1 rounded bg-[#07101b]/85 px-1.5 py-0.5 text-[9px] font-medium text-slate-200 backdrop-blur">{label}</span>
    </div>
  )
}
