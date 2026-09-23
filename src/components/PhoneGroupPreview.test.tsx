import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapCategory, MapItem } from '../domain/models'
import { PhoneGroupPreview } from './PhoneGroupPreview'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const entries: MapItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `item-${index}`, title: `Punkt ${index + 1}`, categoryId: 'animals', type: 'animal',
  subtitle: '', description: '', position: { x: 0.5, y: 0.5 }, facts: [], visible: true,
  createdAt: '2026-09-11T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z',
}))

describe('group preview scrolling', () => {
  it('fades only edges with hidden cards and updates when the viewport grows', () => {
    let resized!: () => void
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    const { container, unmount } = render(<PhoneGroupPreview entries={entries} getImageUrl={() => null} onChoose={vi.fn()} onClose={vi.fn()} />)
    const list = container.querySelector<HTMLDivElement>('.map-client-group__list')!
    Object.defineProperties(list, { clientWidth: { value: 300, configurable: true }, scrollWidth: { value: 493 } })
    const edges = () => [Number(list.style.getPropertyValue('--group-fade-start-opacity')), Number(list.style.getPropertyValue('--group-fade-end-opacity'))]
    resized()
    expect(edges()).toEqual([0, 1])
    list.scrollLeft = 80
    fireEvent.scroll(list)
    expect(edges()).toEqual([1, 1])
    list.scrollLeft = 183
    fireEvent.scroll(list)
    expect(edges()[0]).toBe(1)
    expect(edges()[1]).toBeCloseTo(10 / 69.75)
    list.scrollLeft = 193
    fireEvent.scroll(list)
    expect(edges()).toEqual([1, 0])
    list.scrollLeft = -10 // Safari overscroll must not create a negative mask.
    fireEvent.scroll(list)
    expect(edges()).toEqual([0, 1])
    Object.defineProperty(list, 'clientWidth', { value: 600 })
    resized()
    expect(edges()).toEqual([0, 0])
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('resets fading for a new group and leaves groups of three fully clear', () => {
    const props = { getImageUrl: () => null, onChoose: vi.fn(), onClose: vi.fn() }
    const { container, rerender } = render(<PhoneGroupPreview {...props} entries={entries} />)
    const list = container.querySelector<HTMLDivElement>('.map-client-group__list')!
    Object.defineProperties(list, { clientWidth: { value: 300 }, scrollWidth: { value: 493 } })
    list.scrollLeft = 193
    fireEvent.scroll(list)
    rerender(<PhoneGroupPreview {...props} entries={entries.slice(1)} />)
    expect(list.scrollLeft).toBe(0)
    expect(list.style.getPropertyValue('--group-fade-start-opacity')).toBe('0')
    expect(list.style.getPropertyValue('--group-fade-end-opacity')).toBe('1')
    rerender(<PhoneGroupPreview {...props} entries={entries.slice(1, 4)} />)
    expect(list.style.getPropertyValue('--group-fade-start-opacity')).toBe('0')
    expect(list.style.getPropertyValue('--group-fade-end-opacity')).toBe('0')
  })

  it.each(['animal', 'restaurant', 'restroom', 'souvenir', 'entrance', 'custom'] as const)('uses the %s category icon and live category color when a photo is missing', (type) => {
    const category: MapCategory = { id: 'category', name: 'Kategorie', type, color: '#226688', visible: true, sortOrder: 0 }
    const props = { entries: entries.slice(0, 2).map((entry) => ({ ...entry, type, iconAssetId: 'own-icon', markerOverrides: { color: '#ffffff' } })),
      getImageUrl: (entry: MapItem) => entry.id === 'item-0' ? '/photo.jpg' : null, onChoose: vi.fn(), onClose: vi.fn() }
    const { container, rerender } = render(<PhoneGroupPreview {...props} category={category} />)
    const cards = container.querySelectorAll('.map-client-group__entry')
    expect(cards[0].querySelector('img')).toHaveAttribute('src', '/photo.jpg')
    expect(cards[0].querySelector('.map-client-group__category-icon')).toBeNull()
    const fallback = cards[1].querySelector('.map-client-group__category-icon')!
    expect(fallback).toHaveStyle({ color: '#226688' })
    expect(cards[1].querySelector('img')).toBeNull()
    if (type === 'custom') expect(fallback.querySelector('svg')).toBeInTheDocument()
    else {
      const file = type === 'animal' ? 'paw' : type
      expect(fallback.querySelector('.zooweb-category-glyph')).toHaveStyle({ maskImage: `url(/zooweb/icons/${file}.png)` })
    }
    rerender(<PhoneGroupPreview {...props} category={{ ...category, color: '#993355' }} />)
    expect(fallback).toHaveStyle({ color: '#993355' })
  })
  it('drags photos without opening the released card', () => {
    const onChoose = vi.fn()
    const { container, getByRole } = render(<PhoneGroupPreview entries={entries} getImageUrl={() => '/photo.jpg'} onChoose={onChoose} onClose={vi.fn()} />)
    const list = container.querySelector<HTMLDivElement>('.map-client-group__list')!
    Object.defineProperties(list, { clientWidth: { value: 300 }, scrollWidth: { value: 600 } })
    const card = getByRole('button', { name: 'Punkt 1' })
    fireEvent.mouseDown(card.querySelector('img')!, { button: 0, clientX: 200 })
    fireEvent.mouseMove(window, { buttons: 1, clientX: 110 })
    fireEvent.mouseUp(window)
    fireEvent.click(card, { detail: 1 })
    expect(list.scrollLeft).toBe(90)
    expect(onChoose).not.toHaveBeenCalled()
  })
  it.each([2, 3, 4, 5])('enables the half-card layout only for four or more entries (%s)', (count) => {
    const { container } = render(<PhoneGroupPreview entries={entries.slice(0, count)} getImageUrl={() => null} onChoose={vi.fn()} onClose={vi.fn()} />)
    expect(container.querySelector('.map-client-group__list')?.classList.contains('has-more')).toBe(count >= 4)
  })

  it('scrolls with vertical and horizontal wheels, handles units, clamps edges and resets for a different group', () => {
    const props = { getImageUrl: () => null, onChoose: vi.fn(), onClose: vi.fn() }
    const { container, rerender } = render(<PhoneGroupPreview {...props} entries={entries} />)
    const list = container.querySelector<HTMLDivElement>('.map-client-group__list')!
    Object.defineProperties(list, { clientWidth: { value: 300 }, scrollWidth: { value: 600 } })
    const wheel = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true })
    fireEvent(list, wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(list.scrollLeft).toBe(12)
    fireEvent.wheel(list, { deltaY: -20 })
    expect(list.scrollLeft).toBe(8)
    fireEvent.wheel(list, { deltaX: 30, deltaY: 2 })
    expect(list.scrollLeft).toBe(14)
    fireEvent.wheel(list, { deltaY: 2, deltaMode: 1 })
    expect(list.scrollLeft).toBeCloseTo(20.4)
    fireEvent.wheel(list, { deltaY: 1, deltaMode: 2 })
    expect(list.scrollLeft).toBeCloseTo(80.4)
    fireEvent.wheel(list, { deltaY: 2000 })
    expect(list.scrollLeft).toBe(300)
    fireEvent.wheel(list, { deltaY: -2000 })
    expect(list.scrollLeft).toBe(0)
    fireEvent.wheel(list, { deltaY: 60, ctrlKey: true })
    expect(list.scrollLeft).toBe(0)
    fireEvent.wheel(list, { deltaY: 60 })
    rerender(<PhoneGroupPreview {...props} entries={entries.slice(1)} />)
    expect(list.scrollLeft).toBe(0)
  })

  it('leaves wheel events untouched when every card fits', () => {
    const { container } = render(<PhoneGroupPreview entries={entries.slice(0, 3)} getImageUrl={() => null} onChoose={vi.fn()} onClose={vi.fn()} />)
    const list = container.querySelector('.map-client-group__list')!
    const wheel = new WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true })
    fireEvent(list, wheel)
    expect(wheel.defaultPrevented).toBe(false)
  })
})
