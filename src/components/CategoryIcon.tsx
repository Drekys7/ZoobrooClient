import { Shapes } from 'lucide-react'
import type { CSSProperties } from 'react'

const categoryIcons: Record<string, string> = {
  animal: '/zooweb/icons/paw.png',
  restaurant: '/zooweb/icons/restaurant.png',
  restroom: '/zooweb/icons/restroom.png',
  souvenir: '/zooweb/icons/souvenir.png',
  entrance: '/zooweb/icons/entrance.png',
}

const customCategoryIcon = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
  '<g fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M8.3 10a.7.7 0 0 1-.63-1.08l3.73-6.16a.7.7 0 0 1 1.2 0l3.73 6.16a.7.7 0 0 1-.6 1.08Z"/>',
  '<rect width="7" height="7" x="3" y="14" rx="1"/>',
  '<circle cx="17.5" cy="17.5" r="3.5"/>',
  '</g></svg>',
].join('')

const customCategoryIconUrl = `data:image/svg+xml,${encodeURIComponent(customCategoryIcon)}`

export function getCategoryIconUrl(type: string): string {
  return categoryIcons[type] ? `${import.meta.env.BASE_URL}${categoryIcons[type].slice(1)}` : customCategoryIconUrl
}

export function CategoryIcon({ type, size = 16, className }: { type: string; size?: number | string; className?: string }) {
  const icon = categoryIcons[type] ? getCategoryIconUrl(type) : null
  if (!icon) return <Shapes size={size} className={className} />
  return <span
    className={`zooweb-category-glyph ${className ?? ''}`}
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      WebkitMaskImage: `url(${icon})`,
      maskImage: `url(${icon})`,
    } as CSSProperties}
  />
}
