import { useEffect, useRef, type MouseEvent } from 'react'

/** Mouse-only panning; touch scrolling and perpendicular gestures stay native. */
export function useMouseDragScroll(axis: 'x' | 'y') {
  const cleanupRef = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => () => cleanupRef.current?.(), [])

  return {
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 0) return
      cleanupRef.current?.()
      suppressClick.current = false
      const element = event.currentTarget
      const maxScroll = axis === 'x'
        ? element.scrollWidth - element.clientWidth
        : element.scrollHeight - element.clientHeight
      if (maxScroll <= 0) return
      const startX = event.clientX
      const startY = event.clientY
      const initialScroll = axis === 'x' ? element.scrollLeft : element.scrollTop
      const view = element.ownerDocument.defaultView!
      let dragging = false
      // Avoid text/image selection without cancelling touch or keyboard interaction.
      event.preventDefault()
      event.stopPropagation()
      const finish = () => {
        delete element.dataset.mouseDragging
        view.removeEventListener('mousemove', move, true)
        view.removeEventListener('mouseup', finish, true)
        view.removeEventListener('blur', finish)
        cleanupRef.current = null
      }
      const move = (next: globalThis.MouseEvent) => {
        if (!(next.buttons & 1)) { finish(); return }
        const dx = next.clientX - startX
        const dy = next.clientY - startY
        const delta = axis === 'x' ? dx : dy
        const perpendicular = axis === 'x' ? dy : dx
        if (!dragging) {
          if (Math.max(Math.abs(delta), Math.abs(perpendicular)) < 5) return
          // In the detail sheet, horizontal dragging belongs to the photo gallery.
          if (Math.abs(perpendicular) > Math.abs(delta)) { finish(); return }
          dragging = true
          suppressClick.current = true
          element.dataset.mouseDragging = 'true'
        }
        next.preventDefault()
        const offset = Math.max(0, Math.min(maxScroll, initialScroll - delta))
        if (axis === 'x') element.scrollLeft = offset
        else element.scrollTop = offset
      }
      cleanupRef.current = finish
      view.addEventListener('mousemove', move, true)
      view.addEventListener('mouseup', finish, true)
      view.addEventListener('blur', finish)
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!suppressClick.current || event.detail === 0) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    onDragStart: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
  }
}
