import { z } from 'zod'
import { FontPresetSchema } from '../domain/typography'
import { ZoneSettingsSchema } from '../domain/zones'

const idSchema = z.string().trim().min(1)
const dateTimeSchema = z.string().datetime({ offset: true })

export const MapCategoryTypeSchema = z.enum([
  'animal',
  'restaurant',
  'restroom',
  'souvenir',
  'entrance',
  'custom',
])
export const MarkerStyleSchema = z.enum(['image', 'circle', 'pin'])
export const EventFrequencySchema = z.enum(['once', 'daily', 'weekly', 'monthly'])
export const WeekdaySchema = z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const localeCodeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
const defaultMapSettings = {
  minZoomScale: 0.5,
  maxZoomScale: 4,
  navigationPaddingX: 0.45,
  navigationPaddingY: 0.45,
  mapOutlineEnabled: false,
  mapOutlineWidth: 4,
  mapOutlineColor: '#FFFFFF',
}

export const PublishedAssetSchema = z
  .object({
    assetId: idSchema,
    url: z.string().trim().min(1),
  })
  .strict()

export const PublishedBackgroundSchema = PublishedAssetSchema.extend({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#DDDDDD'),
}).strict()

export const PublishedTypographySchema = z.object({
    preset: FontPresetSchema,
    regular: PublishedAssetSchema.nullable(),
    bold: PublishedAssetSchema.nullable(),
    variable: z.boolean(),
  }).strict()

export const PublishedMapSettingsSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  typography: PublishedTypographySchema.optional(),
  zones: ZoneSettingsSchema.omit({ typography: true }).extend({ typography: PublishedTypographySchema.optional() }).optional(),
  minZoomScale: z.number().finite().positive().default(defaultMapSettings.minZoomScale),
  maxZoomScale: z.number().finite().positive().default(defaultMapSettings.maxZoomScale),
  navigationPaddingX: z.number().finite().min(0).max(1).default(defaultMapSettings.navigationPaddingX),
  navigationPaddingY: z.number().finite().min(0).max(1).default(defaultMapSettings.navigationPaddingY),
  mapOutlineEnabled: z.boolean().default(defaultMapSettings.mapOutlineEnabled),
  mapOutlineWidth: z.number().finite().min(0.5).max(30).default(defaultMapSettings.mapOutlineWidth),
  mapOutlineColor: z.string().regex(/^#[0-9a-f]{6}$/i).default(defaultMapSettings.mapOutlineColor),
  // Deprecated background-shadow fields stay readable so already published
  // snapshots remain valid. New admin exports no longer emit them.
  mapShadowEnabled: z.boolean().optional(),
  mapShadowBlur: z.number().finite().min(0).max(60).optional(),
  mapShadowOpacity: z.number().finite().min(0).max(100).optional(),
  mapShadowColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
}).strict()

export const NormalizedPositionSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict()

// Accept older snapshots without retaining the retired marker setting.
function discardLegacyMaskRadius(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const clean = {...input} as Record<string, unknown>
  delete clean.imageMaskRadius
  return clean
}

export const PublishedCategorySchema = z.preprocess(discardLegacyMaskRadius, z
  .object({
    id: idSchema,
    name: z.string().trim().min(1),
    type: MapCategoryTypeSchema,
    color: z.string().trim().min(1),
    defaultIcon: PublishedAssetSchema.nullable(),
    markerStyle: MarkerStyleSchema.optional(),
    iconScale: z.number().finite().min(0.5).max(2).optional(),
    iconContentScale: z.number().finite().min(0.5).max(1.5).optional(),
    iconBackgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    colorizeIcon: z.boolean().optional(),
    outlineEnabled: z.boolean().optional(),
    outlineWidth: z.number().finite().min(0.5).max(10).optional(),
    outlineColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    shadowEnabled: z.boolean().optional(),
    shadowBlur: z.number().finite().min(0).max(30).optional(),
    shadowOpacity: z.number().finite().min(0).max(100).optional(),
    shadowColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    visible: z.boolean(),
    sortOrder: z.number().int(),
    translations: z.record(localeCodeSchema, z.object({ name: z.string().optional() })).optional(),
  })
  .strict())

export const PublishedFactSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1),
    value: z.string(),
    icon: PublishedAssetSchema.nullable(),
    translations: z.record(localeCodeSchema, z.object({ label: z.string().optional(), value: z.string().optional() })).optional(),
  })
  .strict()

export const PublishedMarkerOverridesSchema = z.preprocess(discardLegacyMaskRadius, z
  .object({
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    markerStyle: MarkerStyleSchema.optional(),
    iconScale: z.number().finite().min(0.5).max(2).optional(),
    iconContentScale: z.number().finite().min(0.5).max(1.5).optional(),
    iconBackgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    colorizeIcon: z.boolean().optional(),
    outlineEnabled: z.boolean().optional(),
    outlineWidth: z.number().finite().min(0.5).max(10).optional(),
    outlineColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    shadowEnabled: z.boolean().optional(),
    shadowBlur: z.number().finite().min(0).max(30).optional(),
    shadowOpacity: z.number().finite().min(0).max(100).optional(),
    shadowColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  })
  .strict())

