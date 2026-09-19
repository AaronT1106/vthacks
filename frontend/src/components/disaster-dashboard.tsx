"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { DisasterAreaSelection } from "@/src/components/disaster-area-selection"
import { DestinationTypeSelector } from "@/src/components/destination-type-selector"
import { DisasterMap } from "@/src/components/disaster-map"
import { HazardEvidencePanel } from "@/src/components/hazard-evidence-panel"
import { LiveDataSources } from "@/src/components/live-data-sources"
import { MapLayerControls } from "@/src/components/map-layer-controls"
import { PlaceSearchInput } from "@/src/components/place-search-input"
import { ResponderModeSelector } from "@/src/components/responder-mode-selector"
import { RouteRecommendationPanel } from "@/src/components/route-recommendation-panel"
import { ThreeDimensionalGlobe } from "@/src/components/three-dimensional-globe"
import { WhatChangedFeed } from "@/src/components/what-changed-feed"
import { analyzeCoordinateRoute, analyzeRoute } from "@/src/lib/route-analysis"
import {
  defaultMapLayers,
  destinations,
  hazards,
  incident,
  initialChangeEvents,
  locationOptionToSelectedPlace,
  responderModes,
  startingLocations,
  type ChangeEvent,
  type Coordinates,
  type DestinationType,
  type DisasterAreaBounds,
  type Hazard,
  type MapLayerVisibility,
  type ResponderMode,
  type RouteAnalysisResponse,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

type AnalysisStatus = "idle" | "analyzing" | "complete" | "error"
type DashboardTab = "situation-map" | "routes" | "incidents"

export function DisasterDashboard() {
  const [showIntro, setShowIntro] = useState(true)
  const [activeTab, setActiveTab] = useState<DashboardTab>("situation-map")
  const [disasterAreaBounds, setDisasterAreaBounds] = useState<DisasterAreaBounds | null>(null)
  const [areaConfirmed, setAreaConfirmed] = useState(false)
  const [responderMode, setResponderMode] = useState<ResponderMode>("ambulance")
  const [startingPlace, setStartingPlace] = useState<SelectedPlace | null>(() =>
    locationOptionToSelectedPlace(startingLocations[0], "fire station"),
  )
  const [destinationPlace, setDestinationPlace] = useState<SelectedPlace | null>(() =>
    locationOptionToSelectedPlace(destinations[0], "hospital"),
  )
  const [destinationType, setDestinationType] = useState<DestinationType>("hospital")
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle")
  const [hazardRecords, setHazardRecords] = useState<Hazard[]>(hazards)
  const [selectedHazardId, setSelectedHazardId] = useState(hazards[0].id)
  const [evidenceHazardId, setEvidenceHazardId] = useState<string | null>(null)
  const [mapLayers, setMapLayers] = useState<MapLayerVisibility>(defaultMapLayers)
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>(initialChangeEvents)
  const [analysisResult, setAnalysisResult] = useState<RouteAnalysisResponse | null>(null)
  const [analysisError, setAnalysisError] = useState("")
  const activeRequest = useRef<AbortController | null>(null)
  const selectedHazard = hazardRecords.find((hazard) => hazard.id === selectedHazardId) ?? hazardRecords[0]
  const evidenceHazard = hazardRecords.find((hazard) => hazard.id === evidenceHazardId) ?? null

  const recommendedEndpoint = analysisResult?.route.coordinates.at(-1)
  const displayedDestinationPlace: SelectedPlace | null = analysisResult && recommendedEndpoint
    ? {
        name: analysisResult.recommendation.recommendedDestination,
        longitude: recommendedEndpoint[0],
        latitude: recommendedEndpoint[1],
        category: "Role-specific mock destination",
        source: "mock",
      }
    : destinationPlace
  const displayedDestinationType: DestinationType = analysisResult
    ? responderMode === "civilian"
      ? "shelter"
      : responderMode === "ambulance"
        ? "hospital"
        : "custom"
    : destinationType
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""
  const searchProximity = useMemo<Coordinates>(() => startingPlace
    ? [startingPlace.longitude, startingPlace.latitude]
    : incident.center,
  [startingPlace])
  const canAnalyzeRoute = Boolean(startingPlace && destinationPlace)
  const usesPresetRoute = Boolean(startingPlace?.presetId && destinationPlace?.presetId)
  const isAnalyzing = analysisStatus === "analyzing"
  const routeLocationsMissing = !canAnalyzeRoute

  useEffect(() => {
    return () => {
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [])

  const handleHazardSelection = useCallback((hazard: Hazard) => {
    setSelectedHazardId(hazard.id)
  }, [])

  const closeEvidence = useCallback(() => setEvidenceHazardId(null), [])

  function viewHazardEvidence(hazard: Hazard) {
    setSelectedHazardId(hazard.id)
    setEvidenceHazardId(hazard.id)
  }

  function updateHazardVerification(hazardId: string, verification: string) {
    const hazard = hazardRecords.find((item) => item.id === hazardId)
    if (!hazard) return

    setHazardRecords((currentHazards) => currentHazards.map((item) =>
      item.id === hazardId ? { ...item, verification } : item,
    ))
    const now = new Date()
    setChangeEvents((currentEvents) => [{
      id: `verification-${hazardId}-${now.getTime()}`,
      time: now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      title: verification,
      detail: `${hazard.name} review updated locally (mock demo)`,
      tone: verification.includes("Confirmed") ? "safe" : "warning",
    }, ...currentEvents])
  }

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

  function handleStartingPlaceChange(place: SelectedPlace | null) {
    resetAnalysis()
    setStartingPlace(place)
  }

  function handleDestinationPlaceChange(place: SelectedPlace | null) {
    resetAnalysis()
    setDestinationPlace(place)
  }

  function handleDestinationTypeChange(type: DestinationType) {
    resetAnalysis()
    setDestinationType(type)
    setDestinationPlace(null)
  }

  function resetAnalysis() {
    activeRequest.current?.abort()
    activeRequest.current = null
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("idle")
  }

  async function handleAnalyzeRoute() {
    if (activeRequest.current || !startingPlace || !destinationPlace) return
    const controller = new AbortController()
    activeRequest.current = controller
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("analyzing")
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const result = usesPresetRoute
        ? await analyzeRoute({
            startingPoint: startingPlace.presetId!,
            destination: destinationPlace.presetId!,
            responderType: responderMode,
          }, controller.signal)
        : await analyzeCoordinateRoute({
            startingPlace,
            destinationPlace,
            responderType: responderMode,
            signal: controller.signal,
          })
      if (activeRequest.current !== controller) return
      setAnalysisResult(result)
      const selectedRole = responderModes.find((mode) => mode.id === responderMode)?.label ?? "Responder"
      const now = new Date()
      const newEvent: ChangeEvent = {
        id: `analysis-${now.getTime()}`,
        time: now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        title: `${result.recommendation.routeName} recommended (mock)`,
        detail: usesPresetRoute
          ? `${selectedRole} mock analysis received from the backend`
          : `${selectedRole} frontend mock route created for selected coordinates`,
        tone: "safe",
      }

      setAnalysisStatus("complete")
      setSelectedHazardId(hazards[0].id)
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

      {!showIntro && !areaConfirmed && (
        <DisasterAreaSelection
          bounds={disasterAreaBounds}
          onBoundsChange={setDisasterAreaBounds}
          onConfirm={() => {
            if (disasterAreaBounds) setAreaConfirmed(true)
          }}
        />
      )}

      {areaConfirmed && <motion.main
        className="flex min-h-screen flex-col overflow-hidden bg-[#05080e] text-slate-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
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
                <NavItem
                  icon={MapIcon}
                  label="Situation Map"
                  active={activeTab === "situation-map"}
                  onSelect={() => setActiveTab("situation-map")}
                />
                <NavItem
                  icon={RouteIcon}
                  label="Routes"
                  active={activeTab === "routes"}
                  onSelect={() => setActiveTab("routes")}
                />
                <NavItem
                  icon={AlertOctagon}
                  label="Incidents"
                  count={String(hazardRecords.length)}
                  active={activeTab === "incidents"}
                  onSelect={() => setActiveTab("incidents")}
                />
              </nav>

              <section className="border-t border-slate-800 pt-5" aria-labelledby="route-analysis-heading">
                <div className="section-heading-row">
                  <h2 id="route-analysis-heading" className="section-label">Route analysis</h2>
                  <span className="mock-badge">Mock</span>
                </div>

                <div className="mt-4 space-y-4">
                  {mapboxToken ? (
                    <>
                      <PlaceSearchInput
                        id="starting-point"
                        label="Starting point"
                        placeholder="Search address or place..."
                        accessToken={mapboxToken}
                        proximity={incident.center}
                        value={startingPlace}
                        onChange={handleStartingPlaceChange}
                      />

                      <DestinationTypeSelector
                        value={destinationType}
                        onChange={handleDestinationTypeChange}
                      />

                      <PlaceSearchInput
                        key={destinationType}
                        id="destination"
                        label="Destination"
                        placeholder={destinationType === "custom"
                          ? "Search place or address..."
                          : `Search nearby ${destinationType.replaceAll("-", " ")}s...`}
                        accessToken={mapboxToken}
                        proximity={searchProximity}
                        value={destinationPlace}
                        onChange={handleDestinationPlaceChange}
                        destinationType={destinationType}
                        showNearby
                      />
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="field-label" htmlFor="starting-point">Starting point</label>
                        <select
                          id="starting-point"
                          className="field-control"
                          value={startingPlace?.presetId ?? ""}
                          onChange={(event) => {
                            const location = startingLocations.find((item) => item.id === event.target.value)
                            if (location) handleStartingPlaceChange(locationOptionToSelectedPlace(location, "fire station"))
                          }}
                        >
                          {startingLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="field-label" htmlFor="destination">Destination</label>
                        <select
                          id="destination"
                          className="field-control"
                          value={destinationPlace?.presetId ?? ""}
                          onChange={(event) => {
                            const location = destinations.find((item) => item.id === event.target.value)
                            if (location) handleDestinationPlaceChange(locationOptionToSelectedPlace(location, "destination"))
                          }}
                        >
                          {destinations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                      </div>
                      <p className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-2 text-[10px] leading-4 text-amber-200/80">
                        Live place search requires a Mapbox token.
                      </p>
                    </>
                  )}

                  <ResponderModeSelector value={responderMode} onChange={handleResponderChange} />

                  <button
                    type="button"
                    className={`analyze-button ${
                      isAnalyzing
                        ? "cursor-wait disabled:bg-cyan-700 disabled:text-cyan-100"
                        : routeLocationsMissing
                          ? "cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                          : "cursor-pointer"
                    }`}
                    onClick={handleAnalyzeRoute}
                    disabled={isAnalyzing || routeLocationsMissing}
                    aria-describedby={routeLocationsMissing ? "route-location-limitation" : undefined}
                  >
                    {isAnalyzing ? (
                      <><span className="button-spinner" />Analyzing…</>
                    ) : (
                      <>Analyze route<ArrowRight className="size-3.5" aria-hidden="true" /></>
                    )}
                  </button>
                  {mapboxToken && !canAnalyzeRoute && (
                    <p id="route-location-limitation" className="text-[10px] leading-4 text-slate-500">
                      Select both a starting point and destination to analyze a route.
                    </p>
                  )}
                  {mapboxToken && canAnalyzeRoute && !usesPresetRoute && (
                    <p className="text-[10px] leading-4 text-cyan-300/70">
                      Real-place analysis uses an illustrative frontend mock route.
                    </p>
                  )}
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
            {activeTab === "situation-map" ? (
              <DisasterMap
                layers={mapLayers}
                analysisComplete={analysisStatus === "complete"}
                recommendedRoute={analysisResult?.route ?? null}
                selectedHazardId={selectedHazard.id}
                onSelectHazard={handleHazardSelection}
                startingPlace={startingPlace}
                destinationPlace={displayedDestinationPlace}
                destinationType={displayedDestinationType}
                disasterAreaBounds={disasterAreaBounds}
              />
            ) : (
              <section className="flex-1 overflow-y-auto bg-[#070b12] p-4 sm:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
                        {activeTab === "routes" ? "Route intelligence" : "Incident intelligence"}
                      </p>
                      <h1 className="mt-1 text-xl font-semibold text-white">
                        {activeTab === "routes" ? "Routes" : "Current incidents"}
                      </h1>
                    </div>
                    <span className="mock-badge">Mock data</span>
                  </div>

                  {activeTab === "routes" ? (
                    <RouteRecommendationPanel
                      status={analysisStatus}
                      recommendation={analysisResult?.recommendation ?? null}
                      error={analysisError}
                    />
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {hazardRecords.map((hazard) => (
                        <DamageDetailsPanel
                          key={hazard.id}
                          hazard={hazard}
                          onViewEvidence={viewHazardEvidence}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          <aside className="order-3 border-t border-white/[0.07] bg-[#080c13] xl:overflow-y-auto xl:border-l xl:border-t-0">
            <div className="space-y-3 p-3">
              {activeTab === "situation-map" && (
                <>
                  <RouteRecommendationPanel status={analysisStatus} recommendation={analysisResult?.recommendation ?? null} error={analysisError} />
                  <DamageDetailsPanel hazard={selectedHazard} onViewEvidence={viewHazardEvidence} />
                </>
              )}
              <WhatChangedFeed events={changeEvents} />
              <div className="xl:hidden"><LiveDataSources /></div>
              <p className="px-2 pb-2 text-center text-[9px] leading-4 text-slate-700">
                Decision support only · Human verification required
              </p>
            </div>
          </aside>
        </div>
      </motion.main>}

      {evidenceHazard && (
        <HazardEvidencePanel
          hazard={evidenceHazard}
          onClose={closeEvidence}
          onConfirm={(hazardId) => updateHazardVerification(hazardId, "Confirmed by operator (Mock demo)")}
          onMarkFalsePositive={(hazardId) => updateHazardVerification(hazardId, "False positive marked by operator (Mock demo)")}
        />
      )}
    </>
  )
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  count,
  onSelect,
}: {
  icon: typeof CircleDot
  label: string
  active?: boolean
  count?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
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
