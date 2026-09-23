// Fixed visitor position for the current map, on the path inside the main gate.
// Coordinates are normalized from the top-left, like the published map items.
// Replace this position with a location provider when map georeferencing exists.
export const VISITOR_POSITION = { x: .506, y: .747 }
export const VISITOR_FOCUS_SCALE = 5.3

export type CompassReading = {
  alpha: number | null
  beta?: number | null
  gamma?: number | null
  absolute: boolean
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}
export const normalizeHeading = (angle: number) => ((angle % 360) + 360) % 360

/** Clockwise bearing of the top of the screen. Relative gyroscope alpha is
 * deliberately ignored: it has no north reference. Matrix convention: W3C
 * https://www.w3.org/TR/orientation-event/#worked-example */
export function compassHeading(event: CompassReading, screenAngle = 0): number | null {
  if (Number.isFinite(event.webkitCompassHeading)) {
    if (event.webkitCompassAccuracy !== undefined && event.webkitCompassAccuracy < 0) return null
    return normalizeHeading(event.webkitCompassHeading! + screenAngle)
  }
  if (!event.absolute || event.alpha === null || !Number.isFinite(event.alpha)) return null
  const radians = Math.PI / 180
  const a = event.alpha * radians, b = (event.beta ?? 0) * radians, g = (event.gamma ?? 0) * radians
  const s = screenAngle * radians
  // Project the screen's upward vector onto the east/north plane.
  let east = (Math.cos(a) * Math.cos(g) - Math.sin(a) * Math.sin(b) * Math.sin(g)) * Math.sin(s)
    - Math.cos(b) * Math.sin(a) * Math.cos(s)
  let north = (Math.sin(a) * Math.cos(g) + Math.cos(a) * Math.sin(b) * Math.sin(g)) * Math.sin(s)
    + Math.cos(a) * Math.cos(b) * Math.cos(s)
  if (Math.hypot(east, north) < .1) {
    // When held vertically, use the direction out of the back of the phone.
    east = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g)
    north = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g)
  }
  return Number.isFinite(east + north) ? normalizeHeading(Math.atan2(east, north) / radians) : null
}

export function nearestHeading(previous: number, heading: number): number {
  return previous + normalizeHeading(heading - previous + 180) - 180
}

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<'granted' | 'denied'>
}
export type CompassStatus = 'ready' | 'insecure' | 'unsupported' | 'denied'

/** Sensor frames only update the arrow DOM; they never re-render the map. */
export function observeCompass(onHeading: (heading: number) => void) {
  let disposed = false, listening = false, frame = 0
  let last: CompassReading | undefined
  let previous: number | undefined
  const sensor = window.DeviceOrientationEvent as OrientationConstructor | undefined
  const screenAngle = () => window.screen.orientation?.angle ??
    (window as Window & { orientation?: number }).orientation ?? 0
  const publish = () => {
    frame = 0
    if (disposed || document.visibilityState === 'hidden' || !last) return
    const heading = compassHeading(last, screenAngle())
    if (heading === null) return
    previous = previous === undefined ? heading : nearestHeading(previous, heading)
    onHeading(previous)
  }
  const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(publish) }
  const receive = (event: Event) => {
    const reading = event as DeviceOrientationEvent & CompassReading
    if (compassHeading(reading, screenAngle()) === null) return
    last = reading
    schedule()
  }
  const listen = () => {
    if (disposed || listening) return
    listening = true
    window.addEventListener('deviceorientationabsolute', receive)
    window.addEventListener('deviceorientation', receive)
    window.screen.orientation?.addEventListener('change', schedule)
    window.addEventListener('orientationchange', schedule)
    document.addEventListener('visibilitychange', schedule)
  }
  // Browsers without an explicit permission API can begin delivering immediately.
  if (window.isSecureContext && sensor && !sensor.requestPermission) listen()
  return {
    async enable(): Promise<CompassStatus> {
      if (!window.isSecureContext) return 'insecure'
      if (!sensor) return 'unsupported'
      try {
        // Must run directly inside the location button's click for iOS.
        if (!listening && sensor.requestPermission && await sensor.requestPermission(true) !== 'granted') return 'denied'
        listen()
        return 'ready'
      } catch { return 'denied' }
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('deviceorientationabsolute', receive)
      window.removeEventListener('deviceorientation', receive)
      window.screen.orientation?.removeEventListener('change', schedule)
      window.removeEventListener('orientationchange', schedule)
      document.removeEventListener('visibilitychange', schedule)
    },
  }
}
