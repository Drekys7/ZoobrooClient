import type { MapEvent, Weekday } from './models'

export interface EventOccurrence {
  event: MapEvent
  date: string
  time: string
}

export type EventLifecycleStatus = 'upcoming' | 'draft' | 'past'

const weekdayOrder: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function utcDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`)
}

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dayDifference(left: string, right: string): number {
  return Math.round((utcDate(left).getTime() - utcDate(right).getTime()) / 86_400_000)
}

function weekdayIndex(value: string): number {
  return (utcDate(value).getUTCDay() + 6) % 7
}

function daysInMonth(value: string): number {
  const [year, month] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function eventOccursOnDate(event: MapEvent, date: string): boolean {
  const { recurrence } = event
  if (recurrence.excludedDates.includes(date)) return false
  if (recurrence.endsOn && date > recurrence.endsOn) return false
  const difference = dayDifference(date, event.startDate)
  if (difference < 0) return false
  if (recurrence.frequency === 'daily') return difference % recurrence.interval === 0
  if (recurrence.frequency === 'weekly') {
    const weekStart = difference + weekdayIndex(event.startDate) - weekdayIndex(date)
    const weekIndex = Math.floor(weekStart / 7)
    const weekday = weekdayOrder[weekdayIndex(date)] ?? 'monday'
    return weekIndex >= 0 && weekIndex % recurrence.interval === 0 && recurrence.weekdays.includes(weekday)
  }
  if (recurrence.frequency === 'monthly') {
    const [startYear, startMonth] = event.startDate.split('-').map(Number)
    const [year, month, day] = date.split('-').map(Number)
    const monthDifference = (year - startYear) * 12 + month - startMonth
    const scheduledDays = new Set(recurrence.monthDays.map((value) => Math.min(value, daysInMonth(date))))
    return monthDifference >= 0 && monthDifference % recurrence.interval === 0 && scheduledDays.has(day)
  }
  return date === event.startDate
}

export function nextEventOccurrence(event: MapEvent, now = new Date()): EventOccurrence | null {
  if (!event.visible) return null
  const today = localDateString(now)
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  if (event.recurrence.frequency === 'once') {
    if (`${event.startDate}T${event.startTime}` < `${today}T${currentTime}`) return null
    return { event, date: event.startDate, time: event.startTime }
  }

  const firstCandidate = event.startDate > today ? event.startDate : today
  const cursor = utcDate(firstCandidate)
  for (let offset = 0; offset < 3660; offset += 1) {
    const date = utcDateString(cursor)
    if (event.recurrence.endsOn && date > event.recurrence.endsOn) return null
    const timeHasNotPassed = date !== today || event.startTime >= currentTime
    if (timeHasNotPassed && eventOccursOnDate(event, date)) return { event, date, time: event.startTime }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return null
}

export function nextVisibleEventOccurrence(events: readonly MapEvent[], now = new Date()): EventOccurrence | null {
  return events
    .map((event) => nextEventOccurrence(event, now))
    .filter((occurrence): occurrence is EventOccurrence => Boolean(occurrence))
    .sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`))[0] ?? null
}

export function eventLifecycleStatus(event: MapEvent, now = new Date()): EventLifecycleStatus {
  if (!event.visible) return 'draft'
  return nextEventOccurrence(event, now) ? 'upcoming' : 'past'
}
