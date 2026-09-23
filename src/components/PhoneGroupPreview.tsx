import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { MapCategory, MapItem } from '../domain/models'
import { useMouseDragScroll } from '../hooks/useMouseDragScroll'
import { CategoryIcon } from './CategoryIcon'

const WHEEL_SCROLL_FACTOR = 0.2

export function PhoneGroupPreview({ entries, category, getImageUrl, onChoose, onClose }: {
  entries: MapItem[]
  category?: MapCategory
  getImageUrl: (item: MapItem) => string | null | undefined
  onChoose: (id: string) => void
  onClose: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const dragScroll = useMouseDragScroll('x')
  const groupId = entries[0]?.id
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollLeft = 0
  }, [groupId])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const updateEdges = () => {
      const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth)
      const offset = Math.max(0, Math.min(maxScroll, list.scrollLeft))
      const opacity = (hidden: number) => entries.length > 3 && hidden > 1 ? Math.min(1, hidden / 69.75) : 0
      // The gradient stays three quarters of a card wide (93 * .75). Only its opacity changes
      // near either scroll boundary, so it never shrinks into a narrow stripe.
      list.style.setProperty('--group-fade-start-opacity', String(opacity(offset)))
      list.style.setProperty('--group-fade-end-opacity', String(opacity(maxScroll - offset)))
    }
    updateEdges()
    list.addEventListener('scroll', updateEdges, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges)
    resize?.observe(list)
    return () => {
      list.removeEventListener('scroll', updateEdges)
      resize?.disconnect()
    }
  }, [groupId, entries.length])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onWheel = (event: WheelEvent) => {
      const maxScroll = list.scrollWidth - list.clientWidth
      if (event.ctrlKey || maxScroll <= 0) return
      // A non-passive listener lets the wheel move the strip without scrolling/zooming the map.
      event.preventDefault()
      event.stopPropagation()
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1
      list.scrollLeft = Math.max(0, Math.min(maxScroll, list.scrollLeft + delta * unit * WHEEL_SCROLL_FACTOR))
    }
    list.addEventListener('wheel', onWheel, { passive: false })
    return () => list.removeEventListener('wheel', onWheel)
  }, [groupId])

  return <aside className="map-client-group" aria-label="Gruppe auswählen">
    <div ref={listRef} {...dragScroll} className={`map-client-group__list${entries.length >= 4 ? ' has-more' : ''}`}>
      {entries.map((entry) => {
        const image = getImageUrl(entry)
        return <button className="map-client-group__entry" key={entry.id} onClick={() => onChoose(entry.id)} aria-label={entry.title} title={entry.title}>
          {image ? <img src={image} alt="" draggable={false}/> : (
            <div className="map-client-group__category-icon" style={{ color: category?.color ?? '#2F7D59' }} aria-hidden="true">
              <CategoryIcon type={category?.type ?? entry.type} size={40} />
            </div>
          )}
          <span className="map-client-group__title">{entry.title}</span>
        </button>
      })}
    </div>
    <button className="map-client-preview__close" aria-label="Gruppe schließen" onClick={onClose}><X size={13}/></button>
  </aside>
}
