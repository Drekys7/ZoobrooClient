import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapCategory, MapItem } from '../domain/models'
import { PhoneClientPreview } from './PhoneClientPreview'

afterEach(cleanup)

const category: MapCategory = {
  id: 'animals',
  name: 'Tiere',
  type: 'animal',
  color: '#4F8F64',
  defaultIconAssetId: null,
  visible: true,
  sortOrder: 0,
}

const item: MapItem = {
  id: 'bear',
  categoryId: 'animals',
  type: 'animal',
  title: 'Bär',
  subtitle: 'Kraftvoller Allesfresser',
  description: 'Bären passen ihre Nahrungssuche an die Jahreszeit an.',
  iconAssetId: null,
  imageAssetId: null,
  colorOverride: null,
  markerOverrides: null,
  position: { x: 0.4, y: 0.5 },
  facts: [
    { id: 'region', label: 'Region', value: 'Europa und Asien' },
    { id: 'weight', label: 'Gewicht', value: '80–300 kg' },
  ],
  visible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('PhoneClientPreview', () => {
  it('does not capture pointer input intended for photo navigation buttons', () => {
    render(<PhoneClientPreview item={item} category={category} imageUrls={['/1.jpg','/2.jpg','/3.jpg']} iconUrl="/icon.png" expanded onExpand={vi.fn()} onClose={vi.fn()}/>)
    const gallery=document.querySelector<HTMLElement>('.map-client-preview__gallery')!
    const capture=vi.fn(); gallery.setPointerCapture=capture
    const third=screen.getByRole('button',{name:'Foto 3 von 3'})
    const down=new Event('pointerdown',{bubbles:true})
    Object.assign(down,{pointerId:1,pointerType:'mouse',isPrimary:true,clientX:10,clientY:10})
    fireEvent(third,down)
    expect(capture).not.toHaveBeenCalled()
    fireEvent.click(third)
    expect(third).toHaveAttribute('aria-current','true')
  })
  it('keeps author and license without displaying processing notes', () => {
    const credited={...item,imageAssetId:'photo',imageAssetIds:['photo'],imageCredits:{photo:{author:'Test Author',source:'https://commons.wikimedia.org/wiki/File:Test.jpg',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',changes:'crop-resize-compress'}}}
    for(const locale of ['de','en']){
      const view=render(<PhoneClientPreview item={credited} locale={locale} category={category} imageUrls={['/photo.jpg']} iconUrl="/icon.png" expanded onExpand={vi.fn()} onClose={vi.fn()}/>)
      expect(screen.getByText('© Test Author')).toBeInTheDocument()
      expect(screen.getByText('CC BY-SA 4.0')).toBeInTheDocument()
      expect(view.container.textContent).not.toMatch(/skaliert|komprimiert|zugeschnitten|compressed|resized|cropped/i)
      view.unmount()
    }
  })
  it('drags the expanded description vertically without closing it or changing photos', () => {
    const onClose = vi.fn()
    const { container } = render(<PhoneClientPreview item={item} category={category} imageUrls={['/first.jpg', '/second.jpg']} iconUrl="/icon.png" expanded onExpand={vi.fn()} onClose={onClose} />)
    const scroll = container.querySelector<HTMLDivElement>('.map-client-preview__scroll')!
    Object.defineProperties(scroll, { clientHeight: { value: 500 }, scrollHeight: { value: 1000 } })
    fireEvent.mouseDown(screen.getByText(item.description), { button: 0, clientX: 100, clientY: 300 })
    fireEvent.mouseMove(window, { buttons: 1, clientX: 100, clientY: 180 })
    fireEvent.mouseUp(window)
    fireEvent.click(screen.getByText(item.description), { detail: 1 })
    expect(scroll.scrollTop).toBe(120)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Foto 1 von 2' })).toHaveAttribute('aria-current', 'true')
  })
  it('opens the detailed ZooBrooWeb-style view from the quick preview', () => {
    const onExpand = vi.fn()
    const onClose = vi.fn()
    const props = {
      item,
      category,
      imageUrl: '/bear.jpg',
      imageUrls: ['/bear.jpg', '/bear-side.jpg'],
      iconUrl: '/bear-icon.png',
      getFactIconUrl: () => null,
      onExpand,
      onClose,
    }
    const { rerender, container } = render(<PhoneClientPreview {...props} expanded={false} />)
    expect(container.querySelector('.map-client-preview__quick-facts svg')).toBeNull()
    expect(container.querySelector('.map-client-preview__quick-facts .map-client-preview__fact-icon-image')).toBeNull()

    expect(screen.getByLabelText('Bär Vorschau')).toBeInTheDocument()
    expect(screen.getByText('Region: Europa und Asien')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Bär'))
    expect(onExpand).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Vorschau schließen' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onExpand).toHaveBeenCalledOnce()

    rerender(<PhoneClientPreview {...props} expanded />)
    expect(container.querySelectorAll('.map-client-preview__facts .map-client-preview__fact-icon')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Bär' })).toBeInTheDocument()
    expect(screen.queryByText(item.subtitle)).not.toBeInTheDocument()
    expect(screen.getByText('80–300 kg')).toBeInTheDocument()
    expect(screen.getByText(item.description)).toBeInTheDocument()
    const firstDot = screen.getByRole('button', { name: 'Foto 1 von 2' })
    const secondDot = screen.getByRole('button', { name: 'Foto 2 von 2' })
    expect(firstDot).toHaveAttribute('aria-current', 'true')
    fireEvent.click(secondDot)
    expect(secondDot).toHaveAttribute('aria-current', 'true')
    fireEvent.click(firstDot)
    const gallery = document.querySelector('.map-client-preview__gallery')
    expect(gallery).not.toBeNull()
    fireEvent.touchStart(gallery!, { touches: [{ clientX: 220, clientY: 100 }] })
    fireEvent.touchEnd(gallery!, { changedTouches: [{ clientX: 120, clientY: 104 }] })
    expect(secondDot).toHaveAttribute('aria-current', 'true')
  })
})
