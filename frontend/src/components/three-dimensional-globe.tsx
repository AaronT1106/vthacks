"use client"

import { useEffect, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { motion, useReducedMotion } from "framer-motion"

interface ThreeDimensionalGlobeProps {
  onComplete: () => void
}

const incidentPoints: Array<[number, number, number]> = [
  [1.5, 0.55, 0.45],
  [-0.7, 1.3, 0.75],
  [0.4, -0.85, 1.35],
  [-1.35, -0.4, -0.65],
  [0.9, 1.05, -0.95],
]

function GlobeScene({ reduceMotion }: { reduceMotion: boolean }) {
  const globeGroup = useRef<{ rotation: { y: number } } | null>(null)

  useFrame((_, delta) => {
    if (globeGroup.current && !reduceMotion) {
      globeGroup.current.rotation.y += delta * 0.12
    }
  })

  return (
    <group
      ref={(group: { rotation: { y: number } } | null) => { globeGroup.current = group }}
      rotation={[0.12, -0.35, -0.05]}
    >
      <mesh>
        <sphereGeometry args={[1.7, 64, 64]} />
        <meshStandardMaterial color="#07101d" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.714, 32, 32]} />
        <meshBasicMaterial color="#1b405d" wireframe transparent opacity={0.16} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.82, 64, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.055} side={1} />
      </mesh>

      {incidentPoints.map((position, index) => (
        <group key={position.join("-")} position={position}>
          <mesh>
            <sphereGeometry args={[0.045, 18, 18]} />
            <meshBasicMaterial color={index < 2 ? "#fb7185" : "#fbbf24"} />
          </mesh>
          {index < 3 && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.1 + index * 0.015, 0.008, 8, 32]} />
              <meshBasicMaterial color="#67e8f9" transparent opacity={0.65} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

export function ThreeDimensionalGlobe({ onComplete }: ThreeDimensionalGlobeProps) {
  const reduceMotion = Boolean(useReducedMotion())

  useEffect(() => {
    const timer = window.setTimeout(onComplete, reduceMotion ? 450 : 2600)
    return () => window.clearTimeout(timer)
  }, [onComplete, reduceMotion])

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-[#03060b]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.1 : 0.55 }}
      role="dialog"
      aria-label="DisasterLens introduction"
    >
      <div className="absolute inset-0 intro-grid opacity-30" />
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 5.6], fov: 42 }} dpr={[1, 1.5]}>
          <ambientLight intensity={0.35} />
          <directionalLight color="#b9e6ff" intensity={2.4} position={[3, 2, 4]} />
          <pointLight color="#164e63" intensity={12} position={[-3, -2, 2]} />
          <GlobeScene reduceMotion={reduceMotion} />
        </Canvas>
      </div>

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-[12%] z-10 flex flex-col items-center px-6 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.35, duration: 0.7 }}
      >
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
          <span className="size-1.5 rounded-full bg-cyan-300" />
          Disaster intelligence system
        </div>
        <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">DisasterLens</h1>
        <p className="mt-3 text-sm text-slate-400 sm:text-base">Real-time intelligence when every second matters.</p>
      </motion.div>

      <button
        type="button"
        onClick={onComplete}
        className="absolute right-5 top-5 z-20 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        Skip intro
      </button>
    </motion.div>
  )
}
