"use client"

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber"
import { motion, useReducedMotion } from "framer-motion"
// Three 0.186 ships runtime modules without declarations; R3F still provides the JSX integration.
// @ts-expect-error The project intentionally uses the installed Three runtime without adding a dependency.
import * as THREE from "three"

interface ThreeDimensionalGlobeProps {
  onComplete: () => void
}

const GLOBE_RADIUS = 1.7
const FULL_DURATION_MS = 6800
const REDUCED_DURATION_MS = 1500
const EARTH_TEXTURE_PATH = "/earth/nasa-blue-marble-2048.jpg"
const CLOUD_TEXTURE_PATH = "/earth/nasa-clouds-2048.jpg"
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SUN_DIRECTION = new THREE.Vector3(0.92, 0.3, 0.12).normalize()

const globeVertexShader = `
  varying vec2 vTextureCoordinates;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vTextureCoordinates = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    // The globe hierarchy uses rotation and uniform scaling only, so this
    // normalized model transform is equivalent to its inverse-transpose.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const earthFragmentShader = `
  uniform sampler2D surfaceTexture;
  uniform vec3 sunDirection;
  uniform float sceneOpacity;
  varying vec2 vTextureCoordinates;
  varying vec3 vWorldNormal;

  void main() {
    vec3 surfaceColor = texture2D(surfaceTexture, vTextureCoordinates).rgb;
    float sunAmount = dot(normalize(vWorldNormal), normalize(sunDirection));
    float dayFactor = smoothstep(-0.12, 0.12, sunAmount);
    float daylightStrength = 0.82 + max(sunAmount, 0.0) * 0.18;
    vec3 daySurface = surfaceColor * daylightStrength;
    vec3 nightSurface = surfaceColor * 0.055 + vec3(0.0025, 0.007, 0.016);
    vec3 finalColor = mix(nightSurface, daySurface, dayFactor);

    gl_FragColor = vec4(finalColor, sceneOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const cloudFragmentShader = `
  uniform sampler2D cloudTexture;
  uniform vec3 sunDirection;
  uniform float sceneOpacity;
  varying vec2 vTextureCoordinates;
  varying vec3 vWorldNormal;

  void main() {
    vec3 cloudSample = texture2D(cloudTexture, vTextureCoordinates).rgb;
    float cloudMask = dot(cloudSample, vec3(0.2126, 0.7152, 0.0722));
    float sunAmount = dot(normalize(vWorldNormal), normalize(sunDirection));
    float dayFactor = smoothstep(-0.12, 0.12, sunAmount);
    vec3 nightCloud = vec3(0.055, 0.075, 0.095);
    vec3 dayCloud = vec3(0.92, 0.96, 1.0) * (0.86 + max(sunAmount, 0.0) * 0.14);
    vec3 finalColor = mix(nightCloud, dayCloud, dayFactor);

    gl_FragColor = vec4(finalColor, cloudMask * sceneOpacity * 0.24);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const atmosphereFragmentShader = `
  uniform float sceneOpacity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0), 3.4);
    vec3 atmosphereColor = vec3(0.12, 0.48, 0.72);
    gl_FragColor = vec4(atmosphereColor, rim * sceneOpacity * 0.16);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const signalLocations = [
  { latitude: 37, longitude: -80, color: "#67e8f9", delay: 0 },
  { latitude: -15, longitude: -58, color: "#22d3ee", delay: 0.7 },
  { latitude: 10, longitude: 20, color: "#38bdf8", delay: 1.15 },
  { latitude: -25, longitude: 135, color: "#fbbf24", delay: 2.35 },
] as const

const arcLocations = [
  [[37, -80], [48, 10]],
  [[10, 20], [35, 70]],
] as const

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function smoothstep(start: number, end: number, value: number) {
  const progress = clamp((value - start) / (end - start))
  return progress * progress * (3 - 2 * progress)
}

