"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  ChevronRight,
  CircleDot,
  Map as MapIcon,
  Radar,
  Route as RouteIcon,
} from "lucide-react"
import { DamageDetailsPanel } from "@/src/components/damage-details-panel"
import { DisasterMap } from "@/src/components/disaster-map"
import { LiveDataSources } from "@/src/components/live-data-sources"
import { MapLayerControls } from "@/src/components/map-layer-controls"
import { ResponderModeSelector } from "@/src/components/responder-mode-selector"
import { RouteRecommendationPanel } from "@/src/components/route-recommendation-panel"
import { ThreeDimensionalGlobe } from "@/src/components/three-dimensional-globe"
import { WhatChangedFeed } from "@/src/components/what-changed-feed"
import { analyzeRoute } from "@/src/lib/route-analysis"
import {
  defaultMapLayers,
  destinations,
  hazards,
  incident,
  initialChangeEvents,
  responderModes,
  startingLocations,
  type ChangeEvent,
  type Hazard,
  type MapLayerVisibility,
  type ResponderMode,
  type RouteAnalysisResponse,
} from "@/src/data/mock-disaster-data"

type AnalysisStatus = "idle" | "analyzing" | "complete" | "error"

export function DisasterDashboard() {
  const [showIntro, setShowIntro] = useState(true)
  const [responderMode, setResponderMode] = useState<ResponderMode>("ambulance")
  const [startingLocationId, setStartingLocationId] = useState(startingLocations[0].id)
  const [destinationId, setDestinationId] = useState(destinations[0].id)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle")
  const [selectedHazard, setSelectedHazard] = useState<Hazard>(hazards[0])
  const [mapLayers, setMapLayers] = useState<MapLayerVisibility>(defaultMapLayers)
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>(initialChangeEvents)
  const [analysisResult, setAnalysisResult] = useState<RouteAnalysisResponse | null>(null)
  const [analysisError, setAnalysisError] = useState("")
  const activeRequest = useRef<AbortController | null>(null)

  const selectedStartingLocation =
    startingLocations.find((location) => location.id === startingLocationId) ?? startingLocations[0]
  const selectedDestination =
    destinations.find((location) => location.id === destinationId) ?? destinations[0]
  const recommendedEndpoint = analysisResult?.route.coordinates.at(-1)
  const displayedDestination = analysisResult && recommendedEndpoint
    ? {
        ...selectedDestination,
        name: analysisResult.recommendation.recommendedDestination,
        coordinates: recommendedEndpoint,
      }
    : selectedDestination

  useEffect(() => {
    return () => {
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [])

  const handleHazardSelection = useCallback((hazard: Hazard) => {
    setSelectedHazard(hazard)
  }, [])

  function handleMapLayerToggle(layer: keyof MapLayerVisibility) {
    setMapLayers((currentLayers) => ({
      ...currentLayers,
      [layer]: !currentLayers[layer],
    }))
  }

  function handleResponderChange(mode: ResponderMode) {
    resetAnalysis()
    setResponderMode(mode)
  }

  function resetAnalysis() {
    activeRequest.current?.abort()
    activeRequest.current = null
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("idle")
  }

  async function handleAnalyzeRoute() {
    if (activeRequest.current) return
    const controller = new AbortController()
    activeRequest.current = controller
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("analyzing")
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const result = await analyzeRoute({
        startingPoint: startingLocationId,
        destination: destinationId,
        responderType: responderMode,
      }, controller.signal)
      if (activeRequest.current !== controller) return
      setAnalysisResult(result)
      const selectedRole = responderModes.find((mode) => mode.id === responderMode)?.label ?? "Responder"
      const now = new Date()
      const newEvent: ChangeEvent = {
        id: `analysis-${now.getTime()}`,
        time: now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        title: `${result.recommendation.routeName} recommended (mock)`,
        detail: `${selectedRole} mock analysis received from the backend`,
        tone: "safe",
      }

      setAnalysisStatus("complete")
      setSelectedHazard(hazards[0])
      setChangeEvents((currentEvents) => [newEvent, ...currentEvents])
    } catch (error) {
      if (activeRequest.current !== controller) return
      setAnalysisStatus("error")
      setAnalysisError(controller.signal.aborted
        ? "Route analysis timed out. Please try again."
        : error instanceof Error && error.name !== "TypeError"
          ? error.message
          : "Cannot reach route analysis. Check that the backend is running and try again.")
    } finally {
      window.clearTimeout(timeout)
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }

  return (
    <>
      <AnimatePresence>{showIntro && <ThreeDimensionalGlobe onComplete={() => setShowIntro(false)} />}</AnimatePresence>

      <motion.main
        className="flex min-h-screen flex-col overflow-hidden bg-[#05080e] text-slate-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0 : 1 }}
        transition={{ duration: 0.45 }}
      >
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-white/[0.07] bg-[#080c13] px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <Radar className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">DisasterLens</p>
              <p className="hidden text-[9px] uppercase tracking-[0.16em] text-slate-600 sm:block">Operations intelligence</p>
            </div>
          </div>

          <div className="hidden min-w-0 items-center gap-2 text-center md:flex">
            <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Current incident</span>
            <ChevronRight className="size-3 text-slate-700" />
            <span className="truncate text-xs font-medium text-slate-200">{incident.name}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="live-badge"><span className="live-dot" />Live</span>
            <span className="hidden text-[10px] text-slate-500 sm:inline">{incident.updatedLabel}</span>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:h-[calc(100vh-3.5rem)] xl:grid-cols-[280px_minmax(420px,1fr)_340px]">
          <aside className="order-1 border-b border-white/[0.07] bg-[#080c13] xl:overflow-y-auto xl:border-b-0 xl:border-r">
            <div className="p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400">Live operations</p>
              <nav aria-label="Primary navigation" className="mb-5 grid grid-cols-3 gap-1 xl:grid-cols-1">
                <NavItem icon={MapIcon} label="Situation Map" active />
                <NavItem icon={RouteIcon} label="Routes" />
                <NavItem icon={AlertOctagon} label="Incidents" count="2" />
              </nav>

              <section className="border-t border-slate-800 pt-5" aria-labelledby="route-analysis-heading">
                <div className="section-heading-row">
                  <h2 id="route-analysis-heading" className="section-label">Route analysis</h2>
                  <span className="mock-badge">Mock</span>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="field-label" htmlFor="starting-point">Starting point</label>
                    <select
                      id="starting-point"
                      className="field-control"
                      value={startingLocationId}
                      onChange={(event) => { resetAnalysis(); setStartingLocationId(event.target.value) }}
                    >
                      {startingLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="field-label" htmlFor="destination">Destination</label>
                    <select
                      id="destination"
                      className="field-control"
                      value={destinationId}
                      onChange={(event) => { resetAnalysis(); setDestinationId(event.target.value) }}
                    >
                      {destinations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                  </div>

                  <ResponderModeSelector value={responderMode} onChange={handleResponderChange} />

                  <button
                    type="button"
                    className="analyze-button"
                    onClick={handleAnalyzeRoute}
                    disabled={analysisStatus === "analyzing"}
                  >
                    {analysisStatus === "analyzing" ? (
                      <><span className="button-spinner" />Analyzing network</>
                    ) : (
                      <>Analyze route<ArrowRight className="size-3.5" aria-hidden="true" /></>
                    )}
                  </button>
                </div>
              </section>

              <section className="mt-6 border-t border-slate-800 pt-5" aria-labelledby="map-layers-heading">
                <div className="section-heading-row mb-2">
                  <h2 id="map-layers-heading" className="section-label">Map layers</h2>
                  <Activity className="size-3.5 text-slate-600" aria-hidden="true" />
                </div>
                <MapLayerControls layers={mapLayers} onToggle={handleMapLayerToggle} />
              </section>

              <div className="mt-6 hidden xl:block"><LiveDataSources /></div>
            </div>
          </aside>

          <div className="order-2 flex min-h-[520px] min-w-0 flex-col xl:min-h-0">
            <DisasterMap
              layers={mapLayers}
              analysisComplete={analysisStatus === "complete"}
              recommendedRoute={analysisResult?.route ?? null}
              selectedHazardId={selectedHazard.id}
              onSelectHazard={handleHazardSelection}
              startingLocation={selectedStartingLocation}
              destination={displayedDestination}
            />
          </div>

          <aside className="order-3 border-t border-white/[0.07] bg-[#080c13] xl:overflow-y-auto xl:border-l xl:border-t-0">
            <div className="space-y-3 p-3">
              <RouteRecommendationPanel status={analysisStatus} recommendation={analysisResult?.recommendation ?? null} error={analysisError} />
              <DamageDetailsPanel hazard={selectedHazard} />
              <WhatChangedFeed events={changeEvents} />
              <div className="xl:hidden"><LiveDataSources /></div>
              <p className="px-2 pb-2 text-center text-[9px] leading-4 text-slate-700">
                Decision support only · Human verification required
              </p>
            </div>
          </aside>
        </div>
      </motion.main>
    </>
  )
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  count,
}: {
  icon: typeof CircleDot
  label: string
  active?: boolean
  count?: string
}) {
  return (
    <button
      type="button"
      className={`flex min-h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-xs transition-colors xl:justify-start ${
        active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
      }`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {count && <span className="ml-auto hidden rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] text-red-300 xl:inline">{count}</span>}
    </button>
  )
}
