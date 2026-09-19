"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, Radar } from "lucide-react"
import { motion } from "framer-motion"
import type { DisasterImagery } from "@/src/components/disaster-imagery-step"
import { WorkflowProgress } from "@/src/components/workflow-progress"
import type { DemoDamageAnalysisResult, DisasterAreaBounds, SelectedPlace } from "@/src/data/mock-disaster-data"
import { analyzeDamage, analyzeSatelliteDamage, type AnalyzeDamageResponse } from "@/src/lib/damage-analysis"
import { isValidComparisonPair } from "@/src/lib/satellite-imagery"

type AnalysisRequestStatus = "idle" | "loading" | "success" | "error"

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
  const [status, setStatus] = useState<AnalysisRequestStatus>("idle")
  const [receipt, setReceipt] = useState<AnalyzeDamageResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const activeRequest = useRef<AbortController | null>(null)
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

  useEffect(() => () => {
    activeRequest.current?.abort()
    activeRequest.current = null
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

  async function submitDamageAnalysis() {
    if (activeRequest.current || !inputsReady) {
      if (!inputsReady) {
        setStatus("error")
        setErrorMessage("A complete Sentinel-2 pair or manual Before and After uploads are required.")
      }
      return
    }

    const controller = new AbortController()
    activeRequest.current = controller
    setStatus("loading")
    setReceipt(null)
    setErrorMessage("")
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const result = manualFilesReady && imagery.manual.beforeImage && imagery.manual.afterImage
        ? await analyzeDamage(bounds, imagery.manual.beforeImage, imagery.manual.afterImage, controller.signal)
        : imagery.satellite
          ? await analyzeSatelliteDamage(bounds, imagery.satellite.beforeImage, imagery.satellite.afterImage, controller.signal)
          : null
      if (!result) throw new Error("No complete imagery pair is available.")
      if (activeRequest.current !== controller) return
      setReceipt(result)
      setStatus("success")
      const analysis = createDemoResult(manualFilesReady ? "detailed-upload" : "detailed-sentinel")
      if (analysis) onComplete(analysis)
    } catch (error) {
      if (activeRequest.current !== controller) return
      setStatus("error")
      setErrorMessage(controller.signal.aborted
        ? "Damage-analysis request timed out. Please try again."
        : error instanceof TypeError
          ? "Unable to reach the damage-analysis service. Check that the backend is running and try again."
          : error instanceof Error
            ? error.message
            : "Damage-analysis service is unavailable. Please try again.")
    } finally {
      window.clearTimeout(timeout)
      if (activeRequest.current === controller) activeRequest.current = null
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
          The selected area and both images are held in this browser session. Damage analysis is the next implementation step.
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

        {status === "success" && receipt && (
          <section className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5" aria-live="polite">
            <p className="text-xs font-medium text-emerald-300">Analysis connection successful</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{receipt.message}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {receipt.analysisMessage ?? "The backend received and validated the imagery metadata and confirmed bounds. No damage analysis was performed."}
            </p>
            <dl className="mt-5 grid gap-4 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-600">Before image</dt><dd className="mt-1 break-all text-slate-200">{receipt.before_filename}</dd></div>
              <div><dt className="text-slate-600">After image</dt><dd className="mt-1 break-all text-slate-200">{receipt.after_filename}</dd></div>
              <div><dt className="text-slate-600">Area</dt><dd className="mt-1 text-slate-200">Confirmed</dd></div>
              <div><dt className="text-slate-600">Backend</dt><dd className="mt-1 text-slate-200">Received</dd></div>
              <div><dt className="text-slate-600">Before content type</dt><dd className="mt-1 text-slate-200">{receipt.before_content_type}</dd></div>
              <div><dt className="text-slate-600">After content type</dt><dd className="mt-1 text-slate-200">{receipt.after_content_type}</dd></div>
            </dl>
            {receipt.analysisPrepared && receipt.analysisRasters && (
              <div className="mt-5 grid gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-2">
                {receipt.analysisRasters.map((raster, index) => (
                  <div key={raster.sceneId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                    <p className="font-medium text-slate-200">{index === 0 ? "Before" : "After"} analysis raster</p>
                    <p className="mt-2">Scene: <span className="break-all text-slate-300">{raster.sceneId}</span></p>
                    <p>Dimensions: {raster.width} × {raster.height}</p>
                    <p>CRS: {raster.crs}</p>
                    <p>Estimated pixel size: {raster.estimatedResolutionMeters} m</p>
                    <p>Bands: {raster.bandNames.join(", ")}</p>
                  </div>
                ))}
              </div>
            )}
            <details className="mt-5 border-t border-white/[0.07] pt-4 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300">Received bounds</summary>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <p><span className="block text-slate-600">West</span>{receipt.bounds.west}</p>
                <p><span className="block text-slate-600">South</span>{receipt.bounds.south}</p>
                <p><span className="block text-slate-600">East</span>{receipt.bounds.east}</p>
                <p><span className="block text-slate-600">North</span>{receipt.bounds.north}</p>
              </div>
            </details>
          </section>
        )}

        {status === "error" && errorMessage && (
          <p className="mt-5 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="area-secondary-button" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to imagery
          </button>
          <div className="text-right">
            <button
              type="button"
              className="area-primary-button min-w-36"
              disabled={status === "loading" || !inputsReady}
              onClick={submitDamageAnalysis}
            >
              {status === "loading" ? <><span className="button-spinner" />Analyzing…</> : "Analyze damage"}
            </button>
            <p className="mt-2 max-w-sm text-[10px] text-slate-600">
              {manualFilesReady
                ? "High-resolution uploaded imagery. Verifies transport and creates a demo analysis result."
                : satellitePairReady
                  ? "Sentinel-2 imagery. Verifies the provider references and creates a demo analysis result."
                  : "Fetch Sentinel-2 imagery or upload a complete manual pair."}
            </p>
            {!inputsReady && areaReady && (
              <button type="button" className="area-secondary-button mt-3" onClick={continueToRoutePlanning}>
                Continue to route planning
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.main>
  )
}
