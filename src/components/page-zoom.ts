/** Safari can ignore the viewport zoom limit. Cancel only its native gesture
 * zoom; leave touch/pointer events and single-finger scrolling to the UI/map.
 * https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html
 */
export function preventPageZoom(root: HTMLElement): () => void {
  const prevent = (event: Event) => { event.preventDefault() }
  root.addEventListener('gesturestart', prevent, { passive: false })
  root.addEventListener('gesturechange', prevent, { passive: false })
  return () => {
    root.removeEventListener('gesturestart', prevent)
    root.removeEventListener('gesturechange', prevent)
  }
}
