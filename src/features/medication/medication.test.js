import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureIntakesFor, fixtureRegimensFor } from '../../data/fixtures.js'
import {
  makeIntake,
  makeRegimen,
  regimenFormFrom,
  selectMedicationRecords,
  validateIntakeForm,
  validateRegimenForm,
} from './medicationModel.js'
import {
  hideFixtureIntake,
  hideFixtureRegimen,
  medicationChangesFor,
  removeUserIntake,
  removeUserRegimen,
  saveFixtureIntakeOverride,
  saveFixtureRegimenOverride,
  saveUserIntake,
  saveUserRegimen,
} from './medicationStore.js'

const storage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}
const regimenForm = (overrides = {}) => ({
  name: 'User recorded medicine',
  purpose: 'other',
  doseText: 'User recorded amount',
  frequencyText: 'User recorded prescribed instructions',
  scheduleText: 'User recorded schedule',
  reminderTime: '09:15',
  ...overrides,
})
const episode = { id: 'ep_ava_test', startAt: '2025-03-19T14:00:00+08:00', peakSeverity: 7 }
const intakeForm = (regimenId, overrides = {}) => ({ regimenId, date: '2025-03-19', time: '14:30', linkedEpisodeId: episode.id, ...overrides })
const now = '2026-10-16T12:00:00+08:00'

test('adds medication and intake records and persists user-entered values', () => {
  const device = storage()
  const regimen = makeRegimen(regimenForm(), 'usr_ava')
  assert.deepEqual(validateRegimenForm(regimenForm()).errors, {})
  saveUserRegimen(regimen, device)
  const intake = makeIntake(intakeForm(regimen.id), 'usr_ava', { regimens: [regimen], episodes: [episode], now })
  saveUserIntake(intake, device)

  const records = selectMedicationRecords('usr_ava', device)
  assert.equal(records.regimens.find((item) => item.id === regimen.id).frequencyText, 'User recorded prescribed instructions')
  assert.equal(records.intakes.find((item) => item.id === intake.id).linkedEpisodeId, episode.id)
  assert.equal(records.intakes.find((item) => item.id === intake.id).doseText, null)
  assert.equal(medicationChangesFor('usr_ava', device).regimens.length, 1)
  assert.equal(medicationChangesFor('usr_ava', device).intakes.length, 1)
})

test('editing user records keeps stable ids and does not create duplicates', () => {
  const device = storage()
  const regimen = makeRegimen(regimenForm(), 'usr_ava')
  saveUserRegimen(regimen, device)
  const editedRegimen = makeRegimen(regimenForm({ frequencyText: 'Updated exactly as entered' }), 'usr_ava', regimen)
  saveUserRegimen(editedRegimen, device)
  assert.equal(medicationChangesFor('usr_ava', device).regimens.length, 1)
  assert.equal(medicationChangesFor('usr_ava', device).regimens[0].frequencyText, 'Updated exactly as entered')

  const intake = makeIntake(intakeForm(regimen.id), 'usr_ava', { regimens: [editedRegimen], episodes: [episode], now })
  saveUserIntake(intake, device)
  const editedIntake = makeIntake(intakeForm(regimen.id, { time: '15:45', linkedEpisodeId: '' }), 'usr_ava', { regimens: [editedRegimen], episodes: [episode], existing: intake, now })
  saveUserIntake(editedIntake, device)
  assert.equal(medicationChangesFor('usr_ava', device).intakes.length, 1)
  assert.match(medicationChangesFor('usr_ava', device).intakes[0].takenAt, /T15:45:00/)
  assert.equal(medicationChangesFor('usr_ava', device).intakes[0].linkedEpisodeId, null)
})

test('deletes user regimen and intake records independently', () => {
  const device = storage()
  const regimen = makeRegimen(regimenForm(), 'usr_ava')
  saveUserRegimen(regimen, device)
  const intake = makeIntake(intakeForm(regimen.id), 'usr_ava', { regimens: [regimen], episodes: [episode], now })
  saveUserIntake(intake, device)

  removeUserRegimen('usr_ava', regimen.id, device)
  assert.equal(medicationChangesFor('usr_ava', device).regimens.length, 0)
  assert.equal(medicationChangesFor('usr_ava', device).intakes.length, 1)
  removeUserIntake('usr_ava', intake.id, device)
  assert.equal(medicationChangesFor('usr_ava', device).intakes.length, 0)
})

