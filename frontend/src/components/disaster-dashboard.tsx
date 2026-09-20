"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  CircleDot,
  Map as MapIcon,
  Radar,
  Route as RouteIcon,
} from "lucide-react"
import { DamageDetailsPanel } from "@/src/components/damage-details-panel"
import { DisasterAnalysisStep } from "@/src/components/disaster-analysis-step"
import { DisasterAreaSelection } from "@/src/components/disaster-area-selection"
import { DisasterImageryStep, type DisasterImagery } from "@/src/components/disaster-imagery-step"
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
import { WorkflowProgress, type WorkflowStep } from "@/src/components/workflow-progress"
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
  type DemoDamageAnalysisResult,
  type DemoDamageHazard,
  type DisasterAreaBounds,
  type Hazard,
  type MapLayerVisibility,
  type ResponderMode,
  type RouteAnalysisResponse,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

type AnalysisStatus = "idle" | "analyzing" | "complete" | "error"
type DashboardTab = "situation-map" | "routes" | "incidents"

interface PendingAreaChange {
  bounds: DisasterAreaBounds
  place: SelectedPlace | null
}

const BOUNDS_CHANGE_TOLERANCE = 0.000001

function boundsMateriallyChanged(current: DisasterAreaBounds, next: DisasterAreaBounds) {
  return Math.abs(current.west - next.west) > BOUNDS_CHANGE_TOLERANCE
    || Math.abs(current.south - next.south) > BOUNDS_CHANGE_TOLERANCE
    || Math.abs(current.east - next.east) > BOUNDS_CHANGE_TOLERANCE
    || Math.abs(current.north - next.north) > BOUNDS_CHANGE_TOLERANCE
}

function formatFeedTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function DisasterDashboard() {
  const [showIntro, setShowIntro] = useState(true)
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("area")
  const [activeTab, setActiveTab] = useState<DashboardTab>("situation-map")
  const [disasterAreaBounds, setDisasterAreaBounds] = useState<DisasterAreaBounds | null>(null)
  const [disasterAreaPlace, setDisasterAreaPlace] = useState<SelectedPlace | null>(null)
  const [disasterImagery, setDisasterImagery] = useState<DisasterImagery>({
    satellite: null,
    manual: { beforeImage: null, afterImage: null },
  })
  const [damageAnalysisResult, setDamageAnalysisResult] = useState<DemoDamageAnalysisResult | null>(null)
  const [pendingAreaChange, setPendingAreaChange] = useState<PendingAreaChange | null>(null)
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
  const [evidenceSelection, setEvidenceSelection] = useState<{ kind: "record" | "demo"; id: string } | null>(null)
  const [mapLayers, setMapLayers] = useState<MapLayerVisibility>(defaultMapLayers)
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>(initialChangeEvents)
  const [analysisResult, setAnalysisResult] = useState<RouteAnalysisResponse | null>(null)
  const [analysisError, setAnalysisError] = useState("")
  const activeRequest = useRef<AbortController | null>(null)
  const selectedHazard = hazardRecords.find((hazard) => hazard.id === selectedHazardId) ?? hazardRecords[0]
  const evidenceHazard: Hazard | DemoDamageHazard | null = evidenceSelection?.kind === "demo"
    ? damageAnalysisResult?.hazards.find((hazard) => hazard.id === evidenceSelection.id) ?? null
    : hazardRecords.find((hazard) => hazard.id === evidenceSelection?.id) ?? null

  const recommendedEndpoint = analysisResult?.route.geometry.coordinates.at(-1)
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

  const closeEvidence = useCallback(() => setEvidenceSelection(null), [])

  function viewHazardEvidence(hazard: Hazard) {
    setSelectedHazardId(hazard.id)
    setEvidenceSelection({ kind: "record", id: hazard.id })
  }

  function viewDemoHazardEvidence(hazard: DemoDamageHazard) {
    setEvidenceSelection({ kind: "demo", id: hazard.id })
  }

  function viewRecommendationEvidence() {
    const demoHazard = damageAnalysisResult?.hazards[0]
    if (demoHazard) viewDemoHazardEvidence(demoHazard)
    else viewHazardEvidence(selectedHazard)
  }

  function updateHazardVerification(hazardId: string, verification: string) {
    const hazard = hazardRecords.find((item) => item.id === hazardId)
    if (!hazard || hazard.verification === verification) return

    setHazardRecords((currentHazards) => currentHazards.map((item) =>
      item.id === hazardId ? { ...item, verification } : item,
    ))
    const now = new Date()
    const confirmed = verification.includes("Confirmed")
    setChangeEvents((currentEvents) => [{
      id: `verification-${hazardId}-${now.getTime()}`,
      time: formatFeedTime(now),
      title: confirmed
        ? `${hazard.name} confirmed (mock demo)`
        : `${hazard.name} marked false positive (mock demo)`,
      detail: confirmed
        ? `${hazard.confidence}% ${hazard.type.replaceAll("-", " ")} detection confirmed for ${hazard.affected.join(" and ")}; source: ${hazard.source}.`
        : `Operator rejected the ${hazard.confidence}% ${hazard.type.replaceAll("-", " ")} detection affecting ${hazard.affected.join(" and ")}.`,
      tone: confirmed ? "safe" : "warning",
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

  function commitArea(bounds: DisasterAreaBounds, place: SelectedPlace | null) {
    setDisasterAreaBounds(bounds)
    setDisasterAreaPlace(place)
    setDamageAnalysisResult(null)
    setWorkflowStep("imagery")
  }

  function handleAreaConfirmation(bounds: DisasterAreaBounds, place: SelectedPlace | null) {
    if (!(bounds.east > bounds.west && bounds.north > bounds.south)) return
    const changed = disasterAreaBounds ? boundsMateriallyChanged(disasterAreaBounds, bounds) : false
    const hasImagery = Boolean(
      disasterImagery.satellite
      || disasterImagery.manual.beforeImage
      || disasterImagery.manual.afterImage,
    )
    if (changed && hasImagery) {
      setPendingAreaChange({ bounds, place })
      return
    }
    commitArea(bounds, place)
  }

  async function handleAnalyzeRoute() {
    if (activeRequest.current || !startingPlace || !destinationPlace) return
    const controller = new AbortController()
    activeRequest.current = controller
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("analyzing")
    const timeout = window.setTimeout(() => controller.abort(), 60000)
    const routingHazards: DemoDamageHazard[] = hazardRecords
      .filter((hazard) => !hazard.verification.toLowerCase().includes("false positive"))
      .map((hazard) => ({
        id: hazard.id,
        name: hazard.name,
        type: hazard.type,
        severity: hazard.severity,
        confidence: hazard.confidence,
        affectedInfrastructure: hazard.affected,
        polygon: hazard.polygon,
        verification: hazard.verification,
        selected: hazard.id === selectedHazardId,
      }))
    if (damageAnalysisResult) routingHazards.push(...damageAnalysisResult.hazards)
    try {
      const result = usesPresetRoute
        ? await analyzeRoute({
            startingPoint: startingPlace.presetId!,
            destination: destinationPlace.presetId!,
            responderType: responderMode,
            selectedArea: damageAnalysisResult?.bounds ?? disasterAreaBounds ?? undefined,
            detectedHazards: routingHazards,
          }, controller.signal)
        : await analyzeCoordinateRoute({
            startingPlace,
            destinationPlace,
            responderType: responderMode,
            selectedArea: damageAnalysisResult?.bounds ?? disasterAreaBounds ?? undefined,
            detectedHazards: routingHazards,
            signal: controller.signal,
          })
      if (activeRequest.current !== controller) return
      setAnalysisResult(result)
      const selectedRole = responderModes.find((mode) => mode.id === responderMode)?.label ?? "Responder"
      const now = new Date()
      const alternativeTime = new Date(now.getTime() - 1000)
      const routeEvent: ChangeEvent = {
        id: `analysis-${now.getTime()}`,
        time: formatFeedTime(now),
        title: `${result.recommendation.routeName} recommended for ${selectedRole}`,
        detail: `Requested destination: ${destinationPlace.name}. Recommended destination: ${result.recommendation.recommendedDestination}; ${result.recommendation.travelTime}, ${result.recommendation.distance}, ${result.recommendation.risk.toLowerCase()} risk.`,
        tone: "safe",
      }
      const alternativeEvent: ChangeEvent = {
        id: `alternative-${now.getTime()}`,
        time: formatFeedTime(alternativeTime),
        title: `${result.recommendation.alternative.routeName} rejected (demo hazards)`,
        detail: `${selectedRole} route to ${result.recommendation.recommendedDestination}: ${result.recommendation.alternative.rejectionReason}`,
        tone: "warning",
      }

      setAnalysisStatus("complete")
      setSelectedHazardId(hazards[0].id)
      setChangeEvents((currentEvents) => [routeEvent, alternativeEvent, ...currentEvents])
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

      {!showIntro && workflowStep === "area" && (
        <DisasterAreaSelection
          confirmedBounds={disasterAreaBounds}
          confirmedPlace={disasterAreaPlace}
          onConfirm={handleAreaConfirmation}
        />
      )}

      {!showIntro && workflowStep === "imagery" && disasterAreaBounds && (
        <DisasterImageryStep
          bounds={disasterAreaBounds}
          place={disasterAreaPlace}
          imagery={disasterImagery}
          onImageryChange={setDisasterImagery}
          onBack={() => setWorkflowStep("area")}
          onContinue={() => {
            if (
              disasterAreaBounds.east > disasterAreaBounds.west
              && disasterAreaBounds.north > disasterAreaBounds.south
            ) setWorkflowStep("analysis")
          }}
        />
      )}

      {!showIntro && workflowStep === "analysis" && disasterAreaBounds && (
        <DisasterAnalysisStep
          bounds={disasterAreaBounds}
          place={disasterAreaPlace}
          imagery={disasterImagery}
          onBack={() => setWorkflowStep("imagery")}
          onComplete={(result) => {
            setDamageAnalysisResult(result)
            resetAnalysis()
            setWorkflowStep("route")
          }}
        />
      )}

      {!showIntro && workflowStep === "route" && <motion.main
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

          <WorkflowProgress currentStep="route" />

          <div className="flex shrink-0 items-center gap-3">
            <span className="live-badge"><span className="live-dot" />Live</span>
            <span className="hidden text-[10px] text-slate-500 sm:inline">{incident.updatedLabel}</span>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:h-[calc(100vh-3.5rem)] xl:grid-cols-[280px_minmax(420px,1fr)_340px]">
          <aside className="order-1 border-b border-white/[0.07] bg-[#080c13] xl:overflow-y-auto xl:border-b-0 xl:border-r">
            <div className="p-4">
              {damageAnalysisResult && (
                <section className="mb-5 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3" aria-labelledby="selected-area-route-heading">
                  <div className="flex items-center justify-between gap-3">
                    <h2 id="selected-area-route-heading" className="text-xs font-semibold text-white">Selected area</h2>
                    <span className="mock-badge">
                      {damageAnalysisResult.analysisMode === "wide-area-context" ? "Wide-area mock" : "Detailed demo"}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{disasterAreaPlace?.name ?? "Custom bounding box"}</p>
                  <p className="mt-1 break-words font-mono text-[9px] leading-4 text-slate-600">
                    [{damageAnalysisResult.bounds.west.toFixed(5)}, {damageAnalysisResult.bounds.south.toFixed(5)}, {damageAnalysisResult.bounds.east.toFixed(5)}, {damageAnalysisResult.bounds.north.toFixed(5)}]
                  </p>
                  <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-600">Detected hazards</p>
                  <ul className="mt-2 space-y-2">
                    {damageAnalysisResult.hazards.map((hazard) => (
                      <li key={hazard.id} className="rounded-lg border border-white/[0.06] bg-black/10 p-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-medium text-slate-200">{hazard.name}</span>
                          <span className="text-amber-300">{hazard.severity}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">{hazard.confidence}% confidence · {hazard.affectedInfrastructure.join(", ")}</p>
                        <button type="button" className="mt-2 text-[10px] font-medium text-cyan-300 hover:text-cyan-200" onClick={() => viewDemoHazardEvidence(hazard)}>View Evidence</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="area-secondary-button mt-3 w-full justify-center" onClick={() => setWorkflowStep("analysis")}>
                    <ArrowLeft className="size-4" aria-hidden="true" /> Back to Analysis
                  </button>
                </section>
              )}
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
                      Real-place analysis uses the backend road network and may take several seconds.
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
                      onViewEvidence={viewRecommendationEvidence}
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
                  <RouteRecommendationPanel status={analysisStatus} recommendation={analysisResult?.recommendation ?? null} error={analysisError} onViewEvidence={viewRecommendationEvidence} />
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
          analysisResult={damageAnalysisResult}
          onClose={closeEvidence}
          onConfirm={"affected" in evidenceHazard ? (hazardId) => updateHazardVerification(hazardId, "Confirmed by operator (Mock demo)") : undefined}
          onMarkFalsePositive={"affected" in evidenceHazard ? (hazardId) => updateHazardVerification(hazardId, "False positive marked by operator (Mock demo)") : undefined}
          onUseManualImagery={() => {
            closeEvidence()
            setWorkflowStep("imagery")
          }}
        />
      )}

      {pendingAreaChange && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4" role="presentation">
          <section
            className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0c111b] p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-area-title"
            aria-describedby="change-area-description"
          >
            <h2 id="change-area-title" className="text-lg font-semibold text-white">Change analysis area?</h2>
            <p id="change-area-description" className="mt-2 text-sm leading-6 text-slate-400">
              The selected imagery is associated with the current area. Changing the area will remove the Before and After images.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="area-secondary-button" onClick={() => setPendingAreaChange(null)}>Cancel</button>
              <button
                type="button"
                className="area-primary-button"
                onClick={() => {
                  const nextArea = pendingAreaChange
                  setPendingAreaChange(null)
                  setDisasterImagery({
                    satellite: null,
                    manual: { beforeImage: null, afterImage: null },
                  })
                  commitArea(nextArea.bounds, nextArea.place)
                }}
              >
                Change area
              </button>
            </div>
          </section>
        </div>
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
