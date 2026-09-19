// Mock development data for the DisasterLens hackathon demonstration.
// None of the hazards, routes, statuses, or recommendations in this file are live.

export type Coordinates = [longitude: number, latitude: number]

export type ResponderMode =
  | "civilian"
  | "ambulance"
  | "firefighter"
  | "supply-vehicle"
  | "emergency-coordinator"

export type HazardType = "flooding" | "bridge-damage"
export type Severity = "LOW" | "MEDIUM" | "HIGH"

export type DestinationType =
  | "hospital"
  | "shelter"
  | "fire-station"
  | "police-station"
  | "emergency-room"
  | "custom"

export interface SelectedPlace {
  name: string
  address?: string
  longitude: number
  latitude: number
  category?: string
  source: "mapbox" | "mock"
  presetId?: string
  distanceMeters?: number
}

export interface Incident {
  name: string
  location: string
  center: Coordinates
  mapView: {
    zoom: number
    pitch: number
    bearing: number
  }
  updatedLabel: string
}

export interface LocationOption {
  id: string
  name: string
  kind: "start" | "destination" | "hospital" | "shelter"
  coordinates: Coordinates
}

export function locationOptionToSelectedPlace(
  location: LocationOption,
  category?: string,
): SelectedPlace {
  return {
    name: location.name,
    longitude: location.coordinates[0],
    latitude: location.coordinates[1],
    category,
    source: "mock",
    presetId: location.id,
  }
}

export interface Hazard {
  id: string
  name: string
  type: HazardType
  severity: Severity
  confidence: number
  detected: string
  source: string
  verification: string
  affected: string[]
  coordinates: Coordinates
  polygon: Coordinates[]
}

export interface Route {
  id: string
  name: string
  kind: "unsafe" | "safe"
  coordinates: Coordinates[]
}

export interface RouteRecommendation {
  role: ResponderMode
  routeName: string
  travelTime: string
  distance: string
  risk: Severity
  confidence: number
  priority: string
  explanation: string
}

export interface RouteAnalysisRequest {
  startingPoint: string
  destination: string
  responderType: ResponderMode
}

export interface RouteAnalysisResponse extends RouteAnalysisRequest {
  dataSource: "mock"
  recommendation: RouteRecommendation
  route: Route
}

export interface MapLayerVisibility {
  flooding: boolean
  bridgeDamage: boolean
  risk: boolean
  safeRoute: boolean
  hospitals: boolean
  shelters: boolean
  satellite: boolean
}

export interface ChangeEvent {
  id: string
  time: string
  title: string
  detail: string
  tone: "danger" | "warning" | "safe" | "info"
}

export interface LiveDataSource {
  id: string
  name: string
  status: "connected" | "delayed"
}

export const incident: Incident = {
  name: "Blacksburg Flood Response",
  location: "Blacksburg, Virginia",
  center: [-80.414, 37.226],
  mapView: {
    zoom: 13.4,
    pitch: 20,
    bearing: -8,
  },
  updatedLabel: "Updated 4 sec ago",
}

export const responderModes: Array<{
  id: ResponderMode
  label: string
  shortDescription: string
}> = [
  { id: "civilian", label: "Civilian", shortDescription: "Lowest hazard exposure" },
  { id: "ambulance", label: "Ambulance", shortDescription: "Hospital access and response time" },
  { id: "firefighter", label: "Firefighter", shortDescription: "Emergency vehicle access" },
  { id: "supply-vehicle", label: "Supply Vehicle", shortDescription: "Heavy vehicle clearance" },
  {
    id: "emergency-coordinator",
    label: "Emergency Coordinator",
    shortDescription: "Network-wide infrastructure risk",
  },
]

export const startingLocations: LocationOption[] = [
  {
    id: "blacksburg-fire-station",
    name: "Blacksburg Fire Station",
    kind: "start",
    coordinates: [-80.4202, 37.2306],
  },
  {
    id: "virginia-tech-rescue",
    name: "Virginia Tech Rescue Squad",
    kind: "start",
    coordinates: [-80.4247, 37.2246],
  },
]

