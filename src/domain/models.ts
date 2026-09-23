import { z } from "zod";
import { TypographySchema } from './typography';
import { ZoneSettingsSchema } from './zones';

export const CURRENT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_MAP_BACKGROUND_COLOR = "#DDDDDD";
export const DEFAULT_MAP_SETTINGS = {
  minZoomScale: 0.5,
  maxZoomScale: 4,
  navigationPaddingX: 0.45,
  navigationPaddingY: 0.45,
  mapOutlineEnabled: false,
  mapOutlineWidth: 4,
  mapOutlineColor: "#FFFFFF",
} as const;

export const EntityIdSchema = z.string().trim().min(1);
export const IsoDateSchema = z.string().datetime();
export const CategoryTypeSchema = z.enum([
  "animal",
  "restaurant",
  "restroom",
  "souvenir",
  "entrance",
  "custom",
]);
export const MarkerStyleSchema = z.enum(["image", "circle", "pin"]);
export const EventFrequencySchema = z.enum(["once", "daily", "weekly", "monthly"]);
export const WeekdaySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
export const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const LocaleCodeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
export const LocalizedCategoryContentSchema = z.object({ name: z.string() });
export const LocalizedFactContentSchema = z.object({ label: z.string(), value: z.string() });
export const LocalizedItemContentSchema = z.object({ title: z.string(), subtitle: z.string(), description: z.string() });
export const LocalizedEventContentSchema = z.object({ title: z.string(), description: z.string(), location: z.string() });

export const NormalizedPositionSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

export const MapBackgroundColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .default(DEFAULT_MAP_BACKGROUND_COLOR);

export const MapSettingsSchema = z.object({
  factIcons: z.array(z.object({ id: EntityIdSchema, label: z.string().trim().min(1) })).optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  zones: ZoneSettingsSchema.optional(),
  typography: TypographySchema.optional(),
  minZoomScale: z.number().finite().positive().default(DEFAULT_MAP_SETTINGS.minZoomScale),
  maxZoomScale: z.number().finite().positive().default(DEFAULT_MAP_SETTINGS.maxZoomScale),
  navigationPaddingX: z.number().finite().min(0).max(1).default(DEFAULT_MAP_SETTINGS.navigationPaddingX),
  navigationPaddingY: z.number().finite().min(0).max(1).default(DEFAULT_MAP_SETTINGS.navigationPaddingY),
  mapOutlineEnabled: z.boolean().default(DEFAULT_MAP_SETTINGS.mapOutlineEnabled),
  mapOutlineWidth: z.number().finite().min(0.5).max(30).default(DEFAULT_MAP_SETTINGS.mapOutlineWidth),
  mapOutlineColor: z.string().regex(/^#[0-9a-f]{6}$/i).default(DEFAULT_MAP_SETTINGS.mapOutlineColor),
});

export const MapFactSchema = z.object({
  id: EntityIdSchema,
  label: z.string().trim().min(1),
  value: z.string(),
  iconAssetId: EntityIdSchema.nullish(),
  translations: z.record(LocaleCodeSchema, LocalizedFactContentSchema.partial()).optional(),
});

export const MapCategorySchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1),
  type: CategoryTypeSchema,
  color: z.string().trim().min(1),
  defaultIconAssetId: EntityIdSchema.nullish(),
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
  sortOrder: z.number().int().nonnegative(),
  translations: z.record(LocaleCodeSchema, LocalizedCategoryContentSchema.partial()).optional(),
});

export const MarkerOverridesSchema = z.object({
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
});

export const PhotoCreditSchema = z.object({
  author: z.string(), source: z.string().url().startsWith('https://'),
  license: z.string(), licenseUrl: z.string().url().startsWith('https://'), changes: z.string(),
});

