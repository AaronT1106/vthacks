"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ImagePlus, Radar, RefreshCw, Satellite, Trash2, Upload } from "lucide-react"
import { motion } from "framer-motion"
import { WorkflowProgress } from "@/src/components/workflow-progress"
import { fetchSatelliteImagery, getComparisonValidationFailure, isValidComparisonPair, type SatelliteImageMetadata } from "@/src/lib/satellite-imagery"
import type { DisasterAreaBounds, SelectedPlace } from "@/src/data/mock-disaster-data"

export interface DisasterImagery {
  satellite: {
    beforeImage: SatelliteImageMetadata
    afterImage: SatelliteImageMetadata
  } | null
  manual: {
    beforeImage: File | null
    afterImage: File | null
  }
}

interface DisasterImageryStepProps {
  bounds: DisasterAreaBounds
  place: SelectedPlace | null
  imagery: DisasterImagery
  onImageryChange: (imagery: DisasterImagery) => void
  onBack: () => void
  onContinue: () => void
}

const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"])
const supportedExtensions = [".png", ".jpg", ".jpeg", ".webp"]
const fileTypeError = "Please select a PNG, JPG, JPEG, or WEBP image."

function isSupportedImage(file: File) {
  if (supportedMimeTypes.has(file.type)) return true
  return file.type === "" && supportedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))
}

function isLocalFile(image: File | SatelliteImageMetadata): image is File {
  return image instanceof File
}

function LocalImagePreview({ file, title, onError }: { file: File; title: string; onError: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    // A blob URL is required for a local, unuploaded browser File preview.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${title} preview`} className="h-full w-full object-contain" onError={onError} />
  )
}

