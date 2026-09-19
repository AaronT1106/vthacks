"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock3, ImageIcon, RadioTower, RotateCcw, ShieldCheck, X, XCircle, ZoomIn, ZoomOut } from "lucide-react"
import type {
  DamageEvidenceImage,
  DemoDamageAnalysisResult,
  DemoDamageHazard,
  Hazard,
} from "@/src/data/mock-disaster-data"

interface HazardEvidencePanelProps {
  hazard: Hazard | DemoDamageHazard
  analysisResult: DemoDamageAnalysisResult | null
  onClose: () => void
  onConfirm?: (hazardId: string) => void
  onMarkFalsePositive?: (hazardId: string) => void
  onUseManualImagery: () => void
}

export function HazardEvidencePanel({
  hazard,
  analysisResult,
  onClose,
  onConfirm,
  onMarkFalsePositive,
  onUseManualImagery,
}: HazardEvidencePanelProps) {
  const isRecordedHazard = "affected" in hazard
  const affectedInfrastructure = isRecordedHazard ? hazard.affected : hazard.affectedInfrastructure
  const [fullImage, setFullImage] = useState<{ label: string; image: DamageEvidenceImage } | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (fullImage) setFullImage(null)
      else onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [fullImage, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hazard-evidence-heading"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0c111b] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="section-label">
                {analysisResult?.analysisMode === "wide-area-context" ? "Wide-area context" : "Hazard evidence"}
              </p>
              <span className="mock-badge">
                {analysisResult?.analysisMode === "wide-area-context" ? "Context only" : "Demo analysis"}
              </span>
            </div>
            <h2 id="hazard-evidence-heading" className="mt-2 text-xl font-semibold text-white">{hazard.name}</h2>
            <p className="mt-1 text-xs capitalize text-slate-500">{hazard.type.replaceAll("-", " ")}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200" aria-label="Close hazard evidence">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <EvidenceImage label="Before image" image={analysisResult?.beforeImage ?? null} onOpen={(image) => setFullImage({ label: "Before image", image })} onUseManualImagery={onUseManualImagery} />
          <EvidenceImage label="After image" image={analysisResult?.afterImage ?? null} onOpen={(image) => setFullImage({ label: "After image", image })} onUseManualImagery={onUseManualImagery} emphasized />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <EvidenceMetric label="Type" value={hazard.type.replaceAll("-", " ")} />
          <EvidenceMetric label="Severity" value={hazard.severity} />
          <EvidenceMetric label="Confidence" value={`${hazard.confidence}%`} />
          <EvidenceMetric label="Verification" value={isRecordedHazard ? hazard.verification : "Human review required"} />
        </dl>

        <div className="mt-5 grid gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2">
          <div className="space-y-3 text-xs text-slate-400">
            <p className="flex items-start gap-2">
              <RadioTower className="mt-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden="true" />
              <span><strong className="text-slate-300">Source:</strong> {analysisResult?.imagerySource ?? (isRecordedHazard ? hazard.source : "Demo analysis")}</span>
            </p>
            <p className="flex items-start gap-2">
              <Clock3 className="mt-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden="true" />
              <span><strong className="text-slate-300">Detected:</strong> {isRecordedHazard ? hazard.detected : "Current demo analysis session"}</span>
            </p>
          </div>
          <div>
            <p className="section-label">Affected infrastructure</p>
            <ul className="mt-2 space-y-2">
              {affectedInfrastructure.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-slate-300">
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-4">
          <p className="section-label">Potential impact</p>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            {isRecordedHazard ? hazard.impact : `Potential disruption to ${affectedInfrastructure.join(" and ")}. This is a demo-analysis finding.`}
          </p>
        </div>

        {analysisResult && (
          <div className="mt-5 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] p-4 text-xs leading-5 text-slate-300">
            <p><strong className="text-white">Selected bounding box:</strong> [{analysisResult.bounds.west}, {analysisResult.bounds.south}, {analysisResult.bounds.east}, {analysisResult.bounds.north}]</p>
            <p className="mt-2 font-medium text-white">
              {analysisResult.analysisMode === "detailed-upload"
                ? "High-resolution uploaded imagery."
                : "Copernicus Sentinel-2 imagery."}
            </p>
            <p>
              {analysisResult.analysisMode === "detailed-upload"
                ? "These session-only uploads support this detailed demo analysis."
                : "Sentinel-2 supports local-area comparison, but individual road or building damage remains a potential finding until a human verifies it."}
            </p>
            <p className="mt-2 text-amber-200">Human verification is required.</p>
          </div>
        )}

        <div className="mt-5 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="size-4 text-cyan-300" aria-hidden="true" />
            Human verification required · Local demo decision
          </div>
          {onConfirm && onMarkFalsePositive && isRecordedHazard && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => onConfirm(hazard.id)} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Confirm hazard
              </button>
              <button type="button" onClick={() => onMarkFalsePositive(hazard.id)} className="flex items-center justify-center gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.07] px-4 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10">
                <XCircle className="size-4" aria-hidden="true" /> Mark false positive
              </button>
            </div>
          )}
        </div>
      </section>
      {fullImage && analysisResult && (
        <FullImageViewer
          label={fullImage.label}
          image={fullImage.image}
          bounds={analysisResult.bounds}
          onClose={() => setFullImage(null)}
          onUseManualImagery={onUseManualImagery}
        />
      )}
    </div>
  )
}

