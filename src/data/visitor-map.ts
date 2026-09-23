import type { MapCategory, MapFact, MapItem, MapSettings } from '../domain/models'
import type { Typography } from '../domain/typography'
import { itemIconAssetId } from '../domain/groups'
import type { PublishedAsset, PublishedZooMap, PublishedMapItem } from '../public-contract/published-zoo-map'

export function toVisitorMap(snapshot: import('./map-repository').PreparedMap) {
  const assetUrls: Record<string, string> = {}
  const assetId = (asset: PublishedAsset | null | undefined) => {
    if (!asset) return null
    if (assetUrls[asset.assetId] && assetUrls[asset.assetId] !== asset.url) throw new Error(`Conflicting asset: ${asset.assetId}`)
    assetUrls[asset.assetId] = asset.url
    return asset.assetId
  }
  const typography = (value?: PublishedZooMap['mapSettings']['typography']): Typography | undefined => value && ({
    preset: value.preset, regularAssetId: assetId(value.regular), boldAssetId: assetId(value.bold), variable: value.variable,
  })
  const content = (item: PublishedMapItem | NonNullable<PublishedMapItem['members']>[number]) => {
    const { icon, image, images, facts, ...rest } = item
    return { ...rest, iconAssetId: assetId(icon), imageAssetId: assetId(image),
      imageAssetIds: images?.map(asset => assetId(asset)!),
      facts: facts.map(({ icon, ...fact }) => ({ ...fact, iconAssetId: assetId(icon) })),
    }
  }
  const items: MapItem[] = snapshot.items.map(item => ({ ...item, ...content(item), members: item.members?.map(content) }))
  const categories: MapCategory[] = snapshot.categories.map(({ defaultIcon, ...category }) => ({ ...category, defaultIconAssetId: assetId(defaultIcon) }))
  const mapSettings: MapSettings = { ...snapshot.mapSettings, typography: typography(snapshot.mapSettings.typography),
    zones: snapshot.mapSettings.zones && { ...snapshot.mapSettings.zones, typography: typography(snapshot.mapSettings.zones.typography) },
  }
  return {
    snapshot, raster: snapshot.raster, items, categories, mapSettings, events: snapshot.events, assetUrls,
    defaultLocale: snapshot.defaultLocale, enabledLocales: snapshot.enabledLocales,
    backgroundUrl: snapshot.background.url, backgroundWidth: snapshot.background.width,
    backgroundHeight: snapshot.background.height, backgroundColor: snapshot.background.color,
    getItemIconUrl: (item: MapItem, category?: MapCategory) => assetUrls[itemIconAssetId(item, category) ?? ''],
    getCategoryIconUrl: (category: MapCategory) => assetUrls[category.defaultIconAssetId ?? ''],
    getItemImageUrl: (item: MapItem) => assetUrls[item.imageAssetIds?.[0] ?? item.imageAssetId ?? ''],
    getItemImageUrls: (item: MapItem) => (item.imageAssetIds ?? (item.imageAssetId ? [item.imageAssetId] : [])).map(id => assetUrls[id]).filter(Boolean),
    getFactIconUrl: (fact: MapFact) => assetUrls[fact.iconAssetId ?? ''],
  }
}
export type VisitorMap = ReturnType<typeof toVisitorMap>