function ImageUploadPanel({
  id,
  title,
  description,
  image,
  onImageChange,
  satelliteReadOnly = false,
  onProviderFailure,
}: {
  id: string
  title: string
  description: string
  image: File | SatelliteImageMetadata | null
  onImageChange: (image: File | SatelliteImageMetadata | null) => void
  satelliteReadOnly?: boolean
  onProviderFailure?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const pendingUrl = useRef<string | null>(null)
  const pendingImage = useRef<HTMLImageElement | null>(null)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => {
    if (pendingImage.current) {
      pendingImage.current.onload = null
      pendingImage.current.onerror = null
    }
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
  }, [])

  function clearPendingPreview() {
    if (pendingImage.current) {
      pendingImage.current.onload = null
      pendingImage.current.onerror = null
      pendingImage.current = null
    }
    if (pendingUrl.current) {
      URL.revokeObjectURL(pendingUrl.current)
      pendingUrl.current = null
    }
  }

  function validateAndDecode(nextFile: File | undefined) {
    if (!nextFile) return
    if (!isSupportedImage(nextFile)) {
      setError(fileTypeError)
      return
    }

    clearPendingPreview()
    const nextUrl = URL.createObjectURL(nextFile)
    const image = new window.Image()
    pendingUrl.current = nextUrl
    pendingImage.current = image
    image.onload = () => {
      clearPendingPreview()
      setError("")
      onImageChange(nextFile)
    }
    image.onerror = () => {
      clearPendingPreview()
      setError("This image could not be previewed. Please choose another file.")
    }
    image.src = nextUrl
  }

  async function reportRemoteImageError(imageUrl: string) {
    const genericMessage = "Sentinel-2 could not display this scene. Try another date or use manual upload."
    if (process.env.NODE_ENV !== "development") {
      setError(genericMessage)
      onProviderFailure?.()
      return
    }
    try {
      const response = await fetch(imageUrl, { cache: "no-store" })
      const contentType = response.headers.get("content-type") ?? "unknown content type"
      if (response.ok) {
        setError(`Preview returned HTTP ${response.status} (${contentType}), but the browser could not decode the image.`)
      } else {
        const payload = await response.json().catch(() => null) as { detail?: unknown } | null
        const detail = typeof payload?.detail === "string" && payload.detail.length <= 200
          ? ` — ${payload.detail}`
          : ""
        setError(`Preview request failed with HTTP ${response.status}${detail}`)
      }
    } catch {
      setError("Preview request could not reach the local proxy or backend.")
    }
    onProviderFailure?.()
  }

  return (
    <section
      className={`rounded-xl border bg-[#0c111b] p-4 transition-colors sm:p-5 ${dragging ? "border-cyan-400/60" : "border-slate-800"}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        validateAndDecode(event.dataTransfer.files[0])
      }}
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>

      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        aria-describedby={`${id}-help ${id}-error`}
        onChange={(event) => {
          validateAndDecode(event.currentTarget.files?.[0])
          event.currentTarget.value = ""
        }}
      />

      {image ? (
        <div>
          <div className="grid h-64 place-items-center overflow-hidden rounded-lg border border-slate-800 bg-[#070b12] sm:h-72">
            {isLocalFile(image) ? (
              <LocalImagePreview
                key={`${image.name}-${image.size}-${image.lastModified}-${image.type}`}
                file={image}
                title={title}
                onError={() => {
                  setError("This image could not be previewed. Please choose another file.")
                  onImageChange(null)
                }}
              />
            ) : image.imageUrl ? (
              // Sentinel-2 previews are served from backend memory and never stored in this repository.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.imageUrl}
                alt={`${title} Sentinel-2 imagery`}
                className="h-full w-full object-contain"
                onLoad={() => setError("")}
                onError={() => void reportRemoteImageError(image.imageUrl!)}
              />
            ) : (
              <div className="px-6 text-center">
                <Satellite className="mx-auto size-8 text-cyan-400/70" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-slate-300">Preview unavailable</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">Provider metadata is available. Upload a local image if visual review is required.</p>
              </div>
            )}
          </div>
          {isLocalFile(image) ? (
            <p className="mt-3 truncate text-xs text-slate-300" title={image.name}>{image.name}</p>
          ) : (
            <div className="mt-3 space-y-1 text-[11px] text-slate-400">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-medium text-slate-200" title={image.source}>{image.source}</p>
                <span className={image.dataMode === "live" ? "live-badge" : "mock-badge"}>
                  {image.dataMode === "live" ? "Live provider" : "Demo data"}
                </span>
              </div>
              <p>Requested date: {image.requestedDate}</p>
              <p>Captured: {new Date(image.captureDate).toLocaleString()}</p>
              <p className="truncate" title={image.id}>Scene ID: {image.id}</p>
              <p>Cloud cover: {image.cloudCoverage.toFixed(1)}%</p>
              <p>Candidate scenes checked: {image.candidateCount}</p>
              {image.selectionStatus === "higher-cloud-option" && (
                <p className="font-medium text-amber-300">Higher cloud cover — verification limited.</p>
              )}
              <p className="truncate" title={image.layerName}>Layer: {image.layerName}</p>
            </div>
          )}
          {!satelliteReadOnly && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="area-secondary-button" onClick={() => input.current?.click()}>
                <Upload className="size-4" aria-hidden="true" /> Replace
              </button>
              <button
                type="button"
                className="area-secondary-button"
                onClick={() => {
                  setError("")
                  onImageChange(null)
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" /> Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-[#070b12] px-5 text-center transition-colors hover:border-slate-600 sm:min-h-72"
        >
          <ImagePlus className="mb-3 size-6 text-slate-500" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-200">Upload image</span>
          <span id={`${id}-help`} className="mt-2 text-[11px] leading-5 text-slate-600">
            PNG, JPG, or WEBP. You can also drag an image here.
          </span>
        </label>
      )}

      <p id={`${id}-error`} className="mt-3 min-h-4 text-xs text-red-300" role={error ? "alert" : undefined}>
        {error}
      </p>
    </section>
  )
}

export function DisasterImageryStep({
  bounds,
  place,
  imagery,
  onImageryChange,
  onBack,
  onContinue,
}: DisasterImageryStepProps) {
  const [beforeDate, setBeforeDate] = useState("")
  const [afterDate, setAfterDate] = useState("")
  const [fetching, setFetching] = useState(false)
  const [fetchMessage, setFetchMessage] = useState("")
  const [fetchError, setFetchError] = useState("")
  const [pendingSatellite, setPendingSatellite] = useState<DisasterImagery["satellite"]>(null)
  const [beforeCandidates, setBeforeCandidates] = useState<SatelliteImageMetadata[]>([])
  const [afterCandidates, setAfterCandidates] = useState<SatelliteImageMetadata[]>([])
  const [showManualUpload, setShowManualUpload] = useState(Boolean(
    imagery.manual.beforeImage || imagery.manual.afterImage,
  ))
  const validBounds = bounds.east > bounds.west && bounds.north > bounds.south
  const manualPairReady = Boolean(imagery.manual.beforeImage && imagery.manual.afterImage)
  const canContinue = validBounds

  function updateManualImage(position: "before" | "after", image: File | SatelliteImageMetadata | null) {
    if (image && !isLocalFile(image)) return
    onImageryChange({
      ...imagery,
      manual: {
        beforeImage: position === "before" ? image : imagery.manual.beforeImage,
        afterImage: position === "after" ? image : imagery.manual.afterImage,
      },
    })
  }

  async function retrieveAvailableImagery() {
    if (!validBounds || fetching) return
    if (!beforeDate || !afterDate) {
      setFetchError("Choose both a Before date and an After date.")
      return
    }
    setFetching(true)
    setFetchError("")
    setFetchMessage("")
    try {
      const result = await fetchSatelliteImagery({ bounds, beforeDate, afterDate })
      if (!result.before || !result.after || !result.comparisonReady || !isValidComparisonPair(result.before, result.after)) {
        setPendingSatellite(null)
        setBeforeCandidates([])
        setAfterCandidates([])
        const clientValidationFailure = result.before && result.after
          ? getComparisonValidationFailure(result.before, result.after)
          : null
        const failureDetail = process.env.NODE_ENV === "development"
          ? result.failure
            ? `${result.failure.detail} [${result.failure.code} at ${result.failure.stage}]`
            : clientValidationFailure ?? result.comparisonMessage ?? result.message
          : result.comparisonMessage || result.message
        setFetchError(`${failureDetail} Upload both images manually, or continue to route planning without detailed comparison.`)
        setShowManualUpload(true)
        return
      }
      const pair = { beforeImage: result.before, afterImage: result.after }
      setBeforeCandidates(result.beforeCandidates)
      setAfterCandidates(result.afterCandidates)
      if (result.status === "selection-required") {
        setPendingSatellite(pair)
        setFetchMessage(result.message)
        setShowManualUpload(true)
        return
      }
      setPendingSatellite(null)
      onImageryChange({ ...imagery, satellite: pair })
      setFetchMessage(result.message)
      setShowManualUpload(false)
    } catch (error) {
      setPendingSatellite(null)
      setBeforeCandidates([])
      setAfterCandidates([])
      setFetchError(error instanceof Error ? error.message : "Satellite imagery lookup failed. Use manual upload.")
      setShowManualUpload(true)
    } finally {
      setFetching(false)
    }
  }

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
          <WorkflowProgress currentStep="imagery" />
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <div className="mb-6 max-w-2xl">
          <p className="mb-3 text-xs font-medium text-cyan-300">Imagery</p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">Add before and after imagery</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Add imagery from before and after the disaster for the selected area.</p>
          <div className="mt-4 border-l-2 border-cyan-400/30 pl-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Selected area</p>
            <p className="mt-1 text-sm text-slate-300">{place?.name ?? "Area confirmed"}</p>
          </div>
        </div>

        <section className="mb-5 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <Satellite className="size-4 text-cyan-300" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white">Copernicus Sentinel-2 imagery</h2>
                <span className="live-badge">Sentinel-2</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Search for lower-cloud Sentinel-2 L2A scenes covering the exact selected area. Results can support local comparison, but potential damage still requires human verification.
              </p>
              <p className="mt-2 font-mono text-[10px] text-slate-600">
                [{bounds.west.toFixed(5)}, {bounds.south.toFixed(5)}, {bounds.east.toFixed(5)}, {bounds.north.toFixed(5)}]
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <label className="space-y-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                Before date
                <input type="date" className="field-control block" value={beforeDate} onChange={(event) => setBeforeDate(event.target.value)} />
              </label>
              <label className="space-y-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                After date
                <input type="date" className="field-control block" value={afterDate} onChange={(event) => setAfterDate(event.target.value)} />
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="area-primary-button" disabled={!validBounds || fetching} onClick={() => void retrieveAvailableImagery()}>
              <RefreshCw className={`size-4 ${fetching ? "animate-spin" : ""}`} aria-hidden="true" />
              {fetching ? "Searching provider…" : "Fetch available satellite imagery"}
            </button>
            <p className="text-[10px] text-slate-600">Sentinel-2 L2A true color · lower-cloud scenes preferred</p>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-slate-600">
            Scene cloud cover is a product-level estimate. Individual road or building damage is not certain; human verification is required.
          </p>
          {fetchMessage && <p className="mt-3 text-xs leading-5 text-emerald-300" role="status">{fetchMessage}</p>}
          {fetchError && <p className="mt-3 text-xs leading-5 text-amber-300" role="alert">{fetchError}</p>}
        </section>

        {pendingSatellite && (
          <section className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4 sm:p-5" aria-labelledby="higher-cloud-heading">
            <div className="mb-4">
              <h2 id="higher-cloud-heading" className="text-sm font-semibold text-amber-200">Higher cloud cover — verification limited.</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                No scene met the 40% cloud limit for at least one target date. Review this optional pair before using it for analysis.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ImageUploadPanel id="before-cloud-option" title="Optional Before imagery" description="Best available scene within 14 days of the requested Before date." image={pendingSatellite.beforeImage} satelliteReadOnly onProviderFailure={() => setShowManualUpload(true)} onImageChange={() => undefined} />
              <ImageUploadPanel id="after-cloud-option" title="Optional After imagery" description="Best available scene within 14 days of the requested After date." image={pendingSatellite.afterImage} satelliteReadOnly onProviderFailure={() => setShowManualUpload(true)} onImageChange={() => undefined} />
            </div>
            {(beforeCandidates.length > 1 || afterCandidates.length > 1) && (
              <div className="mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2">
                <SceneChoice
                  label="Choose another Before scene"
                  value={pendingSatellite.beforeImage.id}
                  options={beforeCandidates.filter((candidate) => isValidComparisonPair(candidate, pendingSatellite.afterImage))}
                  onChange={(beforeImage) => setPendingSatellite({ beforeImage, afterImage: pendingSatellite.afterImage })}
                />
                <SceneChoice
                  label="Choose another After scene"
                  value={pendingSatellite.afterImage.id}
                  options={afterCandidates.filter((candidate) => isValidComparisonPair(pendingSatellite.beforeImage, candidate))}
                  onChange={(afterImage) => setPendingSatellite({ beforeImage: pendingSatellite.beforeImage, afterImage })}
                />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="area-primary-button"
                onClick={() => {
                  onImageryChange({ ...imagery, satellite: pendingSatellite })
                  setPendingSatellite(null)
                  setFetchMessage("Higher-cloud Sentinel-2 imagery selected. Human verification is required.")
                }}
              >
                Use this imagery pair
              </button>
              <button type="button" className="area-secondary-button" onClick={() => setPendingSatellite(null)}>
                Decline imagery
              </button>
            </div>
          </section>
        )}

        {imagery.satellite && (
          <section className="mb-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Sentinel-2 imagery</h2>
              <span className="live-badge">Analysis ready</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ImageUploadPanel id="before-context-image" title="Before imagery" description="Selected Sentinel-2 scene before the requested date." image={imagery.satellite.beforeImage} satelliteReadOnly onProviderFailure={() => setShowManualUpload(true)} onImageChange={() => undefined} />
              <ImageUploadPanel id="after-context-image" title="After imagery" description="Selected Sentinel-2 scene after the requested date." image={imagery.satellite.afterImage} satelliteReadOnly onProviderFailure={() => setShowManualUpload(true)} onImageChange={() => undefined} />
            </div>
            {(beforeCandidates.length > 1 || afterCandidates.length > 1) && (
              <div className="mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2">
                <SceneChoice
                  label="Choose another Before scene"
                  value={imagery.satellite.beforeImage.id}
                  options={beforeCandidates.filter((candidate) => isValidComparisonPair(candidate, imagery.satellite!.afterImage))}
                  onChange={(beforeImage) => onImageryChange({ ...imagery, satellite: { beforeImage, afterImage: imagery.satellite!.afterImage } })}
                />
                <SceneChoice
                  label="Choose another After scene"
                  value={imagery.satellite.afterImage.id}
                  options={afterCandidates.filter((candidate) => isValidComparisonPair(imagery.satellite!.beforeImage, candidate))}
                  onChange={(afterImage) => onImageryChange({ ...imagery, satellite: { beforeImage: imagery.satellite!.beforeImage, afterImage } })}
                />
              </div>
            )}
            {!showManualUpload && (
              <button type="button" className="area-secondary-button mt-4" onClick={() => setShowManualUpload(true)}>
                Use manual upload instead
              </button>
            )}
          </section>
        )}

        {showManualUpload && <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 sm:p-5">
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Upload className="size-4 text-amber-300" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-white">Upload high-resolution imagery for detailed damage analysis.</h2>
              {manualPairReady && <span className="status-pill status-safe">Ready</span>}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Upload matching aerial, drone, or high-resolution satellite images. These files stay in this browser session.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ImageUploadPanel id="before-disaster-image" title="Before disaster" description="High-resolution uploaded imagery from before the event." image={imagery.manual.beforeImage} onImageChange={(beforeImage) => updateManualImage("before", beforeImage)} />
            <ImageUploadPanel id="after-disaster-image" title="After disaster" description="High-resolution uploaded imagery from after the event." image={imagery.manual.afterImage} onImageChange={(afterImage) => updateManualImage("after", afterImage)} />
          </div>
          {manualPairReady && <p className="mt-3 text-xs font-medium text-emerald-300">High-resolution uploaded imagery.</p>}
        </section>}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="area-secondary-button" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to area
          </button>
          <button type="button" className="area-primary-button" disabled={!canContinue} onClick={onContinue}>
            {imagery.satellite || manualPairReady ? "Continue to analysis" : "Continue without comparison"} <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.main>
  )
}

function SceneChoice({ label, value, options, onChange }: {
  label: string
  value: string
  options: SatelliteImageMetadata[]
  onChange: (image: SatelliteImageMetadata) => void
}) {
  if (options.length < 2) return null
  return (
    <label className="space-y-2 text-[10px] uppercase tracking-wider text-slate-500">
      {label}
      <select
        className="field-control block w-full normal-case tracking-normal"
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => option.id === event.target.value)
          if (selected) onChange(selected)
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.captureDate.slice(0, 10)} · {option.cloudCoverage.toFixed(1)}% cloud · {option.id}
          </option>
        ))}
      </select>
    </label>
  )
}