function EvidenceImage({ label, image, onOpen, onUseManualImagery, emphasized = false }: {
  label: string
  image: DamageEvidenceImage | null
  onOpen: (image: DamageEvidenceImage) => void
  onUseManualImagery: () => void
  emphasized?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const displayUrl = useEvidenceImageUrl(image)
  const imageAvailable = Boolean(displayUrl) && !failed

  return (
    <div className={`overflow-hidden rounded-xl border bg-gradient-to-br ${emphasized ? "border-amber-400/20 from-amber-400/[0.08] to-slate-950" : "border-slate-700 from-slate-800/70 to-slate-950"}`}>
      <div className="grid min-h-48 place-items-center bg-slate-950/40">
        {imageAvailable ? (
          <button type="button" className="group relative h-56 w-full cursor-zoom-in" onClick={() => onOpen(image!)} aria-label={`Open full ${label.toLowerCase()}`}>
            {/* Remote Sentinel-2 imagery is proxied from backend memory and never stored in the repository. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl!} alt={`${label} from ${image!.source}`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-slate-950/80 px-2 py-1 text-[10px] text-slate-200 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ZoomIn className="size-3" aria-hidden="true" /> View full image
            </span>
          </button>
        ) : (
          <div className="p-4 text-center">
            <ImageIcon className={`mx-auto size-7 ${emphasized ? "text-amber-300" : "text-slate-500"}`} aria-hidden="true" />
            <p className="mt-3 text-xs font-semibold text-slate-200">Imagery unavailable</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">The image URL is missing, expired, or failed to load.</p>
            <button type="button" className="area-secondary-button mt-3" onClick={onUseManualImagery}>Use manual upload</button>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        <p className="mt-1 text-[10px] text-slate-400">Source: {image?.source ?? "Unavailable"}</p>
        <p className="mt-1 text-[10px] text-slate-500">Capture date: {image?.captureDate ?? "Not available"}</p>
        {image?.layerName && <p className="mt-1 truncate text-[10px] text-slate-600" title={image.layerName}>Layer: {image.layerName}</p>}
        {image?.cloudCoverage !== null && image?.cloudCoverage !== undefined && <p className="mt-1 text-[10px] text-slate-600">Cloud cover: {image.cloudCoverage.toFixed(1)}%</p>}
      </div>
    </div>
  )
}

function FullImageViewer({ label, image, bounds, onClose, onUseManualImagery }: {
  label: string
  image: DamageEvidenceImage
  bounds: DemoDamageAnalysisResult["bounds"]
  onClose: () => void
  onUseManualImagery: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [failed, setFailed] = useState(false)
  const displayUrl = useEvidenceImageUrl(image)
  const imageAvailable = Boolean(displayUrl) && !failed

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${label} full image viewer`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#080c13] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{Math.round(zoom * 100)}% zoom</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="area-secondary-button" onClick={() => setZoom((current) => Math.max(0.5, current - 0.25))} disabled={zoom <= 0.5} aria-label="Zoom out">
            <ZoomOut className="size-4" aria-hidden="true" />
          </button>
          <button type="button" className="area-secondary-button" onClick={() => setZoom((current) => Math.min(3, current + 0.25))} disabled={zoom >= 3} aria-label="Zoom in">
            <ZoomIn className="size-4" aria-hidden="true" />
          </button>
          <button type="button" className="area-secondary-button" onClick={() => setZoom(1)} aria-label="Reset zoom">
            <RotateCcw className="size-4" aria-hidden="true" /> Reset
          </button>
          <button type="button" className="area-secondary-button" onClick={onClose} aria-label="Close full image viewer">
            <X className="size-4" aria-hidden="true" /> Close
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {imageAvailable ? (
          <div className="flex min-h-full min-w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl!}
              alt={`${label} from ${image.source}`}
              className="max-h-[calc(100vh-13rem)] max-w-full object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          <div className="grid min-h-full place-items-center text-center">
            <div>
              <ImageIcon className="mx-auto size-10 text-slate-600" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold text-slate-200">Full image unavailable</p>
              <p className="mt-2 text-xs text-slate-500">The image URL is missing, expired, or failed to load.</p>
              <button type="button" className="area-secondary-button mt-4" onClick={onUseManualImagery}>Use manual upload</button>
            </div>
          </div>
        )}
      </div>

      <footer className="grid gap-2 border-t border-white/10 bg-[#080c13] px-4 py-3 text-[11px] text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        <p><strong className="text-slate-200">Source:</strong> {image.source}</p>
        <p><strong className="text-slate-200">Capture date:</strong> {image.captureDate ?? "Not available"}</p>
        <p className="truncate" title={image.layerName ?? undefined}><strong className="text-slate-200">Layer:</strong> {image.layerName ?? "Not available"}</p>
        <p><strong className="text-slate-200">Bounds:</strong> [{bounds.west}, {bounds.south}, {bounds.east}, {bounds.north}] {image.cloudCoverage !== null ? `· Cloud ${image.cloudCoverage.toFixed(1)}%` : ""}</p>
      </footer>
    </div>
  )
}

function useEvidenceImageUrl(image: DamageEvidenceImage | null) {
  const [displayUrl] = useState<string | null>(() => image?.imageFile
    ? URL.createObjectURL(image.imageFile)
    : image?.imageUrl ?? null)

  useEffect(() => () => {
    if (image?.imageFile && displayUrl) URL.revokeObjectURL(displayUrl)
  }, [displayUrl, image?.imageFile])

  return displayUrl
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <dt className="text-[9px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-1 text-xs font-semibold capitalize text-slate-200">{value}</dd>
    </div>
  )
}
