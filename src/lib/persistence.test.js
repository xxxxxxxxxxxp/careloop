import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureEpisodesFor, fixtureRegimensFor } from '../data/fixtures.js'
import { calendarDataFor, resetCalendar, savePeriodDay, savePeriodStart } from '../features/calendar/calendarStore.js'
import { selectMedicationRecords } from '../features/medication/medicationModel.js'
import { hideFixtureRegimen, medicationChangesFor, resetPatientMedications, saveFixtureRegimenOverride, saveUserRegimen } from '../features/medication/medicationStore.js'
import { initialPatientId, persistPatientId, routeFromHash } from './appPreferences.js'
import { fixtureOverridesFor, hideFixtureEpisode, hiddenFixtureIdsFor, resetPatientEpisodes, saveFixtureOverride, saveUserEpisode, userEpisodesFor } from './localStore.js'

const patients = [
  { id: 'usr_ava', name: 'Ava Chen' },
  { id: 'usr_mei', name: 'Mei Lin' },
  { id: 'usr_sofia', name: 'Sofia R.' },
]
const routes = ['dashboard', 'calendar', 'diary', 'medication', 'insights', 'doctor']

const browserStorage = () => {
  const values = new Map()
  const open = () => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  })
  return { open }
}

test('selected patient persists across every route and refresh-style storage reads', () => {
  const browser = browserStorage()
  const firstPage = browser.open()
  assert.equal(initialPatientId(patients, firstPage), 'usr_ava')
  assert.equal(persistPatientId('usr_sofia', patients, firstPage), true)

  for (const route of routes) {
    assert.equal(routeFromHash(`#/${route}`, routes), route)
    assert.equal(initialPatientId(patients, browser.open()), 'usr_sofia')
  }

  assert.equal(persistPatientId('unknown-patient', patients, firstPage), false)
  assert.equal(initialPatientId(patients, browser.open()), 'usr_sofia')
})

test('migraine, cycle, and medication records persist after navigation and remain patient-specific', () => {
  const browser = browserStorage()
  const device = browser.open()
  const avaEpisode = { id: 'ep_usr_ava_persist', patientId: 'usr_ava', origin: 'user', startAt: '2025-03-18T09:00:00+08:00', endAt: null, endUnknown: true, peakSeverity: 6 }
  const avaRegimen = { id: 'reg_usr_ava_persist', patientId: 'usr_ava', origin: 'user', name: 'Recorded by Ava', purpose: 'other', frequencyText: 'User-entered instructions', reminderTimes: [] }

  saveUserEpisode(avaEpisode, device)
  savePeriodStart({ id: 'start_usr_ava_persist', patientId: 'usr_ava', date: '2025-03-18', origin: 'user' }, device)
  savePeriodDay({ id: 'day_usr_ava_persist', patientId: 'usr_ava', date: '2025-03-18', origin: 'user', flow: 'medium', painLevel: null, cramps: null }, device)
  saveUserRegimen(avaRegimen, device)

  for (const route of ['dashboard', 'calendar', 'diary', 'medication', 'insights']) {
    assert.equal(routeFromHash(`#/${route}`, routes), route)
    const refreshedPage = browser.open()
    assert.equal(userEpisodesFor('usr_ava', refreshedPage).episodes.some((entry) => entry.id === avaEpisode.id), true)
    assert.equal(calendarDataFor('usr_ava', refreshedPage).periodStarts.some((entry) => entry.id === 'start_usr_ava_persist'), true)
    assert.equal(calendarDataFor('usr_ava', refreshedPage).periodDays.some((entry) => entry.id === 'day_usr_ava_persist'), true)
    assert.equal(medicationChangesFor('usr_ava', refreshedPage).regimens.some((entry) => entry.id === avaRegimen.id), true)
  }

  assert.equal(userEpisodesFor('usr_mei', device).episodes.some((entry) => entry.id === avaEpisode.id), false)
  assert.equal(calendarDataFor('usr_mei', device).periodStarts.length, 0)
  assert.equal(calendarDataFor('usr_mei', device).periodDays.length, 0)
  assert.equal(medicationChangesFor('usr_mei', device).regimens.some((entry) => entry.id === avaRegimen.id), false)
  assert.equal(userEpisodesFor('usr_sofia', device).episodes.some((entry) => entry.id === avaEpisode.id), false)
  assert.equal(calendarDataFor('usr_sofia', device).periodStarts.length, 0)
  assert.equal(medicationChangesFor('usr_sofia', device).regimens.some((entry) => entry.id === avaRegimen.id), false)
})

test('per-patient reset clears local changes and restores hidden or edited fixture records', () => {
  const browser = browserStorage()
  const device = browser.open()
  const avaFixtureEpisode = fixtureEpisodesFor('usr_ava')[0]
  const avaFixtureRegimen = fixtureRegimensFor('usr_ava')[0]
  assert.ok(avaFixtureEpisode)
  assert.ok(avaFixtureRegimen)

  saveUserEpisode({ id: 'ep_usr_ava_reset', patientId: 'usr_ava', origin: 'user', startAt: '2025-03-17T09:00:00+08:00' }, device)
  saveUserEpisode({ id: 'ep_usr_mei_keep', patientId: 'usr_mei', origin: 'user', startAt: '2025-03-16T09:00:00+08:00' }, device)
  saveFixtureOverride({ ...avaFixtureEpisode, peakSeverity: 1 }, device)
  hideFixtureEpisode('usr_ava', avaFixtureEpisode.id, device)

  savePeriodDay({ id: 'day_usr_ava_reset', patientId: 'usr_ava', date: '2025-03-17', origin: 'user', flow: 'light' }, device)
  savePeriodDay({ id: 'day_usr_mei_keep', patientId: 'usr_mei', date: '2025-03-16', origin: 'user', flow: 'spotting' }, device)

  saveUserRegimen({ id: 'reg_usr_ava_reset', patientId: 'usr_ava', origin: 'user', name: 'Ava local record' }, device)
  saveUserRegimen({ id: 'reg_usr_mei_keep', patientId: 'usr_mei', origin: 'user', name: 'Mei local record' }, device)
  saveFixtureRegimenOverride({ ...avaFixtureRegimen, frequencyText: 'Locally edited fixture instructions' }, device)
  hideFixtureRegimen('usr_ava', avaFixtureRegimen.id, device)

  resetPatientEpisodes('usr_ava', device)
  resetCalendar('usr_ava', device)
  resetPatientMedications('usr_ava', device)

  assert.deepEqual(userEpisodesFor('usr_ava', device).episodes, [])
  assert.deepEqual(hiddenFixtureIdsFor('usr_ava', device), [])
  assert.deepEqual(fixtureOverridesFor('usr_ava', device), {})
  assert.equal(fixtureEpisodesFor('usr_ava').some((entry) => entry.id === avaFixtureEpisode.id), true)
  assert.equal(calendarDataFor('usr_ava', device).periodDays.length, 0)
  assert.equal(selectMedicationRecords('usr_ava', device).regimens.find((entry) => entry.id === avaFixtureRegimen.id)?.frequencyText, avaFixtureRegimen.frequencyText)
  assert.equal(medicationChangesFor('usr_ava', device).regimens.length, 0)

  assert.equal(userEpisodesFor('usr_mei', device).episodes.some((entry) => entry.id === 'ep_usr_mei_keep'), true)
  assert.equal(calendarDataFor('usr_mei', device).periodDays.some((entry) => entry.id === 'day_usr_mei_keep'), true)
  assert.equal(medicationChangesFor('usr_mei', device).regimens.some((entry) => entry.id === 'reg_usr_mei_keep'), true)
})
