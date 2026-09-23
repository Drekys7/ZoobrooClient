import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapEvent, MapItem } from '../domain/models'
import { eventRecurrenceLabel, nextEventOccurrence, nextVisibleEventOccurrence, PhoneEventPanel } from './PhoneEventPanel'

afterEach(cleanup)

const item: MapItem = {
  id: 'penguins',
  categoryId: 'animals',
  type: 'animal',
  title: 'Pinguine',
  subtitle: '',
  description: '',
  iconAssetId: null,
  imageAssetId: null,
  colorOverride: null,
  markerOverrides: null,
  position: { x: 0.3, y: 0.4 },
  facts: [],
  visible: true,
  createdAt: '2026-08-12T08:00:00.000Z',
  updatedAt: '2026-08-12T08:00:00.000Z',
}

const event: MapEvent = {
  id: 'feeding',
  title: 'Pinguinfütterung',
  description: 'Treffen mit dem Tierpflege-Team.',
  location: 'Pinguinanlage',
  relatedItemId: item.id,
  startDate: '2026-08-15',
  startTime: '11:00',
  endTime: '11:20',
  recurrence: { frequency: 'weekly', interval: 1, weekdays: ['tuesday', 'saturday'], monthDays: [], endsOn: null, excludedDates: [] },
  visible: true,
  createdAt: '2026-08-12T08:00:00.000Z',
  updatedAt: '2026-08-12T08:00:00.000Z',
}

describe('PhoneEventPanel', () => {
  it('shows visible events and navigates to their linked map item', () => {
    const onFocusItem = vi.fn()
    render(<PhoneEventPanel events={[event]} items={[item]} onFocusItem={onFocusItem} onClose={vi.fn()} now={new Date(2026, 7, 15, 9, 0)} />)

    expect(screen.getByRole('dialog', { name: 'Veranstaltungen' })).toBeInTheDocument()
    expect(screen.getByText('Pinguinfütterung')).toBeInTheDocument()
    expect(screen.getByText('Wöchentlich · Di, Sa')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Auf der Karte zeigen' }))
    expect(onFocusItem).toHaveBeenCalledWith('penguins')
  })

  it('does not expose unpublished events to the visitor preview', () => {
    render(<PhoneEventPanel events={[{ ...event, visible: false }]} items={[item]} onFocusItem={vi.fn()} onClose={vi.fn()} now={new Date(2026, 7, 15, 9, 0)} />)

    expect(screen.queryByText('Pinguinfütterung')).not.toBeInTheDocument()
    expect(screen.getByText('Keine Veranstaltungen')).toBeInTheDocument()
  })

  it('formats monthly repetition using the selected calendar days', () => {
    expect(eventRecurrenceLabel({
      ...event,
      recurrence: { frequency: 'monthly', interval: 1, weekdays: [], monthDays: [5, 20], endsOn: null, excludedDates: [] },
    })).toBe('Monatlich · 5., 20.')
  })

  it('finds the actual nearest occurrence after an event time has passed', () => {
    const occurrence = nextEventOccurrence(event, new Date(2026, 7, 15, 11, 30))

    expect(occurrence).toMatchObject({ date: '2026-08-18', time: '11:00' })
  })

  it('skips exception dates when calculating the next occurrence', () => {
    const occurrence = nextEventOccurrence({
      ...event,
      recurrence: { ...event.recurrence, excludedDates: ['2026-08-18'] },
    }, new Date(2026, 7, 15, 11, 30))

    expect(occurrence).toMatchObject({ date: '2026-08-22', time: '11:00' })
  })

  it('uses the last available day for monthly events scheduled on the 31st', () => {
    const occurrence = nextEventOccurrence({
      ...event,
      startDate: '2027-01-31',
      recurrence: { frequency: 'monthly', interval: 1, weekdays: [], monthDays: [31], endsOn: null, excludedDates: [] },
    }, new Date(2027, 1, 1, 9, 0))

    expect(occurrence?.date).toBe('2027-02-28')
  })

  it('selects the soonest visible event for the simulator badge', () => {
    const occurrence = nextVisibleEventOccurrence([
      { ...event, id: 'later', startTime: '15:00' },
      { ...event, id: 'earlier', startTime: '12:00' },
      { ...event, id: 'hidden', startTime: '10:00', visible: false },
    ], new Date(2026, 7, 15, 9, 0))

    expect(occurrence).toMatchObject({ event: { id: 'earlier' }, time: '12:00' })
  })

  it('hides elapsed one-time events from the visitor event list', () => {
    const elapsedEvent: MapEvent = {
      ...event,
      id: 'elapsed',
      startDate: '2026-08-14',
      recurrence: { frequency: 'once', interval: 1, weekdays: [], monthDays: [], endsOn: null, excludedDates: [] },
    }

    render(<PhoneEventPanel events={[elapsedEvent]} items={[item]} onFocusItem={vi.fn()} onClose={vi.fn()} now={new Date(2026, 7, 15, 9, 0)} />)

    expect(screen.queryByText('Pinguinfütterung')).not.toBeInTheDocument()
    expect(screen.getByText('Keine Veranstaltungen')).toBeInTheDocument()
  })
})
