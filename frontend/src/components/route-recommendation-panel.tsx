import { motion } from "framer-motion"
import { Clock3, Gauge, MapPinned, ShieldCheck } from "lucide-react"
import type { RouteRecommendation } from "@/src/data/mock-disaster-data"

interface RouteRecommendationPanelProps {
  status: "idle" | "analyzing" | "complete"
  recommendation: RouteRecommendation
}

export function RouteRecommendationPanel({
  status,
  recommendation,
}: RouteRecommendationPanelProps) {
  if (status === "idle") {
    return (
      <section className="panel-section flex min-h-48 flex-col items-center justify-center text-center">
        <div className="mb-4 grid size-10 place-items-center rounded-xl border border-slate-700 bg-slate-900">
          <MapPinned className="size-4 text-slate-400" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-medium text-slate-200">Route analysis ready</h2>
        <p className="mt-2 max-w-56 text-xs leading-5 text-slate-500">
          Select a route and responder type to begin analysis.
        </p>
      </section>
    )
  }

  if (status === "analyzing") {
    return (
      <section className="panel-section flex min-h-48 flex-col items-center justify-center text-center" aria-live="polite">
        <div className="analysis-spinner mb-4" />
        <h2 className="text-sm font-medium text-slate-200">Analyzing route network</h2>
        <p className="mt-2 text-xs text-slate-500">Comparing simulated hazards and access constraints…</p>
      </section>
    )
  }

  return (
    <motion.section
      className="panel-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      aria-live="polite"
    >
      <div className="section-heading-row">
        <h2 className="section-label">Current recommendation</h2>
        <span className="status-pill status-safe">Low risk</span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Safest route</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{recommendation.routeName}</p>
        </div>
        <span className="mock-badge">Mock data</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
        <Metric icon={Clock3} label="Travel time" value={recommendation.travelTime} />
        <Metric icon={MapPinned} label="Distance" value={recommendation.distance} />
        <Metric icon={Gauge} label="Risk" value={recommendation.risk} />
        <Metric icon={ShieldCheck} label="Confidence" value={`${recommendation.confidence}%`} />
      </div>

      <div className="mt-5 border-t border-slate-800 pt-4">
        <p className="section-label">Why this route?</p>
        <p className="mt-3 text-xs leading-5 text-slate-300">{recommendation.explanation}</p>
        <p className="mt-3 text-[11px] font-medium text-cyan-300">Priority: {recommendation.priority}</p>
      </div>
    </motion.section>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3
  label: string
  value: string
}) {
  return (
    <div className="bg-[#0c111b] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  )
}