test('fixture edits and deletions use local overrides without mutating fixture data', () => {
  const device = storage()
  const fixtureRegimen = fixtureRegimensFor('usr_ava')[0]
  const originalInstructions = fixtureRegimen.frequencyText
  const editedRegimen = makeRegimen({ ...regimenFormFrom(fixtureRegimen), frequencyText: 'Locally edited fixture instructions' }, 'usr_ava', fixtureRegimen)
  saveFixtureRegimenOverride(editedRegimen, device)
  assert.equal(selectMedicationRecords('usr_ava', device).regimens.find((item) => item.id === fixtureRegimen.id).frequencyText, 'Locally edited fixture instructions')
  assert.equal(fixtureRegimen.frequencyText, originalInstructions)
  hideFixtureRegimen('usr_ava', fixtureRegimen.id, device)
  assert.equal(selectMedicationRecords('usr_ava', device).regimens.some((item) => item.id === fixtureRegimen.id), false)

  const fixtureIntake = fixtureIntakesFor('usr_ava')[0]
  saveFixtureIntakeOverride({ ...fixtureIntake, takenAt: '2025-01-06T09:00:00+08:00' }, device)
  assert.equal(selectMedicationRecords('usr_ava', device).intakes.find((item) => item.id === fixtureIntake.id).takenAt, '2025-01-06T09:00:00+08:00')
  hideFixtureIntake('usr_ava', fixtureIntake.id, device)
  assert.equal(selectMedicationRecords('usr_ava', device).intakes.some((item) => item.id === fixtureIntake.id), false)
})

test('medication data remains isolated between Ava, Mei and Sofia', () => {
  const device = storage()
  const ava = makeRegimen(regimenForm({ name: 'Ava entry' }), 'usr_ava')
  const mei = makeRegimen(regimenForm({ name: 'Mei entry' }), 'usr_mei')
  const sofia = makeRegimen(regimenForm({ name: 'Sofia entry' }), 'usr_sofia')
  saveUserRegimen(ava, device)
  saveUserRegimen(mei, device)
  saveUserRegimen(sofia, device)
  saveUserIntake(makeIntake(intakeForm(ava.id), 'usr_ava', { regimens: [ava], episodes: [episode], now }), device)
  saveUserIntake(makeIntake(intakeForm(mei.id, { linkedEpisodeId: '' }), 'usr_mei', { regimens: [mei], episodes: [], now }), device)
  assert.deepEqual(medicationChangesFor('usr_ava', device).regimens.map((item) => item.name), ['Ava entry'])
  assert.deepEqual(medicationChangesFor('usr_mei', device).regimens.map((item) => item.name), ['Mei entry'])
  assert.deepEqual(medicationChangesFor('usr_sofia', device).regimens.map((item) => item.name), ['Sofia entry'])
  assert.deepEqual(medicationChangesFor('usr_ava', device).intakes.map((item) => item.name), ['Ava entry'])
  assert.deepEqual(medicationChangesFor('usr_mei', device).intakes.map((item) => item.name), ['Mei entry'])
  assert.deepEqual(medicationChangesFor('usr_sofia', device).intakes, [])
})

test('a patient with no fixture or local medication data has explicit empty states', () => {
  const records = selectMedicationRecords('usr_patient_without_medications', storage())
  assert.deepEqual(records.regimens, [])
  assert.deepEqual(records.intakes, [])
  assert.equal(records.persistent, true)
})

test('intake validation requires recorded values and never supplies a medication or dose', () => {
  const regimen = makeRegimen(regimenForm(), 'usr_ava')
  const invalid = validateIntakeForm({ regimenId: '', date: '', time: '', linkedEpisodeId: '' }, { regimens: [regimen], episodes: [episode], now })
  assert.ok(invalid.errors.regimenId)
  assert.ok(invalid.errors.takenAt)
  const valid = validateIntakeForm(intakeForm(regimen.id), { regimens: [regimen], episodes: [episode], now })
  assert.deepEqual(valid.errors, {})
  const intake = makeIntake(intakeForm(regimen.id), 'usr_ava', { regimens: [regimen], episodes: [episode], now })
  assert.equal(intake.name, 'User recorded medicine')
  assert.equal(intake.doseText, null)
})
