import { Radio } from "lucide-react"
import { liveDataSources } from "@/src/data/mock-disaster-data"

export function LiveDataSources() {
  return (
    <section className="panel-section" aria-labelledby="live-data-heading">
      <div className="section-heading-row">
        <h2 id="live-data-heading" className="section-label">Live data sources</h2>
        <Radio className="size-3.5 text-emerald-400" aria-hidden="true" />
      </div>
      <div className="mt-3 space-y-2.5">
        {liveDataSources.map((source) => (
          <div key={source.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-slate-300">
              <span
                className={`size-1.5 rounded-full ${
                  source.status === "connected" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {source.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-600">{source.status}</span>
          </div>
        ))}
      </div>
      <p className="mock-caption mt-3">Mock connection status</p>
    </section>
  )
}
