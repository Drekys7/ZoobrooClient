import L from 'leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finishTouchZoomImmediately } from './touch-zoom'

let map: L.Map
let container: HTMLDivElement
let dispose: (() => void) | undefined
const originalAny3d = Object.getOwnPropertyDescriptor(L.Browser, 'any3d')!

function touch(type: string, points: [number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY, target: container })),
  })
  container.dispatchEvent(event)
}

function pinch(distance = 154) {
  touch('touchstart', [[130, 350]])
  touch('touchstart', [[130, 350], [230, 350]])
  touch('touchmove', [[180 - distance / 2, 350], [180 + distance / 2, 350]])
  vi.advanceTimersByTime(20)
  touch('touchend', [])
}

function dragImmediately() {
  const start = map.getCenter()
  touch('touchstart', [[180, 350]])
  touch('touchmove', [[210, 370]])
  const moved = !map.getCenter().equals(start)
  touch('touchend', [])
  return moved
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(L.Browser, 'any3d', { ...originalAny3d, value: true })
  container = document.createElement('div')
  document.body.append(container)
  for (const [key, value] of Object.entries({ clientWidth: 360, clientHeight: 740, offsetWidth: 360, offsetHeight: 740 })) {
    Object.defineProperty(container, key, { value })
  }
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 740))
  map = L.map(container, {
    crs: L.CRS.Simple, center: [500, 500], zoom: 0, minZoom: -2, maxZoom: 2,
    touchZoom: true, zoomSnap: 0, bounceAtZoomLimits: false,
    inertia: false, zoomControl: false, attributionControl: false,
  })
  L.imageOverlay('map.jpg', [[0, 0], [1000, 1000]]).addTo(map)
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  map.remove()
  container.remove()
  vi.restoreAllMocks()
  Object.defineProperty(L.Browser, 'any3d', originalAny3d)
  vi.useRealTimers()
})

