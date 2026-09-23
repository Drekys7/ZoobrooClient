import { describe, expect, it } from 'vitest'
import { preventPageZoom } from './page-zoom'

describe('page zoom guard', () => {
  it('cancels native Safari zoom from nested interface elements', () => {
    const root = document.createElement('main')
    const input = document.createElement('input')
    root.append(input)
    const dispose = preventPageZoom(root)
    for (const type of ['gesturestart', 'gesturechange']) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    dispose()
  })

  it('leaves focus, clicks, scrolling and map touch/pointer gestures alone', () => {
    const root = document.createElement('main')
    const dispose = preventPageZoom(root)
    for (const type of ['focus', 'click', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'wheel']) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      root.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    dispose()
  })

  it('removes the guard when unmounted', () => {
    const root = document.createElement('main')
    preventPageZoom(root)()
    const event = new Event('gesturestart', { cancelable: true })
    root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