function deterministicValue(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function geographicPosition(latitude: number, longitude: number, radius = GLOBE_RADIUS) {
  const latitudeRadians = THREE.MathUtils.degToRad(latitude)
  const longitudeRadians = THREE.MathUtils.degToRad(longitude)
  const latitudeRadius = Math.cos(latitudeRadians)
  return new THREE.Vector3(
    radius * latitudeRadius * Math.cos(longitudeRadians),
    radius * Math.sin(latitudeRadians),
    -radius * latitudeRadius * Math.sin(longitudeRadians),
  )
}

function sceneOpacity(elapsed: number, revealAt: number, reduceMotion: boolean) {
  if (reduceMotion) return smoothstep(0.05, 0.25, elapsed)
  return smoothstep(revealAt, revealAt + 0.65, elapsed) * (1 - smoothstep(5.45, 6.45, elapsed))
}

function RealisticEarth({ reduceMotion, onReady }: { reduceMotion: boolean; onReady: () => void }) {
  const [surfaceTexture, cloudTexture] = useLoader(THREE.TextureLoader, [EARTH_TEXTURE_PATH, CLOUD_TEXTURE_PATH])
  const renderer = useThree((state) => state.gl)
  const textureAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  const preparedSurfaceTexture = useMemo(() => {
    const texture = surfaceTexture.clone()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = textureAnisotropy
    texture.needsUpdate = true
    return texture
  }, [surfaceTexture, textureAnisotropy])
  const preparedCloudTexture = useMemo(() => {
    const texture = cloudTexture.clone()
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = textureAnisotropy
    texture.needsUpdate = true
    return texture
  }, [cloudTexture, textureAnisotropy])
  const earthMaterial = useRef<THREE.ShaderMaterial>(null)
  const atmosphereMaterial = useRef<THREE.ShaderMaterial>(null)
  const clouds = useRef<THREE.Mesh>(null)
  const cloudMaterial = useRef<THREE.ShaderMaterial>(null)
  const earthUniforms = useMemo(() => ({
    surfaceTexture: { value: preparedSurfaceTexture },
    sunDirection: { value: SUN_DIRECTION },
    sceneOpacity: { value: 0 },
  }), [preparedSurfaceTexture])
  const cloudUniforms = useMemo(() => ({
    cloudTexture: { value: preparedCloudTexture },
    sunDirection: { value: SUN_DIRECTION },
    sceneOpacity: { value: 0 },
  }), [preparedCloudTexture])
  const atmosphereUniforms = useMemo(() => ({
    sceneOpacity: { value: 0 },
  }), [])

  useEffect(() => {
    onReady()
    return () => {
      preparedSurfaceTexture.dispose()
      preparedCloudTexture.dispose()
    }
  }, [onReady, preparedCloudTexture, preparedSurfaceTexture])

  useFrame(({ clock }, delta) => {
    const opacity = sceneOpacity(clock.elapsedTime, 0.55, reduceMotion)
    if (earthMaterial.current) earthMaterial.current.uniforms.sceneOpacity.value = opacity
    if (cloudMaterial.current) cloudMaterial.current.uniforms.sceneOpacity.value = opacity
    if (atmosphereMaterial.current) atmosphereMaterial.current.uniforms.sceneOpacity.value = opacity
    if (clouds.current && !reduceMotion) clouds.current.rotation.y += delta * 0.0024
  })

  return (
    <>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 72]} />
        <shaderMaterial
          ref={earthMaterial}
          uniforms={earthUniforms}
          vertexShader={globeVertexShader}
          fragmentShader={earthFragmentShader}
          transparent
          toneMapped
        />
      </mesh>
      <mesh ref={clouds}>
        <sphereGeometry args={[GLOBE_RADIUS * 1.006, 96, 72]} />
        <shaderMaterial
          ref={cloudMaterial}
          uniforms={cloudUniforms}
          vertexShader={globeVertexShader}
          fragmentShader={cloudFragmentShader}
          transparent
          depthWrite={false}
          toneMapped
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS * 1.018, 64, 48]} />
        <shaderMaterial
          ref={atmosphereMaterial}
          uniforms={atmosphereUniforms}
          vertexShader={globeVertexShader}
          fragmentShader={atmosphereFragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped
        />
      </mesh>
    </>
  )
}

function LoadingGlobe() {
  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
      <meshBasicMaterial color="#030812" />
    </mesh>
  )
}

function StarField({ reduceMotion }: { reduceMotion: boolean }) {
  const material = useRef<THREE.PointsMaterial>(null)
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    for (let index = 0; index < 420; index += 1) {
      const y = 1 - (2 * (index + 0.5)) / 420
      const horizontalRadius = Math.sqrt(1 - y * y)
      const angle = index * GOLDEN_ANGLE
      const radius = 8 + deterministicValue(index + 800) * 5
      positions.push(Math.cos(angle) * horizontalRadius * radius, y * radius, Math.sin(angle) * horizontalRadius * radius - 2)
      const brightness = 0.26 + deterministicValue(index + 1600) * 0.34
      colors.push(brightness * 0.45, brightness * 0.82, brightness)
    }
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    nextGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    return nextGeometry
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ clock }) => {
    if (material.current) material.current.opacity = reduceMotion ? 0.22 : smoothstep(0.1, 0.8, clock.elapsedTime) * 0.34
  })

  return (
    <points geometry={geometry} position={[0, 0, -2]}>
      <pointsMaterial ref={material} size={0.018} transparent opacity={0} vertexColors depthWrite={false} />
    </points>
  )
}

