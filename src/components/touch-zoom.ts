import L from 'leaflet'

// Leaflet 1.9's pinch handler always starts a CSS zoom on release, even when
// already at the requested scale. Draggable ignores new touches for its 250ms
// duration. Keep the continuous pinch, but commit its final view synchronously.
// Keep Leaflet's private gesture hooks isolated here; regression tests exercise
// the real handlers, including the handoff from two fingers to one.
type TouchZoomHandler = L.Handler & {
  _onTouchEnd: (event?: TouchEvent) => void
  _onTouchMove: (event: TouchEvent) => void
  _zooming: boolean
  _moved: boolean
}
type MapDragHandler = L.Handler & {
  _draggable: { _onDown: (event: Pick<TouchEvent, 'type' | 'touches' | 'target'>) => void }
}

export function finishTouchZoomImmediately(map: L.Map): () => void {
  const handler = map.touchZoom as TouchZoomHandler
  const original = handler._onTouchEnd
  const enabled = handler.enabled()
  handler.disable()
  handler._onTouchEnd = function (event) {
    const wasZooming = this._zooming
    const finishingPinch = wasZooming && this._moved
    let ended = false
    const onEnd = () => { ended = true }
    map.on('zoomend', onEnd)
    const animation = map.options.zoomAnimation
    map.options.zoomAnimation = false
    try {
      original.call(this, event)
    } finally {
      map.options.zoomAnimation = animation
      map.off('zoomend', onEnd)
    }
    // With zoomSnap=0, _resetView sees the already rendered pinch scale and
    // omits zoomend. Still finish the gesture for layers and observers.
    if (finishingPinch && !ended) map.fire('zoomend')

    if (wasZooming && !finishingPinch) {
      // Leaflet's no-movement branch does not detach these document listeners.
      // Its runtime supports Document, although @types/leaflet only lists HTMLElement.
      const eventDocument = document as unknown as HTMLElement
      L.DomEvent.off(eventDocument, 'touchmove', this._onTouchMove as L.DomEvent.EventHandlerFn, this)
      L.DomEvent.off(eventDocument, 'touchend touchcancel', this._onTouchEnd as L.DomEvent.EventHandlerFn, this)
    }
    if (wasZooming && event?.type !== 'touchcancel' && event?.type !== 'pointercancel'
      && event?.touches.length === 1 && map.dragging.enabled()) {
      // No new touchstart is fired for the finger still on the screen. Start a
      // normal Leaflet drag from its current position after committing the zoom.
      // Do not dispatch a synthetic DOM event (which could trigger other UI).
      const drag = map.dragging as MapDragHandler
      drag._draggable._onDown({
        type: 'touchstart', touches: event.touches, target: event.touches[0].target,
      })
    }
  }
  if (enabled) handler.enable()

  return () => {
    handler.disable()
    handler._onTouchEnd = original
  }
}
