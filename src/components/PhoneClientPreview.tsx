import { Hourglass, Info, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type TouchEvent } from 'react'
import type { MapCategory, MapFact, MapItem } from '../domain/models'
import { visitorCopy } from './visitor-i18n'
import { useMouseDragScroll } from '../hooks/useMouseDragScroll'

interface PhoneClientPreviewProps {
  item: MapItem
  category: MapCategory | undefined
  imageUrl?: string | null
  imageUrls?: string[]
  iconUrl: string
  expanded: boolean
  locale?: string
  getFactIconUrl?: (fact: MapFact, item: MapItem) => string | null | undefined
  onExpand: () => void
  onClose: () => void
  onBackToGroup?: () => void
}

function PreviewVisual({ imageUrl, iconUrl, large = false }: { imageUrl?: string | null; iconUrl: string; large?: boolean }) {
  if (imageUrl) {
    return <img className={large ? 'map-client-preview__hero-image' : 'map-client-preview__image'} src={imageUrl} decoding="async" alt="" />
  }

  return (
    <div className={large ? 'map-client-preview__hero-icon' : 'map-client-preview__icon-visual'} aria-hidden="true">
      <span
        className="map-client-preview__icon"
        style={{ WebkitMaskImage: `url("${iconUrl}")`, maskImage: `url("${iconUrl}")` } as CSSProperties}
      />
    </div>
  )
}

function FactIcon({ fact, item, getFactIconUrl }: { fact: MapFact; item: MapItem; getFactIconUrl?: PhoneClientPreviewProps['getFactIconUrl'] }) {
  if (fact.iconAssetId === 'zooweb-fact-lifespan') {
    return <Hourglass className="map-client-preview__fact-icon" size={20} strokeWidth={2} aria-hidden="true" />
  }
  const iconUrl = getFactIconUrl?.(fact, item)
  return iconUrl
    ? <span className="map-client-preview__fact-icon-image" style={{ maskImage: `url(${JSON.stringify(iconUrl)})`, WebkitMaskImage: `url(${JSON.stringify(iconUrl)})` }} aria-hidden="true" />
    : <Info className="map-client-preview__fact-icon" size={14} strokeWidth={1.9} aria-hidden="true" />
}