function OrbitPath({ inclination, phase, speed, showSatellite, reduceMotion }: {
  inclination: [number, number, number]
  phase: number
  speed: number
  showSatellite: boolean
  reduceMotion: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const lineMaterial = useRef<THREE.LineBasicMaterial>(null)
  const satellite = useRef<THREE.Mesh>(null)
  const satelliteMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const geometry = useMemo(() => {
    const points = Array.from({ length: 129 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2
      return new THREE.Vector3(Math.cos(angle) * 2.18, Math.sin(angle) * 1.9, 0)
    })
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ clock }, delta) => {
    const elapsed = clock.elapsedTime
    const opacity = sceneOpacity(elapsed, 1 + phase * 0.12, reduceMotion)
    if (lineMaterial.current) lineMaterial.current.opacity = opacity * 0.14
    if (satelliteMaterial.current) satelliteMaterial.current.opacity = opacity * 0.72
    if (group.current && !reduceMotion) group.current.rotation.z += delta * 0.025
    if (satellite.current) {
      const angle = phase + elapsed * speed * (reduceMotion ? 0.08 : 1)
      satellite.current.position.set(Math.cos(angle) * 2.18, Math.sin(angle) * 1.9, 0)
    }
  })

  return (
    <group ref={group} rotation={inclination}>
      <lineLoop geometry={geometry}>
        <lineBasicMaterial ref={lineMaterial} color="#38bdf8" transparent opacity={0} depthWrite={false} />
      </lineLoop>
      {showSatellite && (
        <mesh ref={satellite}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshBasicMaterial ref={satelliteMaterial} color="#a5f3fc" transparent opacity={0} />
        </mesh>
      )}
    </group>
  )
}

function GeographicSignal({ latitude, longitude, color, delay, reduceMotion }: {
  latitude: number
  longitude: number
  color: string
  delay: number
  reduceMotion: boolean
}) {
  const ring = useRef<THREE.Mesh>(null)
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const pointMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const position = useMemo(() => geographicPosition(latitude, longitude, GLOBE_RADIUS + 0.035), [latitude, longitude])
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize()), [position])

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime
    const visible = sceneOpacity(elapsed, 1.75 + delay * 0.15, reduceMotion)
    const cycle = reduceMotion ? 0.25 : ((elapsed + delay) % 2.15) / 2.15
    if (pointMaterial.current) pointMaterial.current.opacity = visible * 0.72
    if (ringMaterial.current) ringMaterial.current.opacity = visible * (1 - cycle) * 0.38
    if (ring.current) ring.current.scale.setScalar(0.45 + cycle * 1.45)
  })

  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <sphereGeometry args={[0.032, 10, 10]} />
        <meshBasicMaterial ref={pointMaterial} color={color} transparent opacity={0} />
      </mesh>
      <mesh ref={ring} position={[0, 0, 0.006]}>
        <ringGeometry args={[0.055, 0.068, 36]} />
        <meshBasicMaterial ref={ringMaterial} color={color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function DataArc({ start, end, delay, reduceMotion }: {
  start: readonly [number, number]
  end: readonly [number, number]
  delay: number
  reduceMotion: boolean
}) {
  const indicator = useRef<THREE.Mesh>(null)
  const indicatorMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const arcLineRef = useRef<THREE.Line>(null)
  const curve = useMemo(() => {
    const from = geographicPosition(start[0], start[1], GLOBE_RADIUS + 0.04)
    const to = geographicPosition(end[0], end[1], GLOBE_RADIUS + 0.04)
    const midpoint = from.clone().add(to).normalize().multiplyScalar(GLOBE_RADIUS + 0.48)
    return new THREE.QuadraticBezierCurve3(from, midpoint, to)
  }, [end, start])
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)), [curve])
  const arcLineObject = useMemo(() => new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0, depthWrite: false }),
  ), [geometry])

  useEffect(() => () => {
    geometry.dispose()
    arcLineObject.material.dispose()
  }, [arcLineObject, geometry])
  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime
    const opacity = sceneOpacity(elapsed, 2.45 + delay, reduceMotion)
    if (arcLineRef.current) arcLineRef.current.material.opacity = opacity * 0.34
    if (indicatorMaterial.current) indicatorMaterial.current.opacity = opacity * 0.7
    if (indicator.current) indicator.current.position.copy(curve.getPoint((elapsed * 0.14 + delay) % 1))
  })

  return (
    <>
      <primitive ref={arcLineRef} object={arcLineObject} />
      <mesh ref={indicator}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial ref={indicatorMaterial} color="#a5f3fc" transparent opacity={0} />
      </mesh>
    </>
  )
}

