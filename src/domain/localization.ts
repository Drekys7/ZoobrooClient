import { MapProjectSchema, type LocaleCode, type MapCategory, type MapEvent, type MapFact, type MapItem, type MapProject } from './models'
import { groupEntries } from './groups'

export const AVAILABLE_LOCALES: ReadonlyArray<{ code: LocaleCode; label: string; nativeLabel: string }> = [
  { code: 'de', label: 'Deutsch', nativeLabel: 'Deutsch' },
  { code: 'en', label: 'Englisch', nativeLabel: 'English' },
  { code: 'nl', label: 'Niederländisch', nativeLabel: 'Nederlands' },
  { code: 'pl', label: 'Polnisch', nativeLabel: 'Polski' },
  { code: 'fr', label: 'Französisch', nativeLabel: 'Français' },
  { code: 'es', label: 'Spanisch', nativeLabel: 'Español' },
  { code: 'it', label: 'Italienisch', nativeLabel: 'Italiano' },
  { code: 'da', label: 'Dänisch', nativeLabel: 'Dansk' },
]

function translated<T extends Record<string, string>>(
  fallback: T,
  translations: Record<string, Partial<T>> | undefined,
  locale: string,
  defaultLocale: string,
): T {
  const preferred = translations?.[locale]
  const primary = translations?.[defaultLocale]
  const first = Object.values(translations ?? {}).find(Boolean)
  return Object.fromEntries(Object.entries(fallback).map(([key, value]) => [
    key,
    preferred?.[key] ?? primary?.[key] ?? first?.[key] ?? value,
  ])) as T
}

export function localizeCategory(category: MapCategory, locale: string, defaultLocale: string): MapCategory {
  return { ...category, ...translated({ name: category.name }, category.translations, locale, defaultLocale) }
}

export function localizeFact(fact: MapFact, locale: string, defaultLocale: string): MapFact {
  return { ...fact, ...translated({ label: fact.label, value: fact.value }, fact.translations, locale, defaultLocale) }
}

export function localizeItem(item: MapItem, locale: string, defaultLocale: string): MapItem {
  const content = translated({ title: item.title, subtitle: item.subtitle, description: item.description }, item.translations, locale, defaultLocale)
  return {
    ...item,
    ...content,
    subtitle: item.type === 'animal' ? '' : content.subtitle,
    facts: item.facts.map((fact) => localizeFact(fact, locale, defaultLocale)),
    members: item.members?.map((member) => ({
      ...member,
      ...translated({ title: member.title, subtitle: member.subtitle, description: member.description }, member.translations, locale, defaultLocale),
      facts: member.facts.map((fact) => localizeFact(fact, locale, defaultLocale)),
    })),
  }
}

export function localizeEvent(event: MapEvent, locale: string, defaultLocale: string): MapEvent {
  return { ...event, ...translated({ title: event.title, description: event.description, location: event.location }, event.translations, locale, defaultLocale) }
}

export function localeName(code: string): string {
  return AVAILABLE_LOCALES.find((locale) => locale.code === code)?.nativeLabel ?? code.toUpperCase()
}

export function hasTranslationValue(translation: Record<string, unknown> | undefined, key: string): boolean {
  return typeof translation?.[key] === 'string' && String(translation[key]).trim().length > 0
}

export function stripItemSubtitleTranslations(translations: MapItem['translations']): MapItem['translations'] {
  if (!translations) return translations
  return Object.fromEntries(Object.entries(translations).map(([locale, content]) => {
    const { subtitle: _subtitle, ...rest } = content
    void _subtitle
    return [locale, rest]
  }))
}

export function translationCompletion(
  locale: string,
  defaultLocale: string,
  categories: readonly MapCategory[],
  items: readonly MapItem[],
  events: readonly MapEvent[],
): number {
  if (locale === defaultLocale) return 100
  let complete = 0
  let total = 0
  const count = (translation: Record<string, unknown> | undefined, keys: string[]) => {
    total += keys.length
    complete += keys.filter((key) => hasTranslationValue(translation, key)).length
  }
  categories.forEach((category) => count(category.translations?.[locale], ['name']))
  items.flatMap(groupEntries).forEach((item) => {
    count(item.translations?.[locale], item.type === 'animal' ? ['title', 'description'] : ['title', 'subtitle', 'description'])
    item.facts.forEach((fact) => count(fact.translations?.[locale], ['label', 'value']))
  })
  events.forEach((event) => count(event.translations?.[locale], ['title', 'description', 'location']))
  return total === 0 ? 100 : Math.round((complete / total) * 100)
}

/** Materializes legacy text as a real translation before the main language can change. */
export function seedProjectTranslations(project: MapProject): MapProject {
  const locale = project.defaultLocale ?? 'de'
  return MapProjectSchema.parse({
    ...project,
    defaultLocale: locale,
    enabledLocales: project.enabledLocales?.length ? project.enabledLocales : [locale],
    categories: project.categories.map((category) => ({
      ...category,
      translations: { [locale]: { name: category.name }, ...(category.translations ?? {}) },
    })),
    items: project.items.map((item) => {
      const translations = { [locale]: { title: item.title, ...(item.type === 'animal' ? {} : { subtitle: item.subtitle }), description: item.description }, ...(item.translations ?? {}) }
      return {
        ...item,
        subtitle: item.type === 'animal' ? '' : item.subtitle,
        translations: item.type === 'animal' ? stripItemSubtitleTranslations(translations) : translations,
        facts: item.facts.map((fact) => ({
          ...fact,
          translations: { [locale]: { label: fact.label, value: fact.value }, ...(fact.translations ?? {}) },
        })),
        members: item.members?.map((member) => ({
          ...member,
          translations: { [locale]: { title: member.title, ...(item.type === 'animal' ? {} : { subtitle: member.subtitle }), description: member.description }, ...(member.translations ?? {}) },
          facts: member.facts.map((fact) => ({
            ...fact,
            translations: { [locale]: { label: fact.label, value: fact.value }, ...(fact.translations ?? {}) },
          })),
        })),
      }
    }),
    events: project.events.map((event) => ({
      ...event,
      translations: { [locale]: { title: event.title, description: event.description, location: event.location }, ...(event.translations ?? {}) },
    })),
  })
}
