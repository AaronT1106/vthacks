import { motion } from "framer-motion"
import { AlertTriangle, Check, Clock3, Eye, Gauge, MapPinned, Navigation, ShieldCheck } from "lucide-react"
import { responderModes, type Route, type RouteRecommendation } from "@/src/data/mock-disaster-data"

interface RouteRecommendationPanelProps {
  status: "idle" | "analyzing" | "complete" | "error"
  recommendation: RouteRecommendation | null
  route: Route | null
  error: string
  onViewEvidence?: () => void
}

export function RouteRecommendationPanel({
  status,
  recommendation,
  route,
  error,
  onViewEvidence,
}: RouteRecommendationPanelProps) {
  if (status === "error") {
    return (
      <section className="panel-section flex min-h-48 flex-col justify-center text-center" role="alert">
        <h2 className="text-sm font-medium text-amber-200">Route analysis unavailable</h2>
        <p className="mt-2 text-xs leading-5 text-slate-400">{error}</p>
        <p className="mt-3 text-xs text-slate-500">Use Analyze route to retry.</p>
      </section>
    )
  }
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
        <h2 className="text-sm font-medium text-slate-200">Calculating road-network route</h2>
        <p className="mt-2 text-xs text-slate-500">Waiting for the local route-analysis service…</p>
      </section>
    )
  }

  if (!recommendation) return null

  const hazardsAvoided = Array.isArray(recommendation.hazardsAvoided)
    ? recommendation.hazardsAvoided
    : []
  const risk = ["LOW", "MEDIUM", "HIGH"].includes(recommendation.risk)
    ? recommendation.risk
    : "MEDIUM"
  const alternative = recommendation.alternative ?? {
    routeName: "Alternative unavailable",
    risk: "HIGH" as const,
    rejectionReason: "The route-analysis response did not include an alternative route.",
  }
  const responderLabel = responderModes.find((mode) => mode.id === recommendation.role)?.label ?? "Responder"
  const googleMapsUrl = route ? createGoogleMapsDirectionsUrl(route) : null

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
        <span className={`status-pill ${risk === "LOW" ? "status-safe" : "text-amber-300"}`}>{risk.toLowerCase()} risk</span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-cyan-300">{responderLabel} route</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{recommendation.routeName}</p>
          <p className="mt-1 text-[11px] text-slate-400">To {recommendation.recommendedDestination}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="mock-badge">OSM roads · demo hazards</span>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-300"
              title="Open this route in Google Maps"
            >
              Go <Navigation className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
        <Metric icon={Clock3} label="Travel time" value={recommendation.travelTime} />
        <Metric icon={MapPinned} label="Distance" value={recommendation.distance} />
        <Metric icon={Gauge} label="Risk" value={risk} />
        <Metric icon={ShieldCheck} label="Confidence" value={`${recommendation.confidence}%`} />
      </div>

      <div className="mt-5 border-t border-slate-800 pt-4">
        <p className="section-label">Why this route?</p>
        <p className="mt-3 text-xs leading-5 text-slate-300">{recommendation.explanation}</p>
        <p className="mt-3 text-[11px] font-medium text-cyan-300">Priority: {recommendation.priority}</p>
      </div>

      {recommendation.warning && (
        <div className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-200" role="status">
          {recommendation.warning}
        </div>
      )}

      <div className="mt-5 border-t border-slate-800 pt-4">
        <p className="section-label">Hazards avoided</p>
        <ul className="mt-3 space-y-2">
          {hazardsAvoided.map((hazard) => (
            <li key={hazard} className="flex items-center gap-2 text-xs text-emerald-300">
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
              {hazard}
            </li>
          ))}
          {hazardsAvoided.length === 0 && (
            <li className="text-xs text-slate-500">No avoided hazards were provided.</li>
          )}
        </ul>
      </div>

      {onViewEvidence && (
        <button type="button" onClick={onViewEvidence} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] px-3 py-2 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-400/10">
          <Eye className="size-3.5" aria-hidden="true" /> View Evidence
        </button>
      )}

      <div className="mt-5 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <AlertTriangle className="size-3.5 text-amber-300" aria-hidden="true" />
            Alternative: {alternative.routeName}
          </p>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            {alternative.risk} risk
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-400">
          {alternative.rejectionReason}
        </p>
      </div>
    </motion.section>
  )
}

function createGoogleMapsDirectionsUrl(route: Route) {
  const coordinates = route.geometry.coordinates
  const origin = coordinates[0]
  const destination = coordinates.at(-1)
  if (!origin || !destination) return null

  // Google Maps URLs support at most three waypoints on mobile browsers. Sampling
  // three interior road-route points keeps the handoff cross-platform and under the
  // documented URL-length limit while allowing Google Maps to recalculate navigation.
  const waypointIndexes = Array.from({ length: 3 }, (_, index) => (
    Math.round(((index + 1) * (coordinates.length - 1)) / 4)
  )).filter((index, position, indexes) => (
    index > 0 && index < coordinates.length - 1 && indexes.indexOf(index) === position
  ))
  const formatCoordinate = ([longitude, latitude]: [number, number]) => `${latitude},${longitude}`
  const parameters = new URLSearchParams({
    api: "1",
    origin: formatCoordinate(origin),
    destination: formatCoordinate(destination),
    travelmode: "driving",
    dir_action: "navigate",
  })
  if (waypointIndexes.length > 0) {
    parameters.set("waypoints", waypointIndexes.map((index) => formatCoordinate(coordinates[index])).join("|"))
  }
  return `https://www.google.com/maps/dir/?${parameters.toString()}`
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