function ScanRing({ reduceMotion }: { reduceMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime
    if (reduceMotion) {
      if (material.current) material.current.opacity = 0
      return
    }
    const cycle = clamp((elapsed - 2.8) / 1.25)
    const latitude = -1.25 + cycle * 2.5
    const radius = Math.sqrt(Math.max(0, GLOBE_RADIUS * GLOBE_RADIUS - latitude * latitude))
    if (ring.current) {
      ring.current.position.y = latitude
      ring.current.scale.setScalar(radius / GLOBE_RADIUS)
    }
    if (material.current) material.current.opacity = Math.sin(cycle * Math.PI) * 0.14 * (1 - smoothstep(5.2, 6.1, elapsed))
  })

  return (
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[GLOBE_RADIUS + 0.045, 0.009, 6, 96]} />
      <meshBasicMaterial ref={material} color="#67e8f9" transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function TelemetryStreak({ startAt, direction, length, speed, reduceMotion }: {
  startAt: number
  direction: readonly [number, number]
  length: number
  speed: number
  reduceMotion: boolean
}) {
  const streakRef = useRef<THREE.Line>(null)
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 14 }, (_, index) => {
      const progress = index / 13
      return new THREE.Vector3(-progress * direction[0] * length, -progress * direction[1] * length, 0)
    }),
  ), [direction, length])

  const streakObject = useMemo(() => new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0, depthWrite: false }),
  ), [geometry])

  useEffect(() => () => {
    geometry.dispose()
    streakObject.material.dispose()
  }, [geometry, streakObject])
  useFrame(({ clock }) => {
    if (reduceMotion) {
      if (streakRef.current) streakRef.current.material.opacity = 0
      return
    }
    const progress = (clock.elapsedTime - startAt) / 0.9
    const visible = progress >= 0 && progress <= 1
    if (streakRef.current) {
      streakRef.current.material.opacity = visible ? Math.sin(progress * Math.PI) * 0.2 : 0
      streakRef.current.visible = visible
      streakRef.current.position.set(-4 + progress * direction[0] * speed, 2.4 + progress * direction[1] * speed, -3.2)
    }
  })

  return (
    <primitive ref={streakRef} object={streakObject} />
  )
}

function GlobeScene({ reduceMotion, pointer, onAssetsReady }: {
  reduceMotion: boolean
  pointer: React.MutableRefObject<{ x: number; y: number }>
  onAssetsReady: () => void
}) {
  const globe = useRef<THREE.Group>(null)
  const autoRotation = useRef(-0.42)
  const currentPointer = useRef({ x: 0, y: 0 })

  useFrame(({ camera, clock }, delta) => {
    const elapsed = clock.elapsedTime
    const finalInfluence = reduceMotion ? 0 : smoothstep(5.05, 6.35, elapsed)
    const normalInfluence = 1 - finalInfluence

    if (!reduceMotion) autoRotation.current += delta * 0.045 * normalInfluence
    currentPointer.current.x = THREE.MathUtils.damp(currentPointer.current.x, pointer.current.x, 3.4, delta)
    currentPointer.current.y = THREE.MathUtils.damp(currentPointer.current.y, pointer.current.y, 3.4, delta)

    if (globe.current) {
      const normalY = autoRotation.current + currentPointer.current.x * 0.075 * normalInfluence
      const normalX = 0.09 + currentPointer.current.y * 0.045 * normalInfluence
      globe.current.rotation.y = THREE.MathUtils.lerp(normalY, 0.04, finalInfluence)
      globe.current.rotation.x = THREE.MathUtils.lerp(normalX, 0.06, finalInfluence)
      globe.current.rotation.z = THREE.MathUtils.lerp(-0.035, 0, finalInfluence)
      globe.current.scale.setScalar(1 + finalInfluence * 0.035)
    }

    const middleDistance = reduceMotion ? 5.7 : THREE.MathUtils.lerp(6.25, 5.45, smoothstep(0.3, 4.5, elapsed))
    const targetDistance = reduceMotion ? 5.7 : THREE.MathUtils.lerp(middleDistance, 4.72, finalInfluence)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetDistance, 2.2, delta)
    camera.position.x = THREE.MathUtils.damp(camera.position.x, finalInfluence * -0.12, 2.2, delta)
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <StarField reduceMotion={reduceMotion} />
      <TelemetryStreak startAt={2.35} direction={[1, -0.18]} length={1.5} speed={8} reduceMotion={reduceMotion} />
      <TelemetryStreak startAt={3.35} direction={[0.9, -0.36]} length={1.15} speed={8.5} reduceMotion={reduceMotion} />
      <TelemetryStreak startAt={4.55} direction={[1, 0.22]} length={1.35} speed={7.5} reduceMotion={reduceMotion} />
      <group ref={globe}>
        <RealisticEarth reduceMotion={reduceMotion} onReady={onAssetsReady} />
        {signalLocations.map((signal) => <GeographicSignal key={`${signal.latitude}-${signal.longitude}`} {...signal} reduceMotion={reduceMotion} />)}
        {arcLocations.map(([start, end], index) => (
          <DataArc key={`${start.join("-")}-${end.join("-")}`} start={start} end={end} delay={index * 0.45} reduceMotion={reduceMotion} />
        ))}
        <ScanRing reduceMotion={reduceMotion} />
      </group>
      <OrbitPath inclination={[0.35, 0.18, 0.18]} phase={0.4} speed={0.42} showSatellite reduceMotion={reduceMotion} />
      <OrbitPath inclination={[-0.55, 0.28, 0.8]} phase={2.2} speed={0.33} showSatellite reduceMotion={reduceMotion} />
      <OrbitPath inclination={[0.9, -0.15, -0.38]} phase={1.2} speed={0.28} showSatellite={false} reduceMotion={reduceMotion} />
    </>
  )
}

