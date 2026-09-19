"use client"

import { ArrowLeft, Check, Radar } from "lucide-react"
import { motion } from "framer-motion"
import type { DisasterImagery } from "@/src/components/disaster-imagery-step"
import { WorkflowProgress } from "@/src/components/workflow-progress"
import type { DisasterAreaBounds, SelectedPlace } from "@/src/data/mock-disaster-data"

export function DisasterAnalysisStep({
  bounds,
  place,
  imagery,
  onBack,
}: {
  bounds: DisasterAreaBounds
  place: SelectedPlace | null
  imagery: DisasterImagery
  onBack: () => void
}) {
  const readiness = [
    ["Area ready", bounds.east > bounds.west && bounds.north > bounds.south],
    ["Before image ready", Boolean(imagery.beforeImage)],
    ["After image ready", Boolean(imagery.afterImage)],
  ] as const

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

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="area-secondary-button" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to imagery
          </button>
          <div className="text-right">
            <button type="button" className="area-primary-button" disabled>Analyze damage</button>
            <p className="mt-2 text-[10px] text-slate-600">Damage analysis is not implemented yet.</p>
          </div>
        </div>
      </div>
    </motion.main>
  )
}
