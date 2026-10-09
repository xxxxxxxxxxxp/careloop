import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDataFor, deletePeriodRecord, resetCalendar, savePeriodDay, savePeriodStart } from './calendarStore.js'
import { cycleLengthsFromStarts, daysInMonth, monthGrid, shiftMonth } from './calendarModel.js'

const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }

test('calendar grid aligns month starts and handles leap years', () => {
  assert.equal(daysInMonth(2024, 2), 29); assert.equal(daysInMonth(2025, 2), 28)
  const march = monthGrid(2025, 3); assert.equal(march.find((cell) => cell?.day === 1).date, '2025-03-01'); assert.deepEqual(shiftMonth({ year: 2025, month: 12 }, 1), { year: 2026, month: 1 })
})
test('only explicit bleeding day records are stored; period starts do not invent bleeding days', () => {
  const device = storage(); savePeriodStart({ id: 'start_1', patientId: 'usr_ava', date: '2025-03-03', origin: 'user' }, device)
  assert.equal(calendarDataFor('usr_ava', device).periodDays.length, 0)
  savePeriodDay({ id: 'day_1', patientId: 'usr_ava', date: '2025-03-03', origin: 'user', flow: 'medium', painLevel: null, cramps: null }, device)
  assert.equal(calendarDataFor('usr_ava', device).periodDays[0].flow, 'medium')
})
test('two confirmed starts yield a completed-cycle length without predictions', () => {
  assert.deepEqual(cycleLengthsFromStarts([{ date: '2025-02-03' }, { date: '2025-03-03' }]), [
    { startDate: '2025-02-03', endDate: '2025-03-02', lengthDays: 28, source: 'confirmed', isComplete: true },
    { startDate: '2025-03-03', endDate: null, lengthDays: null, source: 'confirmed', isComplete: false },
  ])
})
test('cycle lengths are calendar-safe for leap years, irregular cycles, duplicates, and one start', () => {
  assert.deepEqual(cycleLengthsFromStarts([{ date: '2024-02-01' }, { date: '2024-03-01' }])[0], { startDate: '2024-02-01', endDate: '2024-02-29', lengthDays: 29, source: 'confirmed', isComplete: true })
  assert.equal(cycleLengthsFromStarts([{ date: '2025-01-09' }, { date: '2025-02-11' }])[0].lengthDays, 33)
  assert.equal(cycleLengthsFromStarts([{ date: '2025-02-03' }, { date: '2025-02-03' }, { date: '2025-03-03' }]).length, 2)
  assert.deepEqual(cycleLengthsFromStarts([{ date: '2025-03-03' }]), [{ startDate: '2025-03-03', endDate: null, lengthDays: null, source: 'confirmed', isComplete: false }])
})
test('period records persist, isolate patients, and reset without touching fixture data', () => {
  const device = storage(); const fixture = Object.freeze({ id: 'fixture_day', date: '2025-03-03', flow: 'heavy' })
  savePeriodDay({ id: 'day_1', patientId: 'usr_ava', date: '2025-03-03', origin: 'user', flow: 'light', painLevel: 3, cramps: null }, device)
  savePeriodDay({ id: 'day_2', patientId: 'usr_mei', date: '2025-03-04', origin: 'user', flow: 'spotting', painLevel: null, cramps: null }, device)
  deletePeriodRecord('usr_ava', 'periodDays', 'day_1', device); assert.equal(calendarDataFor('usr_ava', device).periodDays.length, 0); assert.equal(calendarDataFor('usr_mei', device).periodDays.length, 1)
  resetCalendar('usr_mei', device); assert.equal(calendarDataFor('usr_mei', device).periodDays.length, 0); assert.equal(fixture.flow, 'heavy')
})
