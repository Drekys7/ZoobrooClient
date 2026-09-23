import { afterEach, describe, expect, it, vi } from 'vitest'
import { compassHeading, nearestHeading, observeCompass } from './visitor-location'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('visitor compass bearing', () => {
  it.each([0, 90, 180, 270])('points to bearing %s for both Android and iOS', heading => {
    expect(compassHeading({ absolute: true, alpha: (360 - heading) % 360, beta: 40, gamma: 0 })).toBeCloseTo(heading)
    expect(compassHeading({ absolute: false, alpha: 123, webkitCompassHeading: heading, webkitCompassAccuracy: 5 })).toBe(heading)
  })
  it('ignores uncalibrated and relative readings instead of inventing north', () => {
    expect(compassHeading({ absolute: false, alpha: 70 })).toBeNull()
    expect(compassHeading({ absolute: true, alpha: null })).toBeNull()
    expect(compassHeading({ absolute: true, alpha: NaN })).toBeNull()
    expect(compassHeading({ absolute: false, alpha: 0, webkitCompassHeading: 40, webkitCompassAccuracy: -1 })).toBeNull()
  })
  it('accounts for landscape and a vertically held phone', () => {
    expect(compassHeading({ absolute: true, alpha: 90, beta: 0, gamma: 0 }, 90)).toBeCloseTo(0)
    expect(compassHeading({ absolute: false, alpha: null, webkitCompassHeading: 270 }, 90)).toBe(0)
    expect(compassHeading({ absolute: true, alpha: 270, beta: 90, gamma: 0 })).toBeCloseTo(90)
  })
  it('crosses north without spinning a full turn', () => {
    expect(nearestHeading(359, 1)).toBe(361)
    expect(nearestHeading(1, 359)).toBe(-1)
    expect(nearestHeading(721, 359)).toBe(719)
  })
})

function sensors(requestPermission?: () => Promise<'granted' | 'denied'>) {
  vi.useFakeTimers()
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('DeviceOrientationEvent', requestPermission ? { requestPermission } : {})
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  const changed = vi.fn()
  const compass = observeCompass(changed)
  const emit = (alpha: number, absolute = true) => {
    const event = new Event('deviceorientation')
    Object.assign(event, { alpha, beta: 0, gamma: 0, absolute })
    window.dispatchEvent(event)
  }
  return { changed, compass, emit }
}

describe('compass sensor lifecycle', () => {
  it('coalesces sensor events into one frame and removes listeners on cleanup', () => {
    const f = sensors()
    f.emit(30); f.emit(50); f.emit(90)
    expect(f.changed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(f.changed.mock.calls).toEqual([[270]])
    f.emit(180)
    f.compass.dispose()
    f.emit(0)
    vi.advanceTimersByTime(100)
    expect(f.changed).toHaveBeenCalledTimes(1)
  })
  it('only asks iOS for permission on enable, then starts listening', async () => {
    const request = vi.fn(async () => 'granted' as const)
    const f = sensors(request)
    expect(request).not.toHaveBeenCalled()
    f.emit(0)
    vi.advanceTimersByTime(16)
    expect(f.changed).not.toHaveBeenCalled()
    expect(await f.compass.enable()).toBe('ready')
    expect(request).toHaveBeenCalledWith(true)
    f.emit(180)
    vi.advanceTimersByTime(16)
    expect(f.changed).toHaveBeenCalledWith(180)
    await f.compass.enable()
    expect(request).toHaveBeenCalledTimes(1)
    f.compass.dispose()
  })
  it('handles denied permission and insecure LAN pages', async () => {
    const request = vi.fn(async () => 'denied' as const)
    const f = sensors(request)
    expect(await f.compass.enable()).toBe('denied')
    f.emit(90)
    vi.advanceTimersByTime(16)
    expect(f.changed).not.toHaveBeenCalled()
    vi.stubGlobal('isSecureContext', false)
    expect(await f.compass.enable()).toBe('insecure')
    expect(request).toHaveBeenCalledTimes(1)
    f.compass.dispose()
  })
  it('ignores hidden-page updates and resumes with the latest bearing', () => {
    const f = sensors()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    f.emit(180)
    vi.advanceTimersByTime(16)
    expect(f.changed).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(16)
    expect(f.changed).toHaveBeenCalledWith(180)
    f.compass.dispose()
  })
  it('does not attach listeners if unmounted during the permission prompt', async () => {
    let resolve!: (value: 'granted') => void
    const f = sensors(() => new Promise(done => { resolve = done }))
    const pending = f.compass.enable()
    f.compass.dispose()
    resolve('granted')
    await pending
    f.emit(90)
    vi.advanceTimersByTime(16)
    expect(f.changed).not.toHaveBeenCalled()
  })
})
