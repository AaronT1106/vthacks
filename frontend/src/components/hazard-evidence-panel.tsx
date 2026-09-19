"use client"

import { useEffect } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ImageIcon,
  RadioTower,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react"
import type { Hazard } from "@/src/data/mock-disaster-data"

interface HazardEvidencePanelProps {
  hazard: Hazard
  onClose: () => void
  onConfirm: (hazardId: string) => void
  onMarkFalsePositive: (hazardId: string) => void
}

export function HazardEvidencePanel({
  hazard,
  onClose,
  onConfirm,
  onMarkFalsePositive,
}: HazardEvidencePanelProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

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
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0c111b] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="section-label">Hazard evidence</p>
              <span className="mock-badge">Mock demo</span>
            </div>
            <h2 id="hazard-evidence-heading" className="mt-2 text-xl font-semibold text-white">
              {hazard.name}
            </h2>
            <p className="mt-1 text-xs capitalize text-slate-500">{hazard.type.replaceAll("-", " ")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200"
            aria-label="Close hazard evidence"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ImagePlaceholder label="Before image" description="Reference imagery placeholder" />
          <ImagePlaceholder label="After image" description="Post-event imagery placeholder" emphasized />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <EvidenceMetric label="Type" value={hazard.type.replaceAll("-", " ")} />
          <EvidenceMetric label="Severity" value={hazard.severity} />
          <EvidenceMetric label="Confidence" value={`${hazard.confidence}%`} />
          <EvidenceMetric label="Verification" value={hazard.verification} />
        </dl>

        <div className="mt-5 grid gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2">
          <div className="space-y-3 text-xs text-slate-400">
            <p className="flex items-start gap-2">
              <RadioTower className="mt-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden="true" />
              <span><strong className="text-slate-300">Source:</strong> {hazard.source}</span>
            </p>
            <p className="flex items-start gap-2">
              <Clock3 className="mt-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden="true" />
              <span><strong className="text-slate-300">Detected:</strong> {hazard.detected}</span>
            </p>
          </div>
          <div>
            <p className="section-label">Affected infrastructure</p>
            <ul className="mt-2 space-y-2">
              {hazard.affected.map((item) => (
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
          <p className="mt-2 text-xs leading-5 text-slate-300">{hazard.impact}</p>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="size-4 text-cyan-300" aria-hidden="true" />
            Human verification required · Local demo decision
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onConfirm(hazard.id)}
              className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Confirm hazard
            </button>
            <button
              type="button"
              onClick={() => onMarkFalsePositive(hazard.id)}
              className="flex items-center justify-center gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.07] px-4 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
            >
              <XCircle className="size-4" aria-hidden="true" />
              Mark false positive
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ImagePlaceholder({
  label,
  description,
  emphasized = false,
}: {
  label: string
  description: string
  emphasized?: boolean
}) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${description}`}
      className={`grid min-h-40 place-items-center rounded-xl border bg-gradient-to-br p-4 text-center ${
        emphasized
          ? "border-amber-400/20 from-amber-400/[0.08] to-slate-950"
          : "border-slate-700 from-slate-800/70 to-slate-950"
      }`}
    >
      <div>
        <ImageIcon className={`mx-auto size-7 ${emphasized ? "text-amber-300" : "text-slate-500"}`} aria-hidden="true" />
        <p className="mt-3 text-xs font-semibold text-slate-200">{label}</p>
        <p className="mt-1 text-[10px] text-slate-500">{description} · Mock data</p>
      </div>
    </div>
  )
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <dt className="text-[9px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-1 text-xs font-semibold capitalize text-slate-200">{value}</dd>
    </div>
  )
}
