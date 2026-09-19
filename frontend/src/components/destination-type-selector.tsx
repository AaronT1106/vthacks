import type { DestinationType } from "@/src/data/mock-disaster-data"

interface DestinationTypeSelectorProps {
  value: DestinationType
  onChange: (destinationType: DestinationType) => void
}

const destinationTypes: Array<{ value: DestinationType; label: string }> = [
  { value: "hospital", label: "Hospital" },
  { value: "shelter", label: "Shelter" },
  { value: "fire-station", label: "Fire Station" },
  { value: "police-station", label: "Police Station" },
  { value: "emergency-room", label: "Emergency Room" },
  { value: "custom", label: "Custom" },
]

export function DestinationTypeSelector({ value, onChange }: DestinationTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="field-label" htmlFor="destination-type">Destination type</label>
      <select
        id="destination-type"
        className="field-control"
        value={value}
        onChange={(event) => onChange(event.target.value as DestinationType)}
      >
        {destinationTypes.map((destinationType) => (
          <option key={destinationType.value} value={destinationType.value}>
            {destinationType.label}
          </option>
        ))}
      </select>
    </div>
  )
}
