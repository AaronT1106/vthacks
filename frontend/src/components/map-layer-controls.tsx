import {
  Activity,
  Building2,
  CloudRain,
  Flame,
  Route,
  Satellite,
  TentTree,
  type LucideIcon,
} from "lucide-react"
import type { MapLayerVisibility } from "@/src/data/mock-disaster-data"

interface MapLayerControlsProps {
  layers: MapLayerVisibility
  onToggle: (layer: keyof MapLayerVisibility) => void
  showFloodAnalysis: boolean
  showActiveFire: boolean
}

const layerOptions: Array<{
  id: keyof MapLayerVisibility
  label: string
  icon: LucideIcon
  tone: string
}> = [
  { id: "risk", label: "Risk", icon: Activity, tone: "text-orange-400" },
  { id: "floodAnalysis", label: "Flood / water", icon: CloudRain, tone: "text-cyan-400" },
  { id: "activeFire", label: "Active fire", icon: Flame, tone: "text-orange-400" },
  { id: "hospitals", label: "Hospitals", icon: Building2, tone: "text-sky-400" },
  { id: "shelters", label: "Shelters", icon: TentTree, tone: "text-emerald-400" },
  { id: "safeRoute", label: "Safe Route", icon: Route, tone: "text-cyan-400" },
  { id: "satellite", label: "Satellite", icon: Satellite, tone: "text-violet-400" },
]

export function MapLayerControls({
  layers,
  onToggle,
  showFloodAnalysis,
  showActiveFire,
}: MapLayerControlsProps) {
  const visibleOptions = layerOptions.filter(({ id }) => (
    (id !== "floodAnalysis" || showFloodAnalysis)
    && (id !== "activeFire" || showActiveFire)
  ))

  return (
    <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-1">
      {visibleOptions.map(({ id, label, icon: Icon, tone }) => (
        <label
          key={id}
          className="group flex min-h-9 cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
        >
          <span className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
            <Icon className={`size-3.5 shrink-0 ${tone}`} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </span>
          <input
            type="checkbox"
            className="layer-checkbox"
            checked={layers[id]}
            onChange={() => onToggle(id)}
          />
        </label>
      ))}
    </div>
  )
}
