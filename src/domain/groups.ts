import type { MapCategory, MapItem } from './models'

export const DEFAULT_GROUP_BADGE_COLOR = '#2F7D59'

/** Adapts members for shared editors/cards without inheriting the root's custom fields. */
export function groupEntries(item: MapItem): MapItem[] {
  return [item, ...(item.members ?? []).map((member) => ({
    ...item, ...member, members: undefined,
    imageAssetId: member.imageAssetId ?? null, imageAssetIds: member.imageAssetIds,
    translations: member.translations,
    iconAssetId: member.iconAssetId ?? null,
    colorOverride: member.colorOverride ?? null, markerOverrides: member.markerOverrides ?? null,
  }))]
}

export function itemIconAssetId(item: Pick<MapItem, 'iconAssetId'>, category?: Pick<MapCategory, 'defaultIconAssetId'>): string | null {
  return item.iconAssetId ?? category?.defaultIconAssetId ?? null
}

export function itemIconColor(item: Pick<MapItem, 'iconAssetId' | 'markerOverrides' | 'colorOverride'>, category?: Pick<MapCategory, 'color'>): string {
  const categoryColor = category?.color ?? '#315F4B'
  return item.iconAssetId ? item.markerOverrides?.color ?? item.colorOverride ?? categoryColor : categoryColor
}

export function itemImageIds(item: Pick<MapItem, 'imageAssetIds' | 'imageAssetId'>): string[] {
  return item.imageAssetIds ?? (item.imageAssetId ? [item.imageAssetId] : [])
}
