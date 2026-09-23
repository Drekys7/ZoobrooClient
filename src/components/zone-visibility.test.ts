import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZoneSettingsSchema } from '../domain/zones'
import { observeZoneVisibility } from './zone-visibility'

const settings = ZoneSettingsSchema.parse({ threshold: 1.5, labels: [{ id: 'forest', title: 'Forest', position: { x: .5, y: .5 } }] })

function setup() {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  const map = Object.assign(new L.FeatureGroup(), { getZoom: vi.fn(() => 0) })
  const rendered = vi.fn(() => 1)
  const change = vi.fn()
  const dispose = observeZoneVisibility(map as unknown as L.Map, settings, () => 0, rendered, change)
  return { map, rendered, change, dispose }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('zone threshold during navigation', () => {
  it('switches during pinch/flyTo in both directions without waiting for zoomend', () => {
    const f = setup()
    f.map.getZoom.mockReturnValue(Math.log2(1.5))
    f.map.fire('zoom')
    expect(f.change.mock.calls).toEqual([[true]])
    f.map.getZoom.mockReturnValue(Math.log2(1.51))
    f.map.fire('zoom')
    expect(f.change).toHaveBeenLastCalledWith(false)
    f.map.getZoom.mockReturnValue(Math.log2(1.4))
    f.map.fire('zoom')
    expect(f.change.mock.calls).toEqual([[true], [false], [true]])
    f.dispose()
  })
  it('waits for the visible CSS zoom to cross the threshold, not its target or zoomend', () => {
    const f = setup()
    f.map.fire('zoomanim', { zoom: 2 })
    f.rendered.mockReturnValue(1.4)
    vi.advanceTimersByTime(16)
    expect(f.change.mock.calls).toEqual([[true]])
    f.rendered.mockReturnValue(1.6)
    vi.advanceTimersByTime(16)
    expect(f.change.mock.calls).toEqual([[true], [false]])
    expect(f.map.getZoom()).toBe(0) // Leaflet's logical zoom is still the old value.
    vi.advanceTimersByTime(96)
    expect(f.change).toHaveBeenCalledTimes(2)
    f.map.getZoom.mockReturnValue(2)
    f.map.fire('zoomend')
    expect(vi.getTimerCount()).toBe(0)
    f.dispose()
  })
  it('restores zones midway through a CSS zoom out', () => {
    const f = setup()
    f.map.getZoom.mockReturnValue(2)
    f.map.fire('zoom')
    f.map.fire('zoomanim', { zoom: 0 })
    f.rendered.mockReturnValue(1.4)
    vi.advanceTimersByTime(16)
    expect(f.change.mock.calls).toEqual([[true], [false], [true]])
    f.dispose()
  })
  it('does not notify React on every zoom frame when visibility is unchanged', () => {
    const f = setup()
    for (const scale of [1.01, 1.1, 1.2, 1.3, 1.4]) {
      f.map.getZoom.mockReturnValue(Math.log2(scale))
      f.map.fire('zoom')
    }
    expect(f.change).toHaveBeenCalledTimes(1)
    f.dispose()
  })
  it('cancels animation sampling and listeners when unmounted', () => {
    const f = setup()
    f.map.fire('zoomanim', { zoom: 2 })
    f.dispose()
    f.map.getZoom.mockReturnValue(2)
    f.map.fire('zoom')
    f.map.fire('zoomanim', { zoom: 2 })
    vi.advanceTimersByTime(100)
    expect(f.change.mock.calls).toEqual([[true]])
    expect(vi.getTimerCount()).toBe(0)
  })
})
