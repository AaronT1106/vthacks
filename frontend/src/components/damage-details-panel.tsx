import { AlertTriangle, CheckCircle2, Clock3, RadioTower, Waves } from "lucide-react"
import type { Hazard } from "@/src/data/mock-disaster-data"

interface DamageDetailsPanelProps {
  hazard: Hazard
}

export function DamageDetailsPanel({ hazard }: DamageDetailsPanelProps) {
  const isFlooding = hazard.type === "flooding"

  return (
    <section className="panel-section" aria-labelledby="hazard-heading">
      <div className="section-heading-row">
        <h2 id="hazard-heading" className="section-label">Detected hazard</h2>
        <span className="mock-badge">Mock data</span>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div
          className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
            isFlooding
              ? "border-red-500/25 bg-red-500/10 text-red-400"
              : "border-amber-500/25 bg-amber-500/10 text-amber-400"
          }`}
        >
          {isFlooding ? <Waves className="size-4" /> : <AlertTriangle className="size-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{hazard.name}</h3>
          <p className="mt-1 text-[11px] text-slate-500">{hazard.verification}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Detail label="Severity" value={hazard.severity} tone={hazard.severity === "HIGH" ? "text-red-400" : "text-amber-400"} />
        <Detail label="Confidence" value={`${hazard.confidence}%`} tone="text-slate-100" />
      </dl>

      <div className="mt-4 space-y-2 text-[11px] text-slate-400">
        <p className="flex items-center gap-2">
          <Clock3 className="size-3.5 text-slate-600" aria-hidden="true" />
          Detected {hazard.detected}
        </p>
        <p className="flex items-center gap-2">
          <RadioTower className="size-3.5 text-slate-600" aria-hidden="true" />
          {hazard.source}
        </p>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Affected</p>
        <ul className="mt-2 space-y-2">
          {hazard.affected.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="size-3 text-amber-400" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Detail({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
      <dt className="text-[10px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className={`mt-1 text-xs font-semibold ${tone}`}>{value}</dd>
    </div>
  )
}
