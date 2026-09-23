import type { Map as LeafletMap } from 'leaflet'
import { showZones, type ZoneSettings } from '../domain/zones'

/** Pinch/flyTo emit continuous zoom events; CSS wheel/button zooms only emit
 * their target, so sample the rendered background during that transition. */
export function observeZoneVisibility(
  map: Pick<LeafletMap, 'on' | 'off' | 'getZoom'>,
  settings: ZoneSettings | undefined,
  getFitZoom: () => number,
  getRenderedScale: () => number | undefined,
  onChange: (visible: boolean) => void,
) {
  let visible: boolean | undefined
  let frame = 0
  let animating = false
  const publish = (scale: number) => {
    const next = showZones(settings, scale)
    if (next === visible) return
    visible = next
    onChange(next)
  }
  const sync = () => {
    if (!animating) publish(2 ** (map.getZoom() - getFitZoom()))
  }
  const sample = () => {
    const scale = getRenderedScale()
    if (scale !== undefined && Number.isFinite(scale) && scale > 0) publish(scale)
    frame = requestAnimationFrame(sample)
  }
  const animate = () => {
    if (animating) return
    animating = true
    frame = requestAnimationFrame(sample)
  }
  const finish = () => {
    animating = false
    cancelAnimationFrame(frame)
    sync()
  }
  sync()
  map.on('zoom resize', sync)
  map.on('zoomanim', animate)
  map.on('zoomend', finish)
  return () => {
    cancelAnimationFrame(frame)
    map.off('zoom resize', sync)
    map.off('zoomanim', animate)
    map.off('zoomend', finish)
  }
}
