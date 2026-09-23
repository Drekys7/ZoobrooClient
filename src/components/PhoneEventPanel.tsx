import { CalendarDays, Clock3, LocateFixed, MapPin, Repeat2, X } from 'lucide-react'
import type { MapEvent, MapItem, Weekday } from '../domain/models'
import { nextEventOccurrence, nextVisibleEventOccurrence, type EventOccurrence } from '../domain/eventSchedule'
import { visitorCopy } from './visitor-i18n'

interface PhoneEventPanelProps {
  events: readonly MapEvent[]
  items: readonly MapItem[]
  onFocusItem: (itemId: string) => void
  onClose: () => void
  now?: Date
  locale?: string
}

export { nextEventOccurrence, nextVisibleEventOccurrence, type EventOccurrence }

const weekdayLabels: Record<Weekday, string> = {
  monday: 'Mo',
  tuesday: 'Di',
  wednesday: 'Mi',
  thursday: 'Do',
  friday: 'Fr',
  saturday: 'Sa',
  sunday: 'So',
}

const localizedRecurrence = {
  en: { daily: 'Daily', everyDays: 'Every {n} days', weekly: 'Weekly', everyWeeks: 'Every {n} weeks', monthly: 'Monthly', everyMonths: 'Every {n} months' },
  nl: { daily: 'Dagelijks', everyDays: 'Elke {n} dagen', weekly: 'Wekelijks', everyWeeks: 'Elke {n} weken', monthly: 'Maandelijks', everyMonths: 'Elke {n} maanden' },
  pl: { daily: 'Codziennie', everyDays: 'Co {n} dni', weekly: 'Co tydzień', everyWeeks: 'Co {n} tygodni', monthly: 'Co miesiąc', everyMonths: 'Co {n} miesięcy' },
  fr: { daily: 'Tous les jours', everyDays: 'Tous les {n} jours', weekly: 'Chaque semaine', everyWeeks: 'Toutes les {n} semaines', monthly: 'Chaque mois', everyMonths: 'Tous les {n} mois' },
  es: { daily: 'Diariamente', everyDays: 'Cada {n} días', weekly: 'Semanalmente', everyWeeks: 'Cada {n} semanas', monthly: 'Mensualmente', everyMonths: 'Cada {n} meses' },
  it: { daily: 'Ogni giorno', everyDays: 'Ogni {n} giorni', weekly: 'Ogni settimana', everyWeeks: 'Ogni {n} settimane', monthly: 'Ogni mese', everyMonths: 'Ogni {n} mesi' },
  da: { daily: 'Dagligt', everyDays: 'Hver {n}. dag', weekly: 'Ugentligt', everyWeeks: 'Hver {n}. uge', monthly: 'Månedligt', everyMonths: 'Hver {n}. måned' },
} as const

function formatDate(value: string, locale = 'de'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}

export function eventRecurrenceLabel(event: MapEvent, locale = 'de'): string {
  const { recurrence } = event
  if (recurrence.frequency === 'once') return formatDate(event.startDate, locale)
  const translated = localizedRecurrence[locale as keyof typeof localizedRecurrence]
  if (translated) {
    if (recurrence.frequency === 'daily') return recurrence.interval === 1 ? translated.daily : translated.everyDays.replace('{n}', String(recurrence.interval))
    if (recurrence.frequency === 'weekly') {
      const days = recurrence.weekdays.map((day) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + Object.keys(weekdayLabels).indexOf(day))))).join(', ')
      return `${recurrence.interval === 1 ? translated.weekly : translated.everyWeeks.replace('{n}', String(recurrence.interval))} · ${days}`
    }
    const days = recurrence.monthDays.map((day) => `${day}.`).join(', ')
    return `${recurrence.interval === 1 ? translated.monthly : translated.everyMonths.replace('{n}', String(recurrence.interval))} · ${days}`
  }
  if (recurrence.frequency === 'daily') return recurrence.interval === 1 ? 'Täglich' : `Alle ${recurrence.interval} Tage`
  if (recurrence.frequency === 'weekly') {
    const days = recurrence.weekdays.map((day) => weekdayLabels[day]).join(', ')
    return recurrence.interval === 1 ? `Wöchentlich · ${days}` : `Alle ${recurrence.interval} Wochen · ${days}`
  }
  const days = recurrence.monthDays.map((day) => `${day}.`).join(', ')
  return recurrence.interval === 1 ? `Monatlich · ${days}` : `Alle ${recurrence.interval} Monate · ${days}`
}

export function PhoneEventPanel({ events, items, onFocusItem, onClose, now = new Date(), locale = 'de' }: PhoneEventPanelProps) {
  const copy = visitorCopy(locale)
  const visibleOccurrences = events
    .map((event) => nextEventOccurrence(event, now))
    .filter((occurrence): occurrence is EventOccurrence => Boolean(occurrence))
    .sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`))
  const itemsById = new Map(items.map((item) => [item.id, item]))

  return (
    <div className="map-client-events__overlay" onClick={onClose}>
      <section
        className="map-client-events__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-client-events-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="map-client-events__header">
          <span className="map-client-events__header-icon" aria-hidden="true"><CalendarDays size={19} strokeWidth={1.9} /></span>
          <div>
            <span>{copy.programme}</span>
            <h2 id="map-client-events-title">{copy.events}</h2>
          </div>
          <button type="button" aria-label={locale === 'de' ? 'Veranstaltungen schließen' : copy.close} onClick={onClose}><X size={15} strokeWidth={2} /></button>
        </header>

        <div className="map-client-events__scroll">
          {visibleOccurrences.length > 0 ? (
            <div className="map-client-events__list">
              {visibleOccurrences.map(({ event, date }) => {
                const relatedItem = event.relatedItemId ? itemsById.get(event.relatedItemId) : undefined
                const location = event.location || relatedItem?.title || ''
                return (
                  <article className="map-client-events__card" key={event.id}>
                    <div className="map-client-events__date">
                      <strong>{date.slice(-2)}</strong>
                      <span>{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</span>
                    </div>
                    <div className="map-client-events__card-content">
                      <h3>{event.title}</h3>
                      <div className="map-client-events__time"><Clock3 size={12} />{event.startTime}{event.endTime ? `–${event.endTime}` : ''} {copy.clock}</div>
                      <div className="map-client-events__repeat"><Repeat2 size={11} />{eventRecurrenceLabel(event, locale)}</div>
                      {location ? <div className="map-client-events__location"><MapPin size={12} />{location}</div> : null}
                      {event.description ? <p>{event.description}</p> : null}
                      {relatedItem ? (
                        <button
                          type="button"
                          className="map-client-events__locate"
                          onClick={() => onFocusItem(relatedItem.id)}
                        >
                          <LocateFixed size={14} strokeWidth={1.9} />
                          {copy.showOnMap}
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="map-client-events__empty">
              <span aria-hidden="true"><CalendarDays size={28} strokeWidth={1.6} /></span>
              <strong>{copy.noEvents}</strong>
              <p>{copy.noEventsText}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