function IntroFallback({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#03060b] px-6 text-center text-white">
      <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">DisasterLens</h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-slate-400 sm:text-base">Detect damage. Understand impact. Choose the safest path.</p>
      <button type="button" className="area-primary-button mt-7" onClick={onContinue}>Continue</button>
    </div>
  )
}

class IntroErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function ThreeDimensionalGlobe({ onComplete }: ThreeDimensionalGlobeProps) {
  const reduceMotion = Boolean(useReducedMotion())
  const pointer = useRef({ x: 0, y: 0 })
  const completionTimer = useRef<number | null>(null)
  const completed = useRef(false)
  const [assetsReady, setAssetsReady] = useState(false)
  const markAssetsReady = useCallback(() => setAssetsReady(true), [])

  const completeIntro = useCallback(() => {
    if (completed.current) return
    completed.current = true
    if (completionTimer.current !== null) {
      window.clearTimeout(completionTimer.current)
      completionTimer.current = null
    }
    onComplete()
  }, [onComplete])

  useEffect(() => {
    if (!assetsReady) return
    completionTimer.current = window.setTimeout(completeIntro, reduceMotion ? REDUCED_DURATION_MS : FULL_DURATION_MS)
    return () => {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current)
    }
  }, [assetsReady, completeIntro, reduceMotion])

  const fallback = <IntroFallback onContinue={completeIntro} />

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-[#02050a]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.1 : 0.5, ease: "easeInOut" }}
      role="dialog"
      aria-label="DisasterLens introduction"
      onPointerMove={(event) => {
        if (reduceMotion) return
        pointer.current.x = event.clientX / window.innerWidth * 2 - 1
        pointer.current.y = -(event.clientY / window.innerHeight * 2 - 1)
      }}
      onPointerLeave={() => { pointer.current = { x: 0, y: 0 } }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,25,38,0.07),transparent_64%)]" />
      <div className="absolute inset-0">
        <IntroErrorBoundary fallback={fallback}>
          <Canvas
            camera={{ position: [0, 0, 6.25], fov: 40 }}
            dpr={[1, 2]}
            fallback={fallback}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          >
            <Suspense fallback={<LoadingGlobe />}>
              <GlobeScene reduceMotion={reduceMotion} pointer={pointer} onAssetsReady={markAssetsReady} />
            </Suspense>
          </Canvas>
        </IntroErrorBoundary>
      </div>

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-[9%] z-10 flex flex-col items-center px-6 text-center sm:bottom-[10%]"
        initial={{ opacity: 0, y: 8, filter: "blur(5px)" }}
        animate={assetsReady
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: 8, filter: "blur(5px)" }}
        exit={{ opacity: 0, y: -5, filter: "blur(3px)" }}
        transition={{ delay: reduceMotion ? 0.05 : 3.35, duration: reduceMotion ? 0.25 : 0.75, ease: "easeOut" }}
      >
        <h1 className="text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">DisasterLens</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">Detect damage. Understand impact. Choose the safest path.</p>
      </motion.div>

      <button
        type="button"
        onClick={completeIntro}
        className="absolute right-4 top-4 z-20 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur-sm transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 sm:right-5 sm:top-5"
      >
        Skip intro →
      </button>
    </motion.div>
  )
}