const PublishedMapItemBaseSchema = z
  .object({
    id: idSchema,
    categoryId: idSchema,
    type: MapCategoryTypeSchema,
    title: z.string().trim().min(1),
    subtitle: z.string(),
    description: z.string(),
    imageCredits: z.record(z.object({
      author: z.string(), source: z.string().url().startsWith('https://'), license: z.string(),
      licenseUrl: z.string().url().startsWith('https://'), changes: z.string(),
    })).optional(),
    icon: PublishedAssetSchema.nullable(),
    image: PublishedAssetSchema.nullable(),
    images: z.array(PublishedAssetSchema).optional(),
    colorOverride: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
    markerOverrides: PublishedMarkerOverridesSchema.nullable().optional(),
    position: NormalizedPositionSchema,
    facts: z.array(PublishedFactSchema),
    visible: z.boolean(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    translations: z.record(localeCodeSchema, z.object({ title: z.string().optional(), subtitle: z.string().optional(), description: z.string().optional() })).optional(),
  })
  .strict()

export const PublishedMapItemSchema = PublishedMapItemBaseSchema.extend({
  groupBadgeColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullish(),
  members: z.array(PublishedMapItemBaseSchema.pick({
    id: true, title: true, subtitle: true, description: true,
    image: true, images: true, imageCredits: true, facts: true, translations: true,
    colorOverride: true, markerOverrides: true,
  }).extend({ icon: PublishedAssetSchema.nullable().optional() })).optional(),
}).strict()

export const PublishedEventRecurrenceSchema = z.object({
  frequency: EventFrequencySchema,
  interval: z.number().int().min(1).max(52),
  weekdays: z.array(WeekdaySchema),
  monthDays: z.array(z.number().int().min(1).max(31)),
  endsOn: calendarDateSchema.nullable(),
  excludedDates: z.array(calendarDateSchema).default([]),
}).strict()

export const PublishedEventSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1),
  description: z.string(),
  location: z.string(),
  relatedItemId: idSchema.nullable(),
  startDate: calendarDateSchema,
  startTime: clockTimeSchema,
  endTime: clockTimeSchema.nullable(),
  recurrence: PublishedEventRecurrenceSchema,
  visible: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  translations: z.record(localeCodeSchema, z.object({ title: z.string().optional(), description: z.string().optional(), location: z.string().optional() })).optional(),
}).strict()

export const PublishedZooMapSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    projectId: idSchema,
    version: z.number().int().positive(),
    publishedAt: dateTimeSchema,
    background: PublishedBackgroundSchema,
    mapSettings: PublishedMapSettingsSchema.default(defaultMapSettings),
    defaultLocale: localeCodeSchema.default('de'),
    enabledLocales: z.array(localeCodeSchema).min(1).default(['de']),
    categories: z.array(PublishedCategorySchema),
    items: z.array(PublishedMapItemSchema),
    events: z.array(PublishedEventSchema).default([]),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (!snapshot.enabledLocales.includes(snapshot.defaultLocale)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Default locale must be enabled', path: ['defaultLocale'] })
    }
    if (new Set(snapshot.enabledLocales).size !== snapshot.enabledLocales.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enabled locales must be unique', path: ['enabledLocales'] })
    }
    const categoryIds = new Set<string>()

    for (const [index, category] of snapshot.categories.entries()) {
      if (categoryIds.has(category.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate category id: ${category.id}`,
          path: ['categories', index, 'id'],
        })
      }
      categoryIds.add(category.id)
    }

    const itemIds = new Set<string>()
    for (const [index, item] of snapshot.items.entries()) {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate item id: ${item.id}`,
          path: ['items', index, 'id'],
        })
      }
      itemIds.add(item.id)

      if (!categoryIds.has(item.categoryId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown category id: ${item.categoryId}`,
          path: ['items', index, 'categoryId'],
        })
      }
    }

    const eventIds = new Set<string>()
    for (const [index, event] of snapshot.events.entries()) {
      if (eventIds.has(event.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate event id: ${event.id}`, path: ['events', index, 'id'] })
      }
      eventIds.add(event.id)
      if (event.relatedItemId && !itemIds.has(event.relatedItemId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown item id: ${event.relatedItemId}`, path: ['events', index, 'relatedItemId'] })
      }
    }
  })

export type MapCategoryType = z.infer<typeof MapCategoryTypeSchema>
export type MarkerStyle = z.infer<typeof MarkerStyleSchema>
export type EventFrequency = z.infer<typeof EventFrequencySchema>
export type Weekday = z.infer<typeof WeekdaySchema>
export type PublishedAsset = z.infer<typeof PublishedAssetSchema>
export type PublishedBackground = z.infer<typeof PublishedBackgroundSchema>
export type PublishedMapSettings = z.infer<typeof PublishedMapSettingsSchema>
export type NormalizedPosition = z.infer<typeof NormalizedPositionSchema>
export type PublishedCategory = z.infer<typeof PublishedCategorySchema>
export type PublishedFact = z.infer<typeof PublishedFactSchema>
export type PublishedMarkerOverrides = z.infer<typeof PublishedMarkerOverridesSchema>
export type PublishedMapItem = z.infer<typeof PublishedMapItemSchema>
export type PublishedEventRecurrence = z.infer<typeof PublishedEventRecurrenceSchema>
export type PublishedEvent = z.infer<typeof PublishedEventSchema>
export type PublishedZooMap = z.infer<typeof PublishedZooMapSchema>

/**
 * Parses data crossing the public boundary and returns a typed snapshot.
 * Throws ZodError when the payload does not satisfy the public contract.
 */
export function validatePublishedZooMap(input: unknown): PublishedZooMap {
  return PublishedZooMapSchema.parse(input)
}
