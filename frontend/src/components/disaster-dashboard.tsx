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
import { DestinationTypeSelector } from "@/src/components/destination-type-selector"
import { DisasterMap } from "@/src/components/disaster-map"
import { LiveDataSources } from "@/src/components/live-data-sources"
import { MapLayerControls } from "@/src/components/map-layer-controls"
import { PlaceSearchInput } from "@/src/components/place-search-input"
import { ResponderModeSelector } from "@/src/components/responder-mode-selector"
import { RouteRecommendationPanel } from "@/src/components/route-recommendation-panel"
import { ThreeDimensionalGlobe } from "@/src/components/three-dimensional-globe"
import { WhatChangedFeed } from "@/src/components/what-changed-feed"
import { analyzeRoute } from "@/src/lib/route-analysis"
import {
  defaultMapLayers,
  destinationLocationsByType,
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
  type Hazard,
  type MapLayerVisibility,
  type ResponderMode,
  type RouteAnalysisResponse,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

type AnalysisStatus = "idle" | "analyzing" | "complete" | "error"

function isValidPlace(place: SelectedPlace | null): place is SelectedPlace {
  return Boolean(
    place
    && typeof place.id === "string"
    && place.id.trim()
    && typeof place.name === "string"
    && place.name.trim()
    && Number.isFinite(place.longitude)
    && Number.isFinite(place.latitude)
    && place.longitude >= -180
    && place.longitude <= 180
    && place.latitude >= -90
    && place.latitude <= 90,
  )
}

export function DisasterDashboard() {
  const [showIntro, setShowIntro] = useState(true)
  const [responderMode, setResponderMode] = useState<ResponderMode>("ambulance")
  const [startingPlace, setStartingPlace] = useState<SelectedPlace | null>(() =>
    locationOptionToSelectedPlace(startingLocations[0], "fire station"),
  )
  const [destinationPlace, setDestinationPlace] = useState<SelectedPlace | null>(() =>
    locationOptionToSelectedPlace(destinationLocationsByType.hospital[0], "hospital"),
  )
  const [destinationType, setDestinationType] = useState<DestinationType>("hospital")
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle")
  const [selectedHazard, setSelectedHazard] = useState<Hazard>(hazards[0])
  const [mapLayers, setMapLayers] = useState<MapLayerVisibility>(defaultMapLayers)
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>(initialChangeEvents)
  const [analysisResult, setAnalysisResult] = useState<RouteAnalysisResponse | null>(null)
  const [analysisError, setAnalysisError] = useState("")
  const activeRequest = useRef<AbortController | null>(null)

  const recommendedEndpoint = analysisResult?.route.coordinates.at(-1)
  const displayedDestinationPlace: SelectedPlace | null = analysisResult && recommendedEndpoint
    && Number.isFinite(recommendedEndpoint[0]) && Number.isFinite(recommendedEndpoint[1])
      ? {
        id: `recommended-${analysisResult.recommendation.role}`,
        name: analysisResult.recommendation.recommendedDestination,
        longitude: recommendedEndpoint[0],
        latitude: recommendedEndpoint[1],
        category: "Role-specific mock destination",
        source: "mock",
      }
    : isValidPlace(destinationPlace) ? destinationPlace : null
  const displayedDestinationType: DestinationType = analysisResult
    ? responderMode === "civilian"
      ? "shelter"
      : responderMode === "ambulance"
        ? "hospital"
        : "custom"
    : destinationType
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""
  const searchProximity = useMemo<Coordinates>(() => isValidPlace(startingPlace)
    ? [startingPlace.longitude, startingPlace.latitude]
    : incident.center,
  [startingPlace])
  const canAnalyzeRoute = Boolean(
    isValidPlace(startingPlace)
    && isValidPlace(destinationPlace)
    && startingPlace.presetId
    && destinationPlace.presetId,
  )
  const availableMockDestinations = destinationType === "custom"
    ? destinations
    : destinationLocationsByType[destinationType]

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

  function handleStartingPlaceChange(place: SelectedPlace | null) {
    resetAnalysis()
    setStartingPlace(isValidPlace(place) ? place : null)
  }

  function handleDestinationPlaceChange(place: SelectedPlace | null) {
    resetAnalysis()
    setDestinationPlace(isValidPlace(place) ? place : null)
  }

  function handleDestinationTypeChange(type: DestinationType) {
    resetAnalysis()
    setDestinationType(type)
    const defaultDestination = type === "custom" ? null : destinationLocationsByType[type][0]
    setDestinationPlace(defaultDestination
      ? locationOptionToSelectedPlace(defaultDestination, type.replaceAll("-", " "))
      : null)
  }

  function resetAnalysis() {
    activeRequest.current?.abort()
    activeRequest.current = null
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("idle")
  }

  async function handleAnalyzeRoute() {
    if (activeRequest.current || !startingPlace?.presetId || !destinationPlace?.presetId) return
    const controller = new AbortController()
    activeRequest.current = controller
    setAnalysisResult(null)
    setAnalysisError("")
    setAnalysisStatus("analyzing")
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const result = await analyzeRoute({
        startingPoint: startingPlace.presetId,
        destination: destinationPlace.presetId,
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
                  <DestinationTypeSelector
                    value={destinationType}
                    onChange={handleDestinationTypeChange}
                  />

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

                      <PlaceSearchInput
                        key={`${destinationType}:${destinationPlace?.id ?? "empty"}`}
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
                          value={destinationPlace?.id ?? ""}
                          onChange={(event) => {
                            const location = availableMockDestinations.find((item) => item.id === event.target.value)
                            if (location) {
                              handleDestinationPlaceChange(locationOptionToSelectedPlace(
                                location,
                                destinationType.replaceAll("-", " "),
                              ))
                            }
                          }}
                        >
                          {availableMockDestinations.map((location) => (
                            <option key={location.id} value={location.id}>{location.name}</option>
                          ))}
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
                    className="analyze-button"
                    onClick={handleAnalyzeRoute}
                    disabled={analysisStatus === "analyzing" || !canAnalyzeRoute}
                  >
                    {analysisStatus === "analyzing" ? (
                      <><span className="button-spinner" />Analyzing network</>
                    ) : (
                      <>Analyze route<ArrowRight className="size-3.5" aria-hidden="true" /></>
                    )}
                  </button>
                  {mapboxToken && !canAnalyzeRoute && (
                    <p className="text-[10px] leading-4 text-slate-500">
                      Real-place markers are ready. Coordinate-based route analysis requires the next backend update.
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
            <DisasterMap
              layers={mapLayers}
              analysisComplete={analysisStatus === "complete"}
              recommendedRoute={analysisResult?.route ?? null}
              selectedHazardId={selectedHazard.id}
              onSelectHazard={handleHazardSelection}
              startingPlace={startingPlace}
              destinationPlace={displayedDestinationPlace}
              destinationType={displayedDestinationType}
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
