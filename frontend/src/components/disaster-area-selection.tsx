"use client"

import { useMemo, useState } from "react"
import { ArrowRight, BoxSelect, Radar, Trash2 } from "lucide-react"
import { motion } from "framer-motion"
import { DisasterAreaSelectionMap } from "@/src/components/disaster-area-selection-map"
import { PlaceSearchInput } from "@/src/components/place-search-input"
import {
  incident,
  type Coordinates,
  type DisasterAreaBounds,
  type SelectedPlace,
} from "@/src/data/mock-disaster-data"

interface DisasterAreaSelectionProps {
  bounds: DisasterAreaBounds | null
  onBoundsChange: (bounds: DisasterAreaBounds | null) => void
  onConfirm: () => void
}

const steps = ["Area", "Imagery", "Analysis", "Route"]

export function DisasterAreaSelection({ bounds, onBoundsChange, onConfirm }: DisasterAreaSelectionProps) {
  const [searchPlace, setSearchPlace] = useState<SelectedPlace | null>(null)
  const [selectionEnabled, setSelectionEnabled] = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""
  const proximity = useMemo<Coordinates>(() => searchPlace
    ? [searchPlace.longitude, searchPlace.latitude]
    : incident.center,
  [searchPlace])
  const hasValidBounds = Boolean(bounds && bounds.east > bounds.west && bounds.north > bounds.south)

  return (
    <motion.main
      className="min-h-screen bg-[#05080e] text-slate-100"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <header className="border-b border-white/[0.07] bg-[#080c13]">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <Radar className="size-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-white">DisasterLens</span>
          </div>
          <ol className="hidden items-center gap-2 sm:flex" aria-label="Workflow progress">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-2 text-[11px]">
                <span className={index === 0 ? "text-cyan-300" : "text-slate-600"}>{index + 1}. {step}</span>
                {index < steps.length - 1 && <span className="h-px w-5 bg-slate-800" />}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1440px] flex-col px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <div className="mb-6 max-w-2xl">
          <p className="mb-3 text-xs font-medium text-cyan-300">Select disaster area</p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">Where should we analyze?</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Select the area affected by the disaster. This region will be used for imagery analysis and hazard mapping.
          </p>
        </div>

        <div className="mb-4 grid items-end gap-3 lg:grid-cols-[minmax(280px,460px)_auto]">
          {mapboxToken ? (
            <PlaceSearchInput
              id="disaster-area-search"
              label="Location search"
              placeholder="Search city, address, or area..."
              accessToken={mapboxToken}
              proximity={proximity}
              value={searchPlace}
              onChange={setSearchPlace}
            />
          ) : (
            <div className="space-y-2">
              <label className="field-label" htmlFor="disaster-area-search">Location search</label>
              <input
                id="disaster-area-search"
                className="field-control disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Search city, address, or area..."
                disabled
              />
              <p className="text-[10px] text-slate-500">Live location search requires Mapbox. You can still draw a demo area below.</p>
            </div>
          )}
          <button
            type="button"
            className={`area-secondary-button ${selectionEnabled ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : ""}`}
            onClick={() => setSelectionEnabled((current) => !current)}
            aria-pressed={selectionEnabled}
          >
            <BoxSelect className="size-4" />
            {selectionEnabled ? "Cancel drawing" : bounds ? "Redraw area" : "Select disaster area"}
          </button>
        </div>

        <DisasterAreaSelectionMap
          bounds={bounds}
          focusPlace={searchPlace}
          selectionEnabled={selectionEnabled}
          onBoundsChange={onBoundsChange}
          onSelectionComplete={() => setSelectionEnabled(false)}
        />

        <div className="mt-4 flex flex-col gap-4 border-t border-white/[0.07] pt-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Selected area</p>
            {bounds ? (
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-400">
                <p><span className="mr-2 text-slate-600">Northwest</span>{bounds.north.toFixed(4)}, {bounds.west.toFixed(4)}</p>
                <p><span className="mr-2 text-slate-600">Southeast</span>{bounds.south.toFixed(4)}, {bounds.east.toFixed(4)}</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-600">Draw a rectangle on the map to define the analysis region.</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="area-secondary-button"
              disabled={!bounds}
              onClick={() => {
                onBoundsChange(null)
                setSelectionEnabled(false)
              }}
            >
              <Trash2 className="size-4" /> Clear selection
            </button>
            <button
              type="button"
              className="area-primary-button"
              disabled={!hasValidBounds}
              onClick={onConfirm}
            >
              Confirm area <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.main>
  )
}