export function PhoneClientPreview({
  item,
  imageUrl,
  imageUrls,
  iconUrl,
  expanded,
  locale = 'de',
  getFactIconUrl,
  onExpand,
  onClose,
  onBackToGroup,
}: PhoneClientPreviewProps) {
  const style = { '--client-preview-accent': 'var(--map-accent-ink, #1d6043)' } as CSSProperties
  const copy = visitorCopy(locale)
  const dragDescription = useMouseDragScroll('y')
  const images = imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : []
  const primaryImage = images[0] ?? null
  const photoIds = item.imageAssetIds?.length ? item.imageAssetIds : item.imageAssetId ? [item.imageAssetId] : []
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const photoCredit = item.imageCredits?.[photoIds[activeImageIndex]]
  const galleryTouchStart = useRef<{ x: number; y: number } | null>(null)
  const galleryPointerStart = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => setActiveImageIndex(0), [item.id])

  const showImage = (index: number) => {
    if (images.length) setActiveImageIndex((index + images.length) % images.length)
  }
  const handleGalleryTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) galleryTouchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }
  const handleGalleryTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = galleryTouchStart.current
    galleryTouchStart.current = null
    if (!start || event.changedTouches.length !== 1 || images.length < 2) return
    const deltaX = event.changedTouches[0].clientX - start.x
    const deltaY = event.changedTouches[0].clientY - start.y
    if (Math.abs(deltaX) >= 42 && Math.abs(deltaX) > Math.abs(deltaY)) showImage(activeImageIndex + (deltaX < 0 ? 1 : -1))
  }
  const handleGalleryPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Capturing a dot's pointer retargets its click to the gallery, swallowing navigation.
    if ((event.target as Element).closest('button')) return
    if (event.pointerType === 'touch' || !event.isPrimary) return
    galleryPointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleGalleryPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = galleryPointerStart.current
    galleryPointerStart.current = null
    if (!start || start.id !== event.pointerId || images.length < 2) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) >= 42 && Math.abs(deltaX) > Math.abs(deltaY)) showImage(activeImageIndex + (deltaX < 0 ? 1 : -1))
  }

  if (!expanded) {
    return (
      <aside className="map-client-preview__quick" aria-label={`${item.title} Vorschau`} style={style} onClick={onExpand}>
        {onBackToGroup && <button className="map-client-preview__back" aria-label="Zur Gruppe" onClick={(event) => { event.stopPropagation(); onBackToGroup() }}>‹</button>}
        <button
          type="button"
          className="map-client-preview__close"
          aria-label={locale === 'de' ? 'Vorschau schließen' : copy.close}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        <PreviewVisual imageUrl={primaryImage} iconUrl={iconUrl} />
        <div className="map-client-preview__quick-content">
          <h2>{item.title}</h2>
          {item.facts.length > 0 ? (
            <div className="map-client-preview__quick-facts">
              {item.facts.slice(0, 3).map((fact) => (
                <div className="map-client-preview__quick-fact" key={fact.id}>
                  <span>{fact.label}: {fact.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {item.type !== 'animal' && item.subtitle ? <strong className="map-client-preview__subtitle">{item.subtitle}</strong> : null}
              <p className="map-client-preview__quick-description">{item.description}</p>
            </>
          )}
          <button
            type="button"
            className="map-client-preview__more"
            onClick={(event) => {
              event.stopPropagation()
              onExpand()
            }}
          >
            {copy.more}
          </button>
        </div>
      </aside>
    )
  }

  return (
    <div className="map-client-preview__overlay is-open" onClick={onClose}>
      <article
        className="map-client-preview__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-client-preview-title"
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="map-client-preview__sheet-close" aria-label={locale === 'de' ? 'Detailansicht schließen' : copy.close} onClick={onClose}>
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="map-client-preview__scroll" {...dragDescription}>
          {images.length ? <div className="map-client-preview__gallery" onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd} onPointerDown={handleGalleryPointerDown} onPointerUp={handleGalleryPointerUp} onPointerCancel={() => { galleryPointerStart.current = null }}>
            <div className="map-client-preview__gallery-track" style={{ transform: `translate3d(-${activeImageIndex * 100}%, 0, 0)` }}>
              {images.map((src, index) => <img className="map-client-preview__hero-image" src={src} decoding="async" loading={index === activeImageIndex ? 'eager' : 'lazy'} alt={index === 0 ? item.title : `${item.title}, Foto ${index + 1}`} draggable={false} key={`${src}-${index}`} />)}
            </div>
            {images.length > 1 && <div className="map-client-preview__gallery-dots" role="group" aria-label="Fotos auswählen">
              {images.map((_, index) => <button type="button" className={index === activeImageIndex ? 'is-active' : ''} aria-label={`Foto ${index + 1} von ${images.length}`} aria-current={index === activeImageIndex ? 'true' : undefined} onClick={() => showImage(index)} key={index}/>) }
            </div>}
          </div> : <PreviewVisual imageUrl={null} iconUrl={iconUrl} large />}
          <div className="map-client-preview__content">
            {images.length > 0 && photoCredit && <p className="map-client-preview__photo-credit">
              <a href={photoCredit.source} target="_blank" rel="noreferrer">© {photoCredit.author}</a>
              {' · '}<a href={photoCredit.licenseUrl} target="_blank" rel="noreferrer">{photoCredit.license}</a>
            </p>}
            <h2 id="map-client-preview-title">{item.title}</h2>
            {item.type !== 'animal' && item.subtitle ? <p className="map-client-preview__sheet-subtitle">{item.subtitle}</p> : null}
            {item.facts.length > 0 ? (
              <div className="map-client-preview__facts">
                {item.facts.map((fact) => (
                  <div className="map-client-preview__fact" key={fact.id}>
                    <FactIcon fact={fact} item={item} getFactIconUrl={getFactIconUrl} />
                    <div>
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="map-client-preview__description">{item.description || copy.noDescription}</p>
          </div>
        </div>
      </article>
    </div>
  )
}
