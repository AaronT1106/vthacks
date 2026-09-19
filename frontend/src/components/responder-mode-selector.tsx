import { responderModes, type ResponderMode } from "@/src/data/mock-disaster-data"

interface ResponderModeSelectorProps {
  value: ResponderMode
  onChange: (mode: ResponderMode) => void
}

export function ResponderModeSelector({ value, onChange }: ResponderModeSelectorProps) {
  const selectedMode = responderModes.find((mode) => mode.id === value)

  return (
    <div className="space-y-2">
      <label className="field-label" htmlFor="responder-mode">
        Responder type
      </label>
      <select
        id="responder-mode"
        className="field-control"
        value={value}
        onChange={(event) => onChange(event.target.value as ResponderMode)}
      >
        {responderModes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.label}
          </option>
        ))}
      </select>
      <p className="text-[11px] leading-4 text-slate-500">{selectedMode?.shortDescription}</p>
    </div>
  )
}
