"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle, MapPin, Search, X } from "lucide-react"
import {
  destinationTypeSearchTerm,
  findNearbyPlaces,
  retrievePlace,
  suggestPlaces,
  type PlaceSuggestion,
} from "@/src/lib/mapbox-place-search"
import type {
  Coordinates,
  DestinationType,
  SelectedPlace,
} from "@/src/data/mock-disaster-data"

interface PlaceSearchInputProps {
  id: string
  label: string
  placeholder: string
  accessToken: string
  proximity: Coordinates
  value: SelectedPlace | null
  onChange: (place: SelectedPlace | null) => void
  destinationType?: DestinationType
  showNearby?: boolean
}

function createSessionToken() {
  return crypto.randomUUID()
}

function formatDistance(distanceMeters?: number) {
  if (distanceMeters === undefined) return ""
  const miles = distanceMeters / 1609.344
  return miles < 0.1 ? "< 0.1 mi" : `${miles.toFixed(1)} mi`
}

export function PlaceSearchInput({
  id,
  label,
  placeholder,
  accessToken,
  proximity,
  value,
  onChange,
  destinationType,
  showNearby = false,
}: PlaceSearchInputProps) {
  const [inputValue, setInputValue] = useState(value?.name ?? "")
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [nearbyPlaces, setNearbyPlaces] = useState<SelectedPlace[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingNearby, setIsLoadingNearby] = useState(false)
  const [error, setError] = useState("")
  const [hasSearched, setHasSearched] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const sessionToken = useRef("")
  const searchRequest = useRef<AbortController | null>(null)
  const nearbyRequest = useRef<AbortController | null>(null)
  const proximityKey = proximity.join(",")

  useEffect(() => {
    const query = inputValue.trim()
    searchRequest.current?.abort()

    if (!accessToken || query.length < 2 || query === value?.name) {
      return
    }

    const timer = window.setTimeout(async () => {
      const controller = new AbortController()
      searchRequest.current = controller
      if (!sessionToken.current) sessionToken.current = createSessionToken()
      setIsSearching(true)
      setError("")

      try {
        const results = await suggestPlaces({
          query,
          accessToken,
          sessionToken: sessionToken.current,
          proximity,
          destinationType,
          signal: controller.signal,
        })
        if (searchRequest.current !== controller) return
        setSuggestions(results)
        setHasSearched(true)
        setIsOpen(true)
      } catch (searchError) {
        if (controller.signal.aborted || searchRequest.current !== controller) return
        setSuggestions([])
        setHasSearched(true)
        setError(searchError instanceof Error ? searchError.message : "Place search failed.")
        setIsOpen(true)
      } finally {
        if (searchRequest.current === controller) {
          searchRequest.current = null
          setIsSearching(false)
        }
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [accessToken, destinationType, inputValue, proximity, proximityKey, value?.name])

  useEffect(() => {
    nearbyRequest.current?.abort()
    if (!showNearby || !accessToken || !destinationType || destinationType === "custom") {
      return
    }

    const controller = new AbortController()
    nearbyRequest.current = controller

    void (async () => {
      setIsLoadingNearby(true)
      try {
        const places = await findNearbyPlaces({
          destinationType,
          accessToken,
          proximity,
          signal: controller.signal,
        })
        if (nearbyRequest.current === controller) setNearbyPlaces(places)
      } catch {
        if (!controller.signal.aborted && nearbyRequest.current === controller) setNearbyPlaces([])
      } finally {
        if (nearbyRequest.current === controller) {
          nearbyRequest.current = null
          setIsLoadingNearby(false)
        }
      }
    })()

    return () => controller.abort()
  }, [accessToken, destinationType, proximity, proximityKey, showNearby])

  useEffect(() => () => {
    searchRequest.current?.abort()
    nearbyRequest.current?.abort()
  }, [])

  async function selectSuggestion(suggestion: PlaceSuggestion) {
    searchRequest.current?.abort()
    const controller = new AbortController()
    searchRequest.current = controller
    setIsSearching(true)
    setError("")

    try {
      const selectedPlace = await retrievePlace({
        mapboxId: suggestion.mapboxId,
        accessToken,
        sessionToken: sessionToken.current || createSessionToken(),
        proximity,
        signal: controller.signal,
      })
      if (searchRequest.current !== controller) return
      onChange(selectedPlace)
      setInputValue(selectedPlace.name)
      setSuggestions([])
      setIsOpen(false)
      setHasSearched(false)
      sessionToken.current = ""
    } catch (searchError) {
      if (controller.signal.aborted || searchRequest.current !== controller) return
      setError(searchError instanceof Error ? searchError.message : "Could not select this place.")
      setIsOpen(true)
    } finally {
      if (searchRequest.current === controller) {
        searchRequest.current = null
        setIsSearching(false)
      }
    }
  }

  function selectNearbyPlace(place: SelectedPlace) {
    onChange(place)
    setInputValue(place.name)
    setSuggestions([])
    setIsOpen(false)
    setError("")
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue)
    setError("")
    setIsOpen(true)
    setActiveIndex(-1)
    if (nextValue.trim().length < 2) {
      searchRequest.current?.abort()
      setSuggestions([])
      setHasSearched(false)
      setIsSearching(false)
    }
    if (value) onChange(null)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      void selectSuggestion(suggestions[activeIndex])
    } else if (event.key === "Escape") {
      setIsOpen(false)
    }
  }

  const nearbyLabel = destinationType && destinationType !== "custom"
    ? `Nearby ${destinationTypeSearchTerm(destinationType)}s`
    : "Nearby places"

  return (
    <div className="space-y-2">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false)
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-3 size-3.5 text-slate-600" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          aria-expanded={isOpen}
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          className="field-control pl-9 pr-9"
          placeholder={placeholder}
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {isSearching ? (
          <LoaderCircle className="absolute right-3 top-3 size-3.5 animate-spin text-cyan-400" aria-label="Searching" />
        ) : inputValue ? (
          <button
            type="button"
            onClick={() => handleInputChange("")}
            className="absolute right-2 top-2 grid size-6 place-items-center rounded text-slate-600 hover:bg-white/5 hover:text-slate-300"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X className="size-3.5" />
          </button>
        ) : null}

        {isOpen && (suggestions.length > 0 || error || hasSearched) && (
          <div
            id={`${id}-results`}
            role="listbox"
            className="place-results-dropdown"
          >
            {suggestions.map((suggestion, index) => (
              <button
                id={`${id}-option-${index}`}
                key={suggestion.mapboxId}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={`place-result ${activeIndex === index ? "bg-cyan-400/10" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void selectSuggestion(suggestion)}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-cyan-400" aria-hidden="true" />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-xs font-medium text-slate-200">{suggestion.name}</span>
                  {(suggestion.address || suggestion.category) && (
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                      {[suggestion.category, suggestion.address].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {suggestion.distanceMeters !== undefined && (
                  <span className="ml-auto shrink-0 text-[9px] text-slate-600">
                    {formatDistance(suggestion.distanceMeters)}
                  </span>
                )}
              </button>
            ))}
            {error && <p className="px-3 py-3 text-[11px] leading-4 text-red-300">{error}</p>}
            {!error && hasSearched && suggestions.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-slate-500">No matching places found.</p>
            )}
          </div>
        )}
      </div>

      {showNearby && destinationType !== "custom" && !inputValue && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{nearbyLabel}</p>
            {isLoadingNearby && <LoaderCircle className="size-3 animate-spin text-slate-600" />}
          </div>
          {!isLoadingNearby && nearbyPlaces.length === 0 ? (
            <p className="px-1 py-1 text-[10px] text-slate-600">No nearby results available.</p>
          ) : (
            nearbyPlaces.map((place) => (
              <button
                key={`${place.longitude}-${place.latitude}-${place.name}`}
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-2 text-left hover:bg-white/[0.04]"
                onClick={() => selectNearbyPlace(place)}
              >
                <MapPin className="mt-0.5 size-3 shrink-0 text-slate-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-slate-300">{place.name}</span>
                  {place.address && <span className="mt-0.5 block truncate text-[9px] text-slate-600">{place.address}</span>}
                </span>
                {place.distanceMeters !== undefined && (
                  <span className="ml-auto shrink-0 text-[9px] text-slate-600">{formatDistance(place.distanceMeters)}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
