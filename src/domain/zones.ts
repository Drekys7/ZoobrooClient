import { z } from 'zod'
import { TypographySchema } from './typography'

const color = z.string().regex(/^#[0-9a-f]{6}$/i)
export const ZoneAppearanceSchema = z.object({
  textColor: color.default('#18201C'),
  backgroundColor: color.default('#FFFFFA'),
  borderColor: color.default('#34423B'),
  fontSize: z.number().finite().min(10).max(72).default(20),
  fontWeight: z.number().int().min(100).max(900).default(700),
  uppercase: z.boolean().optional(),
  borderWidth: z.number().finite().min(0).max(8).default(1),
  borderRadius: z.number().finite().min(0).max(32).default(2),
  paddingX: z.number().finite().min(2).max(40).default(10),
  paddingY: z.number().finite().min(2).max(30).default(4),
  maxWidth: z.number().finite().min(80).max(500).default(300),
})
// Keep old per-label appearance readable when importing existing projects.
export const ZoneSchema = ZoneAppearanceSchema.extend({
  id: z.string().min(1),
  title: z.string().max(160),
  translations: z.record(z.string(), z.string().max(160)).default({}),
  position: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }),
  visible: z.boolean().default(true),
})
export const ZoneSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().finite().min(0.1).max(4).default(1),
  typography: TypographySchema.optional(),
  appearance: ZoneAppearanceSchema.optional(),
  labels: z.array(ZoneSchema).max(200).default([]).refine(labels => new Set(labels.map(zone => zone.id)).size === labels.length, 'Duplicate zone IDs'),
})
export type Zone = z.infer<typeof ZoneSchema>
export function zoneTitle(zone: Zone, locale: string, defaultLocale: string): string {
  return (locale !== defaultLocale ? zone.translations[locale]?.trim() : '') || zone.title || 'Unbenannte Zone'
}
export type ZoneSettings = z.infer<typeof ZoneSettingsSchema>
export const DEFAULT_ZONES: ZoneSettings = { enabled: true, threshold: 1, labels: [] }
export function zoneAppearance(settings: ZoneSettings | undefined) {
  return settings?.appearance ?? ZoneAppearanceSchema.parse(settings?.labels[0] ?? {})
}
export function showZones(settings: ZoneSettings | undefined, zoomScale: number): boolean {
  return Boolean(settings?.enabled && settings.labels.some(zone => zone.visible && zone.title.trim()) && zoomScale <= settings.threshold)
}