const MapItemBaseSchema = z.object({
  id: EntityIdSchema,
  categoryId: EntityIdSchema,
  type: CategoryTypeSchema,
  title: z.string().trim().min(1),
  subtitle: z.string(),
  description: z.string(),
  iconAssetId: EntityIdSchema.nullish(),
  imageAssetId: EntityIdSchema.nullish(),
  imageAssetIds: z.array(EntityIdSchema).optional(),
  imageCredits: z.record(PhotoCreditSchema).optional(),
  colorOverride: z.string().regex(/^#[0-9a-f]{6}$/i).nullish(),
  markerOverrides: MarkerOverridesSchema.nullish(),
  position: NormalizedPositionSchema,
  facts: z.array(MapFactSchema),
  visible: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  translations: z.record(LocaleCodeSchema, LocalizedItemContentSchema.partial()).optional(),
});

// Members have their own content and icon styling, but share the parent's map location.
export const MapGroupMemberSchema = MapItemBaseSchema.pick({
  id: true, title: true, subtitle: true, description: true,
  imageAssetId: true, imageAssetIds: true, imageCredits: true, facts: true, translations: true,
  iconAssetId: true, colorOverride: true, markerOverrides: true,
});
export const MapItemSchema = MapItemBaseSchema.extend({
  members: z.array(MapGroupMemberSchema).optional(),
  groupBadgeColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullish(),
});

export const EventRecurrenceSchema = z
  .object({
    frequency: EventFrequencySchema,
    interval: z.number().int().min(1).max(52).default(1),
    weekdays: z.array(WeekdaySchema).default([]),
    monthDays: z.array(z.number().int().min(1).max(31)).default([]),
    endsOn: CalendarDateSchema.nullable().default(null),
    excludedDates: z.array(CalendarDateSchema).default([]),
  })
  .superRefine((recurrence, context) => {
    if (recurrence.frequency === "weekly" && recurrence.weekdays.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Weekly events need at least one weekday", path: ["weekdays"] });
    }
    if (recurrence.frequency === "monthly" && recurrence.monthDays.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Monthly events need at least one day", path: ["monthDays"] });
    }
  });

export const MapEventSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1),
  description: z.string(),
  location: z.string(),
  relatedItemId: EntityIdSchema.nullish(),
  startDate: CalendarDateSchema,
  startTime: ClockTimeSchema,
  endTime: ClockTimeSchema.nullish(),
  recurrence: EventRecurrenceSchema,
  visible: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  translations: z.record(LocaleCodeSchema, LocalizedEventContentSchema.partial()).optional(),
});

export const MapProjectSchema = z
  .object({
    id: EntityIdSchema,
    title: z.string().trim().min(1),
    schemaVersion: z.number().int().positive(),
    backgroundAssetId: EntityIdSchema.nullable(),
    backgroundWidth: z.number().int().positive().nullable(),
    backgroundHeight: z.number().int().positive().nullable(),
    backgroundColor: MapBackgroundColorSchema,
    mapSettings: MapSettingsSchema.default(DEFAULT_MAP_SETTINGS),
    defaultLocale: LocaleCodeSchema.default("de"),
    enabledLocales: z.array(LocaleCodeSchema).min(1).default(["de"]),
    categories: z.array(MapCategorySchema),
    items: z.array(MapItemSchema),
    events: z.array(MapEventSchema).default([]),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .superRefine((project, context) => {
    const categoryIds = new Set<string>();
    if (!project.enabledLocales.includes(project.defaultLocale)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Default locale must be enabled", path: ["defaultLocale"] });
    }
    if (new Set(project.enabledLocales).size !== project.enabledLocales.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Enabled locales must be unique", path: ["enabledLocales"] });
    }
    for (const category of project.categories) {
      if (categoryIds.has(category.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate category id: ${category.id}` });
      }
      categoryIds.add(category.id);
    }

    const itemIds = new Set<string>();
    for (const item of project.items) {
      if (itemIds.has(item.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate item id: ${item.id}` });
      }
      itemIds.add(item.id);
      for (const member of item.members ?? []) {
        if (itemIds.has(member.id) || project.items.some((root) => root.id === member.id)) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate member id: ${member.id}` });
        }
        itemIds.add(member.id);
      }
      if (!categoryIds.has(item.categoryId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Item ${item.id} references unknown category ${item.categoryId}`,
        });
      }
    }

    const hasBackground = project.backgroundAssetId !== null;
    if (hasBackground !== (project.backgroundWidth !== null && project.backgroundHeight !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Background id, width and height must either all be present or all be null",
      });
    }

    const eventIds = new Set<string>();
    for (const event of project.events) {
      if (eventIds.has(event.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate event id: ${event.id}` });
      }
      eventIds.add(event.id);
      if (event.relatedItemId && !project.items.some((item) => item.id === event.relatedItemId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Event ${event.id} references unknown item ${event.relatedItemId}` });
      }
    }
  });

