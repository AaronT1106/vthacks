import type {
  Coordinates,
  DestinationType,
  SelectedPlace,
} from "@/src/data/mock-disaster-data"

const SEARCH_BOX_BASE_URL = "https://api.mapbox.com/search/searchbox/v1"

export interface PlaceSuggestion {
  mapboxId: string
  name: string
  address?: string
  category?: string
  distanceMeters?: number
}

interface SearchBoxSuggestion {
  mapbox_id: string
  name: string
  full_address?: string
  place_formatted?: string
  address?: string
  poi_category?: string[]
  distance?: number
}

interface SearchBoxFeature {
  geometry?: {
    type: string
    coordinates?: number[]
  }
  properties?: {
    mapbox_id?: string
    name?: string
    full_address?: string
    place_formatted?: string
    address?: string
    feature_type?: string
    poi_category?: string[]
    distance?: number
  }
}

interface SuggestResponse {
  suggestions?: SearchBoxSuggestion[]
}

interface FeatureCollectionResponse {
  features?: SearchBoxFeature[]
}

const destinationSearchTerms: Record<Exclude<DestinationType, "custom">, string> = {
  hospital: "hospital",
  shelter: "emergency shelter",
  "fire-station": "fire station",
  "police-station": "police station",
  "emergency-room": "emergency room",
}

function buildSearchUrl(path: string, parameters: Record<string, string>) {
  const url = new URL(`${SEARCH_BOX_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

function formatProximity([longitude, latitude]: Coordinates) {
  return `${longitude},${latitude}`
}

function getAddress(item: {
  full_address?: string
  place_formatted?: string
  address?: string
}) {
  return item.full_address ?? item.place_formatted ?? item.address
}

function featureToSelectedPlace(feature: SearchBoxFeature): SelectedPlace | null {
  const coordinates = feature.geometry?.coordinates
  const properties = feature.properties
  if (!properties?.name || !coordinates || coordinates.length < 2) return null

  return {
    name: properties.name,
    address: getAddress(properties),
    longitude: coordinates[0],
    latitude: coordinates[1],
    category: properties.poi_category?.[0] ?? properties.feature_type,
    source: "mapbox",
    distanceMeters: properties.distance,
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? "Mapbox search is not authorized for this token."
      : "Mapbox place search is temporarily unavailable.")
  }
  return response.json() as Promise<T>
}

export async function suggestPlaces({
  query,
  accessToken,
  sessionToken,
  proximity,
  destinationType,
  signal,
}: {
  query: string
  accessToken: string
  sessionToken: string
  proximity: Coordinates
  destinationType?: DestinationType
  signal: AbortSignal
}): Promise<PlaceSuggestion[]> {
  const typeTerm = destinationType && destinationType !== "custom"
    ? destinationSearchTerms[destinationType]
    : ""
  const searchText = typeTerm && !query.toLowerCase().includes(typeTerm)
    ? `${query} ${typeTerm}`
    : query
  const url = buildSearchUrl("/suggest", {
    q: searchText,
    access_token: accessToken,
    session_token: sessionToken,
    proximity: formatProximity(proximity),
    country: "US",
    language: "en",
    limit: "6",
  })
  const response = await fetch(url, { signal })
  const data = await readJson<SuggestResponse>(response)

  return (data.suggestions ?? []).map((suggestion) => ({
    mapboxId: suggestion.mapbox_id,
    name: suggestion.name,
    address: getAddress(suggestion),
    category: suggestion.poi_category?.[0],
    distanceMeters: suggestion.distance,
  }))
}

export async function retrievePlace({
  mapboxId,
  accessToken,
  sessionToken,
  proximity,
  signal,
}: {
  mapboxId: string
  accessToken: string
  sessionToken: string
  proximity: Coordinates
  signal: AbortSignal
}): Promise<SelectedPlace> {
  const url = buildSearchUrl(`/retrieve/${encodeURIComponent(mapboxId)}`, {
    access_token: accessToken,
    session_token: sessionToken,
    proximity: formatProximity(proximity),
    language: "en",
  })
  const response = await fetch(url, { signal })
  const data = await readJson<FeatureCollectionResponse>(response)
  const selectedPlace = data.features?.[0] ? featureToSelectedPlace(data.features[0]) : null
  if (!selectedPlace) throw new Error("Mapbox did not return coordinates for this place.")
  return selectedPlace
}

export async function findNearbyPlaces({
  destinationType,
  accessToken,
  proximity,
  signal,
}: {
  destinationType: Exclude<DestinationType, "custom">
  accessToken: string
  proximity: Coordinates
  signal: AbortSignal
}): Promise<SelectedPlace[]> {
  const url = buildSearchUrl("/forward", {
    q: destinationSearchTerms[destinationType],
    access_token: accessToken,
    proximity: formatProximity(proximity),
    country: "US",
    language: "en",
    types: "poi",
    limit: "4",
  })
  const response = await fetch(url, { signal })
  const data = await readJson<FeatureCollectionResponse>(response)
  return (data.features ?? [])
    .map(featureToSelectedPlace)
    .filter((place): place is SelectedPlace => place !== null)
}

export function destinationTypeSearchTerm(destinationType: DestinationType) {
  return destinationType === "custom" ? "place or address" : destinationSearchTerms[destinationType]
}
