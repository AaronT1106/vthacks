"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ImagePlus, Radar, Trash2, Upload } from "lucide-react"
import { motion } from "framer-motion"
import { WorkflowProgress } from "@/src/components/workflow-progress"
import type { DisasterAreaBounds, SelectedPlace } from "@/src/data/mock-disaster-data"

export interface DisasterImagery {
  beforeImage: File | null
  afterImage: File | null
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
  file,
  onFileChange,
}: {
  id: string
  title: string
  description: string
  file: File | null
  onFileChange: (file: File | null) => void
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
      onFileChange(nextFile)
    }
    image.onerror = () => {
      clearPendingPreview()
      setError("This image could not be previewed. Please choose another file.")
    }
    image.src = nextUrl
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

      {file ? (
        <div>
          <div className="grid h-64 place-items-center overflow-hidden rounded-lg border border-slate-800 bg-[#070b12] sm:h-72">
            <LocalImagePreview
              key={`${file.name}-${file.size}-${file.lastModified}-${file.type}`}
              file={file}
              title={title}
              onError={() => {
                setError("This image could not be previewed. Please choose another file.")
                onFileChange(null)
              }}
            />
          </div>
          <p className="mt-3 truncate text-xs text-slate-300" title={file.name}>{file.name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="area-secondary-button" onClick={() => input.current?.click()}>
              <Upload className="size-4" aria-hidden="true" /> Replace
            </button>
            <button
              type="button"
              className="area-secondary-button"
              onClick={() => {
                setError("")
                onFileChange(null)
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" /> Remove
            </button>
          </div>
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
  const validBounds = bounds.east > bounds.west && bounds.north > bounds.south
  const canContinue = validBounds && Boolean(imagery.beforeImage && imagery.afterImage)

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

        <div className="grid gap-4 lg:grid-cols-2">
          <ImageUploadPanel
            id="before-disaster-image"
            title="Before disaster"
            description="Upload an image showing this area before the disaster."
            file={imagery.beforeImage}
            onFileChange={(beforeImage) => onImageryChange({ ...imagery, beforeImage })}
          />
          <ImageUploadPanel
            id="after-disaster-image"
            title="After disaster"
            description="Upload an image showing this area after the disaster."
            file={imagery.afterImage}
            onFileChange={(afterImage) => onImageryChange({ ...imagery, afterImage })}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="area-secondary-button" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to area
          </button>
          <button type="button" className="area-primary-button" disabled={!canContinue} onClick={onContinue}>
            Continue to analysis <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.main>
  )
}