export const destinations: LocationOption[] = [
  {
    id: "lewisgale-hospital",
    name: "LewisGale Hospital Montgomery",
    kind: "destination",
    coordinates: [-80.4093, 37.2107],
  },
  {
    id: "blacksburg-shelter",
    name: "Blacksburg Community Shelter",
    kind: "destination",
    coordinates: [-80.4015, 37.2226],
  },
]

export const hospitals: LocationOption[] = [destinations[0]]

export const shelters: LocationOption[] = [
  {
    id: "north-main-shelter",
    name: "North Main Emergency Shelter",
    kind: "shelter",
    coordinates: [-80.4146, 37.238],
  },
  {
    id: "blacksburg-shelter-marker",
    name: "Blacksburg Community Shelter",
    kind: "shelter",
    coordinates: [-80.4015, 37.2226],
  },
]

export const hazards: Hazard[] = [
  {
    id: "route-460-flooding",
    name: "Flooded Road",
    type: "flooding",
    severity: "HIGH",
    confidence: 94,
    detected: "18 sec ago",
    source: "Aerial imagery + weather feed",
    verification: "Awaiting operator verification",
    affected: ["Route 460", "Hospital access corridor"],
    coordinates: [-80.4138, 37.2202],
    polygon: [
      [-80.419, 37.2225],
      [-80.4148, 37.224],
      [-80.4088, 37.2208],
      [-80.4117, 37.2171],
      [-80.4184, 37.2183],
      [-80.419, 37.2225],
    ],
  },
  {
    id: "south-main-bridge-damage",
    name: "Bridge Damage",
    type: "bridge-damage",
    severity: "MEDIUM",
    confidence: 88,
    detected: "1 min ago",
    source: "Drone inspection imagery",
    verification: "Preliminary detection",
    affected: ["South Main Street bridge", "Heavy vehicle corridor"],
    coordinates: [-80.4064, 37.2169],
    polygon: [
      [-80.4078, 37.218],
      [-80.4053, 37.2177],
      [-80.405, 37.216],
      [-80.4074, 37.2158],
      [-80.4078, 37.218],
    ],
  },
]

export const routes: Route[] = [
  {
    id: "route-a",
    name: "Original Route A",
    kind: "unsafe",
    coordinates: [
      [-80.4202, 37.2306],
      [-80.4174, 37.2261],
      [-80.4138, 37.2202],
      [-80.4093, 37.2107],
    ],
  },
  {
    id: "route-b",
    name: "Recommended Route B",
    kind: "safe",
    coordinates: [
      [-80.4202, 37.2306],
      [-80.426, 37.226],
      [-80.425, 37.2165],
      [-80.417, 37.2118],
      [-80.4093, 37.2107],
    ],
  },
]

export const initialChangeEvents: ChangeEvent[] = [
  {
    id: "event-safe-route",
    time: "10:42:17",
    title: "Safer route calculated",
    detail: "Route B prepared for responder review",
    tone: "safe",
  },
  {
    id: "event-network",
    time: "10:42:16",
    title: "Road network updated",
    detail: "Affected corridor weights increased",
    tone: "info",
  },
  {
    id: "event-unsafe",
    time: "10:42:15",
    title: "Route 460 marked unsafe",
    detail: "Original route intersects flood extent",
    tone: "warning",
  },
  {
    id: "event-flood",
    time: "10:42:13",
    title: "Flooding detected",
    detail: "High-confidence simulated detection",
    tone: "danger",
  },
]

export const liveDataSources: LiveDataSource[] = [
  { id: "aerial", name: "Aerial Imagery", status: "connected" },
  { id: "weather", name: "Weather", status: "connected" },
  { id: "roads", name: "Road Network", status: "connected" },
  { id: "reports", name: "Emergency Reports", status: "connected" },
  { id: "satellite", name: "Satellite Imagery", status: "delayed" },
]

export const defaultMapLayers: MapLayerVisibility = {
  flooding: true,
  bridgeDamage: true,
  risk: true,
  safeRoute: true,
  hospitals: true,
  shelters: true,
  satellite: false,
}
