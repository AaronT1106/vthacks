"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Flame, Radar } from "lucide-react"
import { motion } from "framer-motion"
import type { DisasterImagery } from "@/src/components/disaster-imagery-step"
import { WorkflowProgress } from "@/src/components/workflow-progress"
import type { DemoDamageAnalysisResult, DisasterAreaBounds, SelectedPlace } from "@/src/data/mock-disaster-data"
import { analyzeFlood, type FloodAnalysisResult } from "@/src/lib/flood-analysis"
import { fetchFireHotspots, type FireHotspotResult } from "@/src/lib/fire-hotspots"
import { isValidComparisonPair } from "@/src/lib/satellite-imagery"

type AnalysisRequestStatus = "idle" | "loading" | "success" | "error"

function LocalAfterImage({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    // A blob URL is required to display the exact in-memory upload beneath the mask.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Uploaded After imagery" className="absolute inset-0 h-full w-full object-contain" />
  )
}

export function DisasterAnalysisStep({
  bounds,
  place,
  imagery,
  onBack,
  onComplete,
}: {
  bounds: DisasterAreaBounds
  place: SelectedPlace | null
  imagery: DisasterImagery
  onBack: () => void
  onComplete: (result: DemoDamageAnalysisResult) => void
}) {
  const [floodStatus, setFloodStatus] = useState<AnalysisRequestStatus>("idle")
  const [floodResult, setFloodResult] = useState<FloodAnalysisResult | null>(null)
  const [maskError, setMaskError] = useState(false)
  const [floodError, setFloodError] = useState("")
  const [fireStatus, setFireStatus] = useState<AnalysisRequestStatus>("idle")
  const [fireResult, setFireResult] = useState<FireHotspotResult | null>(null)
  const [fireError, setFireError] = useState("")
  const floodRequest = useRef<AbortController | null>(null)
  const fireRequest = useRef<AbortController | null>(null)
  const manualFilesReady = Boolean(imagery.manual.beforeImage && imagery.manual.afterImage)
  const satellitePairReady = Boolean(
    imagery.satellite && isValidComparisonPair(imagery.satellite.beforeImage, imagery.satellite.afterImage),
  )
  const readiness = [
    ["Area ready", bounds.east > bounds.west && bounds.north > bounds.south],
    ["Before image ready", Boolean(imagery.manual.beforeImage || imagery.satellite?.beforeImage)],
    ["After image ready", Boolean(imagery.manual.afterImage || imagery.satellite?.afterImage)],
  ] as const
  const areaReady = bounds.east > bounds.west && bounds.north > bounds.south
  const inputsReady = areaReady && (manualFilesReady || satellitePairReady)
  const floodComplete = floodStatus === "success" && floodResult !== null
  const fireComplete = fireStatus === "success" && fireResult !== null

  useEffect(() => () => {
    floodRequest.current?.abort()
    fireRequest.current?.abort()
    floodRequest.current = null
    fireRequest.current = null
  }, [])

  function createDemoResult(mode: "detailed-upload" | "detailed-sentinel"): DemoDamageAnalysisResult | null {
    const centerLongitude = (bounds.west + bounds.east) / 2
    const centerLatitude = (bounds.south + bounds.north) / 2
    const detailed = mode === "detailed-upload"
    const beforeImage = detailed && imagery.manual.beforeImage
      ? {
          source: "Manual upload" as const,
          label: imagery.manual.beforeImage.name,
          captureDate: null,
          imageUrl: null,
          imageFile: imagery.manual.beforeImage,
          layerName: null,
          cloudCoverage: null,
        }
      : imagery.satellite
        ? {
            source: "Copernicus Sentinel-2" as const,
            label: "Before Sentinel-2 imagery",
            captureDate: imagery.satellite.beforeImage.captureDate,
            imageUrl: imagery.satellite.beforeImage.imageUrl,
            imageFile: null,
            layerName: imagery.satellite.beforeImage.layerName,
            cloudCoverage: imagery.satellite.beforeImage.cloudCoverage,
          }
        : null
    const afterImage = detailed && imagery.manual.afterImage
      ? {
          source: "Manual upload" as const,
          label: imagery.manual.afterImage.name,
          captureDate: null,
          imageUrl: null,
          imageFile: imagery.manual.afterImage,
          layerName: null,
          cloudCoverage: null,
        }
      : imagery.satellite
        ? {
            source: "Copernicus Sentinel-2" as const,
            label: "After Sentinel-2 imagery",
            captureDate: imagery.satellite.afterImage.captureDate,
            imageUrl: imagery.satellite.afterImage.imageUrl,
            imageFile: null,
            layerName: imagery.satellite.afterImage.layerName,
            cloudCoverage: imagery.satellite.afterImage.cloudCoverage,
          }
        : null
    if (!beforeImage || !afterImage) return null

    return {
      dataSource: "demo-analysis",
      analysisMode: mode,
      bounds: { ...bounds },
      imagerySource: detailed ? "manual" : "Copernicus Sentinel-2",
      beforeImage,
      afterImage,
      hazards: detailed
        ? [
            {
              id: `demo-flood-${centerLongitude.toFixed(4)}-${centerLatitude.toFixed(4)}`,
              name: "Potential Flooded Road Segment",
              type: "flooding",
              severity: "HIGH",
              confidence: 88,
              affectedInfrastructure: ["Primary road access", "Emergency vehicle corridor"],
            },
            {
              id: `demo-bridge-${centerLongitude.toFixed(4)}-${centerLatitude.toFixed(4)}`,
              name: "Potential Bridge Access Damage",
              type: "bridge-damage",
              severity: "MEDIUM",
              confidence: 81,
              affectedInfrastructure: ["Bridge crossing", "Supply route"],
            },
          ]
        : [
            {
              id: `demo-sentinel-flood-${centerLongitude.toFixed(4)}-${centerLatitude.toFixed(4)}`,
              name: "Potential Flooded Road Segment",
              type: "flooding",
              severity: "HIGH",
              confidence: 82,
              affectedInfrastructure: ["Primary road access", "Emergency vehicle corridor"],
            },
            {
              id: `demo-sentinel-bridge-${centerLongitude.toFixed(4)}-${centerLatitude.toFixed(4)}`,
              name: "Potential Bridge Access Damage",
              type: "bridge-damage",
              severity: "MEDIUM",
              confidence: 76,
              affectedInfrastructure: ["Bridge crossing", "Supply route"],
            },
          ],
    }
  }

  function continueToRoutePlanning() {
    const centerLongitude = (bounds.west + bounds.east) / 2
    const centerLatitude = (bounds.south + bounds.north) / 2
    const unavailableImage = {
      source: "No comparison imagery" as const,
      label: "Comparison unavailable",
      captureDate: null,
      imageUrl: null,
      imageFile: null,
      layerName: null,
      cloudCoverage: null,
    }
    onComplete({
      dataSource: "demo-analysis",
      analysisMode: "wide-area-context",
      bounds: { ...bounds },
      imagerySource: "selected area only",
      beforeImage: unavailableImage,
      afterImage: { ...unavailableImage },
      hazards: [{
        id: `demo-area-hazard-${centerLongitude.toFixed(4)}-${centerLatitude.toFixed(4)}`,
        name: "Selected Area Requires Field Verification",
        type: "selected-area-context",
        severity: "MEDIUM",
        confidence: 50,
        affectedInfrastructure: ["Selected-area access routes"],
      }],
    })
  }

  function continueAfterAnalysis() {
    const analysis = createDemoResult(manualFilesReady ? "detailed-upload" : "detailed-sentinel")
    if (analysis) onComplete(analysis)
  }

  async function submitFloodAnalysis() {
    if (floodRequest.current || !inputsReady) {
      if (!inputsReady) {
        setFloodStatus("error")
        setFloodError("A complete Sentinel-2 pair or manual Before and After uploads are required.")
      }
      return
    }

    const controller = new AbortController()
    floodRequest.current = controller
    setFloodStatus("loading")
    setFloodResult(null)
    setMaskError(false)
    setFloodError("")
    const timeout = window.setTimeout(() => controller.abort(), 120000)
    try {
      const floodResult = manualFilesReady && imagery.manual.afterImage
        ? await analyzeFlood({ bounds, afterImage: imagery.manual.afterImage, signal: controller.signal })
        : imagery.satellite
          ? await analyzeFlood({ bounds, satelliteImage: imagery.satellite.afterImage, signal: controller.signal })
          : null
      if (!floodResult) throw new Error("No complete imagery pair is available.")
      if (floodRequest.current !== controller) return
      setFloodResult(floodResult)
      setFloodStatus("success")
    } catch (error) {
      if (floodRequest.current !== controller) return
      setFloodStatus("error")
      setFloodError(controller.signal.aborted
        ? "Flood analysis timed out. The first model download can take longer; please try again."
        : error instanceof TypeError
          ? "Unable to reach the flood-analysis service. Check that the backend is running and try again."
          : error instanceof Error
            ? error.message
            : "Flood-analysis service is unavailable. Please try again.")
    } finally {
      window.clearTimeout(timeout)
      if (floodRequest.current === controller) floodRequest.current = null
    }
  }

  async function submitFireAnalysis() {
    if (fireRequest.current || !areaReady) return
    const controller = new AbortController()
    fireRequest.current = controller
    setFireStatus("loading")
    setFireResult(null)
    setFireError("")
    const timeout = window.setTimeout(() => controller.abort(), 35000)
    try {
      const nextResult = await fetchFireHotspots(bounds, controller.signal)
      if (fireRequest.current !== controller) return
      setFireResult(nextResult)
      setFireStatus("success")
    } catch (error) {
      if (fireRequest.current !== controller) return
      setFireStatus("error")
      setFireError(controller.signal.aborted
        ? "NASA FIRMS lookup timed out. Please try again."
        : error instanceof Error
          ? error.message
          : "NASA FIRMS hotspot lookup is unavailable. Please try again.")
    } finally {
      window.clearTimeout(timeout)
      if (fireRequest.current === controller) fireRequest.current = null
    }
  }

  return (
    <motion.main className="min-h-screen bg-[#05080e] text-slate-100" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="border-b border-white/[0.07] bg-[#080c13]">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <Radar className="size-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-white">DisasterLens</span>
          </div>
          <WorkflowProgress currentStep="analysis" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-medium text-cyan-300">Analysis</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white">Ready to analyze imagery</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Analyze the selected After image for potential flood/water coverage and check the confirmed area for NASA FIRMS active-fire detections.
        </p>

        <section className="mt-7 rounded-xl border border-slate-800 bg-[#0c111b] p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Selected area</p>
          <p className="mt-1 text-sm text-slate-200">{place?.name ?? "Area confirmed"}</p>
          <p className="mt-2 text-xs text-slate-500">
            Detailed analysis source: {manualFilesReady ? "High-resolution uploaded imagery" : satellitePairReady ? "Copernicus Sentinel-2 imagery" : "Not provided"}
          </p>
          <div className="mt-5 space-y-3">
            {readiness.map(([label, ready]) => (
              <div key={label} className="flex items-center gap-3 text-sm text-slate-300">
                <span className={`grid size-5 place-items-center rounded-full ${ready ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-800 text-slate-600"}`}>
                  {ready && <Check className="size-3" aria-hidden="true" />}
                </span>
                {label}
              </div>
            ))}
          </div>
        </section>

        {satellitePairReady && !manualFilesReady && (
          <p className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm leading-6 text-amber-100" role="status">
            <strong>Sentinel-2 imagery.</strong> These scenes support a local-area demo comparison, but they do not make individual road or building damage certain. Human verification is required.
          </p>
        )}

        {floodStatus === "success" && floodResult && (
          <section className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5" aria-live="polite">
            <p className="text-xs font-medium text-emerald-300">Flood segmentation complete</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Potential flood/water coverage</h2>
                <p className="mt-1 text-3xl font-semibold text-cyan-300">{floodResult.flood.floodCoveragePercent.toFixed(2)}%</p>
              </div>
              <p className="text-xs text-slate-400">{floodResult.flood.floodPixelCount.toLocaleString()} of {floodResult.flood.totalPixelCount.toLocaleString()} valid pixels</p>
            </div>

            <div
              className="relative mt-5 w-full overflow-hidden rounded-lg border border-cyan-400/20 bg-slate-950"
              style={{ aspectRatio: `${floodResult.image.width} / ${floodResult.image.height}` }}
            >
              {manualFilesReady && imagery.manual.afterImage ? (
                <LocalAfterImage file={imagery.manual.afterImage} />
              ) : imagery.satellite?.afterImage.imageUrl ? (
                // The existing same-origin URL serves the exact cached pixels analyzed by the model.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagery.satellite.afterImage.imageUrl} alt="Sentinel-2 After imagery" className="absolute inset-0 h-full w-full object-contain" />
              ) : null}
              {!maskError && (
                // The mask has exactly the same intrinsic dimensions and scales with the base image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={floodResult.mask.url}
                  alt="Cyan flood and water segmentation overlay"
                  className="absolute inset-0 h-full w-full object-contain"
                  onError={() => setMaskError(true)}
                />
              )}
            </div>
            {maskError && <p className="mt-3 text-xs text-amber-300">The temporary mask expired. Run the analysis again.</p>}

            <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
              This After-only model detects water-class pixels and may include permanent rivers, ponds, shadows, or cloud artifacts. Treat the overlay as a potential flood indicator and verify it with field or before-event evidence.
            </p>

            <dl className="mt-5 grid gap-4 border-t border-white/[0.07] pt-4 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-600">Analyzed image</dt><dd className="mt-1 text-slate-200">{floodResult.image.width} × {floodResult.image.height} {floodResult.image.format}</dd></div>
              <div><dt className="text-slate-600">Model input</dt><dd className="mt-1 text-slate-200">{floodResult.processing.inputWidth} × {floodResult.processing.inputHeight}</dd></div>
              <div><dt className="text-slate-600">Model</dt><dd className="mt-1 break-all text-slate-200">{floodResult.model.architecture} · {floodResult.model.identifier}</dd></div>
              <div><dt className="text-slate-600">Inference device</dt><dd className="mt-1 uppercase text-slate-200">{floodResult.model.device}</dd></div>
              <div><dt className="text-slate-600">Source</dt><dd className="mt-1 text-slate-200">{floodResult.acquisition.provider ?? "Manual upload"}</dd></div>
              <div><dt className="text-slate-600">Invalid pixels excluded</dt><dd className="mt-1 text-slate-200">{floodResult.flood.invalidPixelCount.toLocaleString()}</dd></div>
              <div><dt className="text-slate-600">Confirmed bounds</dt><dd className="mt-1 text-slate-200">{floodResult.acquisition.bbox.map((coordinate) => coordinate.toFixed(5)).join(", ")}</dd></div>
              <div><dt className="text-slate-600">Mask dimensions</dt><dd className="mt-1 text-slate-200">{floodResult.mask.width} × {floodResult.mask.height}</dd></div>
              {floodResult.acquisition.sceneId && <div><dt className="text-slate-600">Scene ID</dt><dd className="mt-1 break-all text-slate-200">{floodResult.acquisition.sceneId}</dd></div>}
              {floodResult.acquisition.capturedAt && <div><dt className="text-slate-600">Captured</dt><dd className="mt-1 text-slate-200">{new Date(floodResult.acquisition.capturedAt).toLocaleString()}</dd></div>}
              {floodResult.acquisition.cloudCoverage !== null && <div><dt className="text-slate-600">Scene cloud cover</dt><dd className="mt-1 text-slate-200">{floodResult.acquisition.cloudCoverage.toFixed(1)}%</dd></div>}
              {floodResult.acquisition.dataMode && <div><dt className="text-slate-600">Satellite data mode</dt><dd className="mt-1 capitalize text-slate-200">{floodResult.acquisition.dataMode}</dd></div>}
              {floodResult.acquisition.filename && <div><dt className="text-slate-600">Uploaded file</dt><dd className="mt-1 break-all text-slate-200">{floodResult.acquisition.filename}</dd></div>}
              {floodResult.acquisition.contentType && <div><dt className="text-slate-600">Content type</dt><dd className="mt-1 text-slate-200">{floodResult.acquisition.contentType}</dd></div>}
            </dl>
          </section>
        )}

        {floodStatus === "error" && floodError && (
          <p className="mt-5 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200" role="alert">
            {floodError}
          </p>
        )}

        <section className="mt-5 rounded-xl border border-orange-400/15 bg-[#0c111b] p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-orange-400/20 bg-orange-400/[0.07] text-orange-300">
              <Flame className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-medium text-orange-300">NASA FIRMS Active Fire</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Satellite active-fire detections</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Checks the exact confirmed area using VIIRS NOAA-21 observations from the configured recent time window.</p>
            </div>
          </div>

          {fireStatus === "success" && fireResult && (
            <div className="mt-5 border-t border-white/[0.07] pt-4" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Active fire detections</p>
                  <p className="mt-1 text-3xl font-semibold text-orange-300">{fireResult.detectionCount}</p>
                </div>
                <p className="text-xs text-slate-500">{fireResult.source.product} · {fireResult.source.dayRange}-day window</p>
              </div>
              {fireResult.detectionCount === 0 ? (
                <p className="mt-4 rounded-lg border border-white/[0.07] bg-black/10 px-4 py-3 text-sm text-slate-300">
                  No active fire detections were returned for this area and time window.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-slate-400">
                    Most recent detection: {fireResult.detections[0].acquiredAt
                      ? new Date(fireResult.detections[0].acquiredAt).toLocaleString()
                      : `${fireResult.detections[0].acquisitionDate} · ${fireResult.detections[0].acquisitionTime} UTC`}
                  </p>
                  <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07] bg-black/10 px-4">
                    {fireResult.detections.slice(0, 5).map((detection, index) => (
                      <li key={`${detection.latitude}-${detection.longitude}-${detection.acquisitionDate}-${detection.acquisitionTime}-${index}`} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                        <span className="text-slate-300">{detection.acquiredAt ? new Date(detection.acquiredAt).toLocaleString() : `${detection.acquisitionDate} ${detection.acquisitionTime} UTC`}</span>
                        <span className="text-slate-500">FRP: {detection.frp === null ? "Not provided" : detection.frp} · Confidence: {detection.confidence ?? "Not provided"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
                FIRMS rows are satellite hotspot observations, not unique wildfires or proof that a fire is currently burning. Detection timing, cloud cover, visibility, and sensor thresholds can limit results.
              </p>
            </div>
          )}

          {fireStatus === "error" && fireError && <p className="mt-4 text-sm text-red-200" role="alert">{fireError}</p>}
          <button
            type="button"
            className="area-secondary-button mt-5"
            disabled={fireStatus === "loading" || !areaReady}
            onClick={() => void submitFireAnalysis()}
          >
            {fireStatus === "loading" ? <><span className="button-spinner" />Checking NASA FIRMS…</> : "Check Fire Hotspots"}
          </button>
        </section>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="area-secondary-button" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to imagery
          </button>
          <div className="text-right">
            <button
              type="button"
              className="area-primary-button min-w-36"
              disabled={floodStatus === "loading" || !inputsReady}
              onClick={() => void submitFloodAnalysis()}
            >
              {floodStatus === "loading" ? <><span className="button-spinner" />Analyzing flood conditions…</> : "Analyze Flood Conditions"}
            </button>
            <p className="mt-2 max-w-sm text-[10px] text-slate-600">
              {manualFilesReady
                ? "Runs real SegFormer-B0 inference on the uploaded After image."
                : satellitePairReady
                  ? "Runs real SegFormer-B0 inference on the selected Sentinel-2 After image."
                  : "Fetch Sentinel-2 imagery or upload a complete manual pair."}
            </p>
            {(floodComplete || fireComplete) && (
              <button type="button" className="area-secondary-button mt-3" onClick={floodComplete ? continueAfterAnalysis : continueToRoutePlanning}>
                Continue to route planning <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.main>
  )
}
