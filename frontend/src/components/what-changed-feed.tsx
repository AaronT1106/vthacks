import { AnimatePresence, motion } from "framer-motion"
import { History } from "lucide-react"
import type { ChangeEvent } from "@/src/data/mock-disaster-data"

interface WhatChangedFeedProps {
  events: ChangeEvent[]
}

const eventTone: Record<ChangeEvent["tone"], string> = {
  danger: "bg-red-400",
  warning: "bg-amber-400",
  safe: "bg-emerald-400",
  info: "bg-cyan-400",
}

export function WhatChangedFeed({ events }: WhatChangedFeedProps) {
  return (
    <section className="panel-section" aria-labelledby="changes-heading">
      <div className="section-heading-row">
        <h2 id="changes-heading" className="section-label">What changed</h2>
        <History className="size-3.5 text-slate-600" aria-hidden="true" />
      </div>
      <div className="mt-4 space-y-0">
        <AnimatePresence initial={false}>
          {events.slice(0, 5).map((event, index) => (
            <motion.article
              key={event.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22 }}
              className="relative grid grid-cols-[48px_12px_1fr] gap-2 pb-4 last:pb-0"
            >
              <time className="pt-0.5 font-mono text-[10px] text-slate-600">{event.time}</time>
              <div className="relative flex justify-center">
                {index < Math.min(events.length, 5) - 1 && (
                  <span className="absolute top-2 h-[calc(100%+8px)] w-px bg-slate-800" />
                )}
                <span className={`relative mt-1 size-2 rounded-full ring-4 ring-[#0c111b] ${eventTone[event.tone]}`} />
              </div>
              <div>
                <h3 className="text-xs font-medium text-slate-200">{event.title}</h3>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{event.detail}</p>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
      <p className="mock-caption mt-4">Simulated operational timeline</p>
    </section>
  )
}
