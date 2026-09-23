import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategoryType, MapCategory, MapItem } from '../domain/models'
import { PhoneMapSearch, searchScore } from './PhoneMapSearch'

const categories: MapCategory[] = [
  { id: 'animals', name: 'Tiere', type: 'animal', color: '#4F8F64', defaultIconAssetId: null, visible: true, sortOrder: 0 },
  { id: 'food', name: 'Essen', type: 'restaurant', color: '#CA7B42', defaultIconAssetId: null, visible: true, sortOrder: 1 },
]

const items: MapItem[] = [
  { id: 'bear', categoryId: 'animals', type: 'animal', title: 'Bär', position: { x: 0.2, y: 0.3 }, subtitle: '', description: '', iconAssetId: null, imageAssetId: null, colorOverride: null, markerOverrides: null, facts: [], visible: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bistro', categoryId: 'food', type: 'restaurant', title: 'Bären-Bistro', position: { x: 0.7, y: 0.8 }, subtitle: '', description: '', iconAssetId: null, imageAssetId: null, colorOverride: null, markerOverrides: null, facts: [], visible: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
]

afterEach(cleanup)

describe('PhoneMapSearch', () => {
  it('drags the category strip without toggling a category and keeps normal clicks', () => {
    const toggle = vi.fn()
    const { container } = render(<PhoneMapSearch items={items} categories={categories} locale="de" hiddenCategoryIds={new Set()}
      getItemIconUrl={() => '/icon.png'} onToggleCategory={toggle} onChooseItem={vi.fn()} />)
    const strip = container.querySelector<HTMLDivElement>('.map-client-categories')!
    Object.defineProperties(strip, { clientWidth: { value: 100 }, scrollWidth: { value: 300 } })
    const category = screen.getByRole('button', { name: 'Tiere' })
    fireEvent.mouseDown(category, { button: 0, clientX: 200 })
    fireEvent.mouseMove(window, { buttons: 1, clientX: 130 })
    fireEvent.mouseUp(window)
    fireEvent.click(category, { detail: 1 })
    expect(strip.scrollLeft).toBe(70)
    expect(toggle).not.toHaveBeenCalled()
    fireEvent.mouseDown(category, { button: 0, clientX: 130 })
    fireEvent.mouseUp(window)
    fireEvent.click(category, { detail: 1 })
    expect(toggle).toHaveBeenCalledWith('animals')
  })
  it('finds all group members with their own icons or the category fallback and selects them by ID', () => {
    const choose = vi.fn()
    const grouped: MapItem = { ...items[0], iconAssetId: 'group-icon', members: [
      { id: 'lynx', title: 'Luchs', subtitle: '', description: '', facts: [], iconAssetId: 'lynx-icon', markerOverrides: { iconContentScale: 0.8 } },
      { id: 'fox', title: 'Fuchs', subtitle: '', description: '', facts: [] },
    ] }
    render(<PhoneMapSearch items={[grouped]} categories={[{ ...categories[0], defaultIconAssetId: 'category-icon' }]} locale="de" hiddenCategoryIds={new Set()}
      getItemIconUrl={(item) => `/${item.iconAssetId}.png`} onToggleCategory={vi.fn()} onChooseItem={choose} />)
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Luchs' } })
    const lynx = screen.getByRole('option', { name: 'Luchs Tiere' })
    expect(lynx.querySelector('img')).toHaveAttribute('src', '/lynx-icon.png')
    expect(lynx.querySelector('.map-client-search__result-icon')).toHaveStyle({ '--search-result-icon-scale': '0.8' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(choose).toHaveBeenLastCalledWith('lynx')
    fireEvent.change(search, { target: { value: 'Fuchs' } })
    const fox = screen.getByRole('option', { name: 'Fuchs Tiere' })
    expect(fox.querySelector('.map-client-search__result-default-icon')).toHaveStyle({ maskImage: 'url("/category-icon.png")', backgroundColor: categories[0].color })
    fireEvent.click(fox)
    expect(choose).toHaveBeenLastCalledWith('fox')
    expect(grouped.members![1].iconAssetId).toBeUndefined()
  })

  it.each(['hidden-group', 'hidden-category', 'visitor-filter'])('excludes group members when visibility is disabled: %s', (mode) => {
    render(<PhoneMapSearch items={[{ ...items[0], visible: mode !== 'hidden-group', members: [{ id: 'lynx', title: 'Luchs', subtitle: '', description: '', facts: [] }] }]}
      categories={[{ ...categories[0], visible: mode !== 'hidden-category' }]} locale="de" hiddenCategoryIds={new Set(mode === 'visitor-filter' ? ['animals'] : [])}
      getItemIconUrl={() => '/icon.png'} onToggleCategory={vi.fn()} onChooseItem={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Luchs' } })
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('ranks localized title prefixes and ignores accents', () => {
    expect(searchScore(items[0], categories[0], 'bar', 'de')).toBeGreaterThan(
      searchScore(items[1], categories[1], 'bar', 'de'),
    )
  })

  it('selects a suggestion and closes the results menu', () => {
    const onChooseItem = vi.fn()
    const { container } = render(
      <PhoneMapSearch
        items={items}
        categories={categories}
        locale="de"
        hiddenCategoryIds={new Set()}
        getItemIconUrl={(_item, category) => `/category-${category?.id}.png`}
        onToggleCategory={() => {}}
        onChooseItem={onChooseItem}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Karte durchsuchen' }), { target: { value: 'bär' } })
    expect(screen.getByRole('listbox', { name: 'Suchergebnisse' })).toBeInTheDocument()
    const fallbackIcon = container.querySelector('.map-client-search__result-default-icon')
    expect(fallbackIcon).toHaveStyle({ backgroundColor: '#4F8F64' })
    expect(fallbackIcon).toHaveStyle({ maskImage: 'url("/category-animals.png")' })
    fireEvent.click(screen.getByRole('option', { name: 'Bär Tiere' }))

    expect(onChooseItem).toHaveBeenCalledWith('bear')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('excludes disabled categories from suggestions and exposes category toggles', () => {
    const onToggleCategory = vi.fn()
    render(
      <PhoneMapSearch
        items={items}
        categories={categories}
        locale="en"
        hiddenCategoryIds={new Set(['animals'])}
        getItemIconUrl={(item) => `/${item.id}.png`}
        onToggleCategory={onToggleCategory}
        onChooseItem={() => {}}
      />,
    )

    const animalToggle = screen.getByRole('button', { name: 'Tiere' })
    expect(animalToggle).toHaveAttribute('aria-pressed', 'false')
    expect(animalToggle.querySelector('.map-client-categories__icon')).toHaveStyle({ backgroundColor: '#4F8F64' })
    const categoryScroller = screen.getByRole('group', { name: 'Categories' })
    fireEvent.wheel(categoryScroller, { deltaY: 80, deltaX: 0 })
    expect(categoryScroller.scrollLeft).toBe(80)
    fireEvent.click(animalToggle)
    expect(onToggleCategory).toHaveBeenCalledWith('animals')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the map' }), { target: { value: 'Bär' } })
    expect(screen.queryByRole('option', { name: 'Bär Tiere' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bären-Bistro Essen' })).toBeInTheDocument()
  })

  it.each(['animal', 'restaurant', 'restroom', 'souvenir', 'entrance', 'custom'] as CategoryType[])('shows a custom group member icon in its original colors despite the white reset (%s)', (type) => {
    const restroomCategory: MapCategory = {
      id: 'restrooms', name: 'Toiletten', type, color: '#2F79A8', defaultIconAssetId: null,
      colorizeIcon: false, iconContentScale: 0.7, visible: true, sortOrder: 0,
    }
    const restroom: MapItem = {
      ...items[0], id: 'wc-1', categoryId: restroomCategory.id, type, title: 'WC 1',
      members: [{ id: 'member', title: 'vova2', subtitle: '', description: '', facts: [], iconAssetId: 'own-icon', markerOverrides: { color: '#FFFFFF' } }],
    }
    const { container } = render(
      <PhoneMapSearch
        items={[restroom]}
        categories={[restroomCategory]}
        locale="de"
        hiddenCategoryIds={new Set()}
        getItemIconUrl={() => '/restroom.svg'}
        onToggleCategory={() => {}}
        onChooseItem={() => {}}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Karte durchsuchen' }), { target: { value: 'vova2' } })
    expect(container.querySelector('.map-client-search__result-icon img')).toHaveAttribute('src', '/restroom.svg')
    expect(container.querySelector('.map-client-search__result-default-icon')).not.toBeInTheDocument()
    expect(container.querySelector('.map-client-search__result-icon')).toHaveStyle({ '--search-result-icon-scale': '0.7' })
  })

  it('still applies an explicitly enabled tint to a custom icon', () => {
    const { container } = render(<PhoneMapSearch
      items={[{ ...items[1], iconAssetId: 'custom-icon', markerOverrides: { colorizeIcon: true, color: '#123456' } }]}
      categories={categories} locale="de" hiddenCategoryIds={new Set()}
      getItemIconUrl={() => '/custom.svg'} onToggleCategory={vi.fn()} onChooseItem={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Bistro' } })
    expect(container.querySelector('.map-client-search__result-icon img')).not.toBeInTheDocument()
    expect(container.querySelector('.map-client-search__result-default-icon')).toHaveStyle({ backgroundColor: '#123456', maskImage: 'url("/custom.svg")' })
  })
})