export const AssetKindSchema = z.enum(["background", "image", "icon", "font"]);

export const AssetSchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().int().nonnegative(),
  kind: AssetKindSchema,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  createdAt: IsoDateSchema,
});

export type CategoryType = z.infer<typeof CategoryTypeSchema>;
export type MarkerStyle = z.infer<typeof MarkerStyleSchema>;
export type NormalizedPosition = z.infer<typeof NormalizedPositionSchema>;
export type MapSettings = z.infer<typeof MapSettingsSchema>;
export type MapFact = z.infer<typeof MapFactSchema>;
export type MapCategory = z.infer<typeof MapCategorySchema>;
export type MarkerOverrides = z.infer<typeof MarkerOverridesSchema>;
export type MapItem = z.infer<typeof MapItemSchema>;
export type EventFrequency = z.infer<typeof EventFrequencySchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;
export type EventRecurrence = z.infer<typeof EventRecurrenceSchema>;
export type MapEvent = z.infer<typeof MapEventSchema>;
export type LocaleCode = z.infer<typeof LocaleCodeSchema>;
export type MapProject = z.infer<typeof MapProjectSchema>;
export type AssetKind = z.infer<typeof AssetKindSchema>;
export type Asset = z.infer<typeof AssetSchema>;

export function categoryMarkerStyle(category: Pick<MapCategory, "type" | "markerStyle">): MarkerStyle {
  return category.markerStyle ?? (category.type === "animal" ? "image" : "circle");
}

export function categoryIconScale(category: Pick<MapCategory, "iconScale">): number {
  return category.iconScale ?? 1;
}

export function categoryIconContentScale(category: Pick<MapCategory, "iconContentScale">): number {
  return category.iconContentScale ?? 1;
}


export function categoryIconBackgroundColor(category: Pick<MapCategory, "iconBackgroundColor">): string {
  return category.iconBackgroundColor ?? "#FFFFFF";
}

export function categoryColorizeIcon(category: Pick<MapCategory, "colorizeIcon">): boolean {
  return category.colorizeIcon ?? false;
}

export function categoryOutlineEnabled(category: Pick<MapCategory, "outlineEnabled">): boolean {
  return category.outlineEnabled ?? false;
}

export function categoryOutlineWidth(category: Pick<MapCategory, "outlineWidth">): number {
  return category.outlineWidth ?? 2;
}

export function categoryOutlineColor(category: Pick<MapCategory, "outlineColor">): string {
  return category.outlineColor ?? "#FF0000";
}

export function categoryShadowEnabled(category: Pick<MapCategory, "shadowEnabled">): boolean {
  return category.shadowEnabled ?? true;
}

export function categoryShadowBlur(category: Pick<MapCategory, "shadowBlur">): number {
  return category.shadowBlur ?? 10;
}

export function categoryShadowOpacity(category: Pick<MapCategory, "shadowOpacity">): number {
  return category.shadowOpacity ?? 22;
}

export function categoryShadowColor(category: Pick<MapCategory, "shadowColor">): string {
  return category.shadowColor ?? "#000000";
}
