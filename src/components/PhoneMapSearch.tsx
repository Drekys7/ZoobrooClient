import { Languages, Search, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { categoryColorizeIcon, categoryIconContentScale, type MapCategory, type MapItem } from '../domain/models'
import { groupEntries, itemIconAssetId, itemIconColor } from '../domain/groups'
import { getCategoryIconUrl } from './CategoryIcon'
import { visitorCopy } from './visitor-i18n'
import { useMouseDragScroll } from '../hooks/useMouseDragScroll'

interface PhoneMapSearchProps {
  items: readonly MapItem[]
  categories: readonly MapCategory[]
  showCategories?: boolean
  locale: string
  enabledLocales?: readonly string[]
  languageMenuOpen?: boolean
  hiddenCategoryIds: ReadonlySet<string>
  getLocaleName?: (locale: string) => string
  getItemIconUrl: (item: MapItem, category: MapCategory | undefined) => string
  getCategoryIconUrl?: (category: MapCategory) => string | null | undefined
  onLanguageMenuOpenChange?: (open: boolean) => void
  onChooseLocale?: (locale: string) => void
  onToggleCategory: (categoryId: string) => void
  onChooseItem: (itemId: string) => void
}

function normalized(value: string, locale: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(locale)
    .trim()
}

export function searchScore(item: MapItem, category: MapCategory | undefined, query: string, locale: string): number {
  const needle = normalized(query, locale)
  if (!needle) return 0

  const title = normalized(item.title, locale)
  const subtitle = normalized(item.subtitle, locale)
  const categoryName = normalized(category?.name ?? '', locale)
  if (title === needle) return 1000
  if (title.startsWith(needle)) return 900 - Math.min(title.length - needle.length, 100)
  if (title.split(/\s+/).some((word) => word.startsWith(needle))) return 750

  const titleIndex = title.indexOf(needle)
  if (titleIndex >= 0) return 650 - Math.min(titleIndex, 100)
  if (subtitle.startsWith(needle)) return 450
  if (subtitle.includes(needle)) return 350
  if (categoryName.includes(needle)) return 200
  return 0
}

export function PhoneMapSearch({
  items,
  categories,
  showCategories = true,
  locale,
  enabledLocales = [locale],
  languageMenuOpen = false,
  hiddenCategoryIds,
  getLocaleName = (code) => code.toUpperCase(),
  getItemIconUrl,
  getCategoryIconUrl: resolveCategoryIconUrl,
  onLanguageMenuOpenChange,
  onChooseLocale,
  onToggleCategory,
  onChooseItem,
}: PhoneMapSearchProps) {
  const copy = visitorCopy(locale)
  const dragCategories = useMouseDragScroll('x')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const categoriesRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [resultsOpen, setResultsOpen] = useState(false)
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.visible && items.some((item) => item.visible && item.categoryId === category.id)),
    [categories, items],
  )
  useLayoutEffect(() => {
    const strip = categoriesRef.current
    if (!strip) return
    const updateEdges = () => {
      const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth)
      const offset = Math.max(0, Math.min(maxScroll, strip.scrollLeft))
      const opacity = (hidden: number) => hidden > 1 ? Math.min(1, hidden / 32) : 0
      strip.style.setProperty('--category-fade-start-opacity', String(opacity(offset)))
      strip.style.setProperty('--category-fade-end-opacity', String(opacity(maxScroll - offset)))
    }
    updateEdges()
    strip.addEventListener('scroll', updateEdges, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges)
    resize?.observe(strip)
    // Button widths also change when fonts load or category names are translated.
    for (const child of strip.children) resize?.observe(child)
    return () => { strip.removeEventListener('scroll', updateEdges); resize?.disconnect() }
  }, [showCategories, visibleCategories])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return items
      .flatMap(groupEntries)
      .filter((item) => {
        const category = categoriesById.get(item.categoryId)
        return item.visible && category?.visible && !hiddenCategoryIds.has(item.categoryId)
      })
      .map((item) => ({ item, category: categoriesById.get(item.categoryId), score: searchScore(item, categoriesById.get(item.categoryId), query, locale) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, locale))
      .slice(0, 6)
  }, [categoriesById, hiddenCategoryIds, items, locale, query])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setResultsOpen(false)
        onLanguageMenuOpenChange?.(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onLanguageMenuOpenChange])

  const choose = (item: MapItem) => {
    setQuery(item.title)
    setResultsOpen(false)
    onChooseItem(item.id)
  }

  return (
    <div className="map-client-search" ref={rootRef}>
      <div className="map-client-search__field">
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <div className="map-client-search__input-slot">
        <input
          type="search"
          value={query}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchLabel}
          aria-expanded={resultsOpen && Boolean(query.trim())}
          aria-controls="map-client-search-results"
          onChange={(event) => {
            setQuery(event.target.value)
            setResultsOpen(true)
            onLanguageMenuOpenChange?.(false)
          }}
          onFocus={() => {
            setResultsOpen(true)
            onLanguageMenuOpenChange?.(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setResultsOpen(false)
            if (event.key === 'Enter' && results[0]) choose(results[0].item)
          }}
        />
        </div>
        {query ? (
          <button type="button" aria-label={copy.clearSearch} onClick={() => { setQuery(''); setResultsOpen(false) }}>
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="map-client-search__language-button"
          aria-label={copy.language}
          title={copy.language}
          aria-expanded={languageMenuOpen}
          onClick={() => {
            setResultsOpen(false)
            onLanguageMenuOpenChange?.(!languageMenuOpen)
          }}
        >
          <Languages size={15} strokeWidth={1.9} aria-hidden="true" />
          <span>{locale.toUpperCase()}</span>
        </button>
      </div>

      {languageMenuOpen ? (
        <div className="map-client-search__language-menu" role="menu">
          {enabledLocales.map((availableLocale) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === availableLocale}
              className={locale === availableLocale ? 'is-active' : ''}
              key={availableLocale}
              onClick={() => onChooseLocale?.(availableLocale)}
            >
              <strong>{availableLocale.toUpperCase()}</strong>
              <span>{getLocaleName(availableLocale)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {resultsOpen && query.trim() ? (
        <div className="map-client-search__results" id="map-client-search-results" role="listbox" aria-label={copy.searchResults}>
          {results.length ? results.map(({ item, category }) => {
            const iconAssetId = itemIconAssetId(item, category)
            const iconUrl = getItemIconUrl({ ...item, iconAssetId }, category)
            const iconColor = itemIconColor(item, category)
            const colorizeIcon = categoryColorizeIcon({ colorizeIcon: item.markerOverrides?.colorizeIcon ?? category?.colorizeIcon })
            const iconContentScale = categoryIconContentScale({ iconContentScale: item.markerOverrides?.iconContentScale ?? category?.iconContentScale })
            return (
              <button type="button" role="option" aria-selected="false" key={item.id} onClick={() => choose(item)}>
                <span className="map-client-search__result-icon" style={{ '--search-result-icon-scale': iconContentScale } as CSSProperties}>
                  {item.iconAssetId && !colorizeIcon ? <img src={iconUrl} alt="" /> : (
                    <span
                      className="map-client-search__result-default-icon"
                      aria-hidden="true"
                      style={{ backgroundColor: iconColor, WebkitMaskImage: `url("${iconUrl}")`, maskImage: `url("${iconUrl}")` } as CSSProperties}
                    />
                  )}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{category?.name}</small>
                </span>
              </button>
            )
          }) : <p>{copy.noSearchResults}</p>}
        </div>
      ) : null}

      {showCategories && <div
        ref={categoriesRef}
        className="map-client-categories"
        {...dragCategories}
        role="group"
        aria-label={copy.categories}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY
        }}
      >
        {visibleCategories.map((category) => {
          const active = !hiddenCategoryIds.has(category.id)
          const customIconUrl = resolveCategoryIconUrl?.(category)
          const iconUrl = customIconUrl || getCategoryIconUrl(category.type)
          return (
            <button
              type="button"
              key={category.id}
              className={active ? 'is-active' : ''}
              aria-pressed={active}
              title={category.name}
              onClick={() => onToggleCategory(category.id)}
            >
              {customIconUrl && !categoryColorizeIcon(category) ? <img
                className="map-client-categories__icon"
                src={customIconUrl}
                alt=""
                style={{ objectFit: 'contain' }}
              /> : <span
                className="map-client-categories__icon"
                aria-hidden="true"
                style={{ backgroundColor: category.color, WebkitMaskImage: `url("${iconUrl}")`, maskImage: `url("${iconUrl}")` } as CSSProperties}
              />}
              <span>{category.name}</span>
            </button>
          )
        })}
      </div>}
    </div>
  )
}