describe('touch navigation immediately after pinch', () => {
  it('reproduces Leaflet ignoring the first drag during its release animation', () => {
    pinch()
    expect(map.getPane('mapPane')).toHaveClass('leaflet-zoom-anim')
    expect(dragImmediately()).toBe(false)
  })

  it('accepts a new drag immediately, preserving the exact pinch scale', () => {
    dispose = finishTouchZoomImmediately(map)
    const zoomend = vi.fn()
    map.on('zoomend', zoomend)
    pinch()
    expect(map.getZoom()).toBeCloseTo(Math.log2(1.54))
    expect(map.getPane('mapPane')).not.toHaveClass('leaflet-zoom-anim')
    expect(zoomend).toHaveBeenCalledTimes(1)
    expect(dragImmediately()).toBe(true)
    // A second gesture must work too, without stale touchend listeners.
    pinch(80)
    expect(dragImmediately()).toBe(true)
    expect(zoomend).toHaveBeenCalledTimes(2)
  })

  it.each([[10, -2], [1000, 2]])('respects zoom limits for pinch distance %s', (distance, zoom) => {
    dispose = finishTouchZoomImmediately(map)
    pinch(distance)
    expect(map.getZoom()).toBe(zoom)
    expect(dragImmediately()).toBe(true)
  })

  it('retains animated button zooms after a pinch', () => {
    dispose = finishTouchZoomImmediately(map)
    pinch()
    expect(map.options.zoomAnimation).toBe(true)
    map.zoomIn(.5)
    vi.advanceTimersByTime(20)
    expect(map.getPane('mapPane')).toHaveClass('leaflet-zoom-anim')
    vi.advanceTimersByTime(300)
    expect(map.getPane('mapPane')).not.toHaveClass('leaflet-zoom-anim')
  })

  it('releases navigation after a cancelled pinch too', () => {
    dispose = finishTouchZoomImmediately(map)
    touch('touchstart', [[130, 350], [230, 350]])
    touch('touchmove', [[110, 350], [250, 350]])
    vi.advanceTimersByTime(20)
    touch('touchcancel', [])
    expect(map.getPane('mapPane')).not.toHaveClass('leaflet-zoom-anim')
    expect(dragImmediately()).toBe(true)
  })

  it.each([0, 1])('continues panning with remaining finger %s without lifting it', (remaining) => {
    dispose = finishTouchZoomImmediately(map)
    touch('touchstart', [[130, 350]])
    touch('touchstart', [[130, 350], [230, 350]])
    touch('touchmove', [[100, 340], [260, 360]])
    vi.advanceTimersByTime(20)
    const point: [number, number] = remaining === 0 ? [100, 340] : [260, 360]
    const beforeRelease = map.project(map.getCenter())
    touch('touchend', [point])
    const zoom = map.getZoom()
    const center = map.project(map.getCenter())
    expect(center.distanceTo(beforeRelease)).toBeLessThan(1)
    // No jump when the second finger is lifted, or when the first stays still.
    touch('touchmove', [point])
    expect(map.project(map.getCenter()).distanceTo(center)).toBeLessThan(.01)
    touch('touchmove', [[point[0] + 30, point[1] + 20]])
    const delta = map.project(map.getCenter()).subtract(center)
    // Leaflet rounds its pixel origin when committing the pinch.
    expect(Math.abs(delta.x + 30)).toBeLessThan(1)
    expect(Math.abs(delta.y + 20)).toBeLessThan(1)
    expect(map.getZoom()).toBe(zoom)
    touch('touchend', [])
    expect(dragImmediately()).toBe(true)
  })

  it('supports pan → pinch → pan → pinch → pan within one continuous gesture', () => {
    dispose = finishTouchZoomImmediately(map)
    touch('touchstart', [[130, 350]])
    touch('touchmove', [[150, 350]])
    for (let i = 0; i < 2; i++) {
      touch('touchstart', [[150, 350], [250, 350]])
      touch('touchmove', [[130, 350], [270, 350]])
      vi.advanceTimersByTime(20)
      touch('touchend', [[130, 350]])
      const center = map.getCenter()
      touch('touchmove', [[150, 350]])
      expect(map.getCenter().equals(center)).toBe(false)
    }
    touch('touchend', [])
    expect(dragImmediately()).toBe(true)
  })

  it('hands off even when two fingers have not changed the zoom yet', () => {
    dispose = finishTouchZoomImmediately(map)
    touch('touchstart', [[130, 350], [230, 350]])
    touch('touchend', [[130, 350]])
    const center = map.getCenter()
    touch('touchmove', [[160, 350]])
    expect(map.getCenter().equals(center)).toBe(false)
    expect(map.getZoom()).toBe(0)
    touch('touchend', [])
    pinch()
    expect(dragImmediately()).toBe(true)
  })

  it('does not resume dragging when navigation is disabled', () => {
    dispose = finishTouchZoomImmediately(map)
    map.dragging.disable()
    touch('touchstart', [[130, 350], [230, 350]])
    touch('touchmove', [[110, 350], [250, 350]])
    vi.advanceTimersByTime(20)
    touch('touchend', [[110, 350]])
    const center = map.getCenter()
    touch('touchmove', [[150, 350]])
    expect(map.getCenter().equals(center)).toBe(true)
    touch('touchend', [])
  })

  it('does not hand off a cancelled gesture even if one finger remains', () => {
    dispose = finishTouchZoomImmediately(map)
    touch('touchstart', [[130, 350], [230, 350]])
    touch('touchmove', [[110, 350], [250, 350]])
    vi.advanceTimersByTime(20)
    touch('touchcancel', [[110, 350]])
    const center = map.getCenter()
    touch('touchmove', [[150, 350]])
    expect(map.getCenter().equals(center)).toBe(true)
    touch('touchend', [])
    expect(dragImmediately()).toBe(true)
  })
})
