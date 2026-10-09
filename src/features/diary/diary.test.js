import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureOverridesFor, hideFixtureEpisode, hiddenFixtureIdsFor, removeUserEpisode, resetPatientEpisodes, saveFixtureOverride, saveUserEpisode, userEpisodesFor } from '../../lib/localStore.js'
import { formFromEpisode, makeUserEpisode, validateEpisode, withDefaultEndDate } from './episodeSchema.js'
import { formatDuration } from './duration.js'
import { initialPatientId, persistPatientId, routeFromHash } from '../../lib/appPreferences.js'

const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const now = '2026-10-09T12:00:00.000Z'
const form = (overrides = {}) => ({ startDate: '2025-03-19', startTime: '14:00', endState: 'ended', endDate: '2025-03-19', endTime: '22:00', peakSeverity: '7', associatedSymptoms: ['photophobia'], functionalImpact: 'missed_some', notes: '', ...overrides })

test('accepts historical 2025 end timestamps against a real 2026 system clock', () => {
  assert.deepEqual(validateEpisode(form(), { now }).errors, {})
})
test('persists Sofia as the selected patient and safely defaults invalid selections to Ava', () => {
  const device = storage(); const patients = [{ id: 'usr_ava' }, { id: 'usr_mei' }, { id: 'usr_sofia' }]
  persistPatientId('usr_sofia', patients, device); assert.equal(initialPatientId(patients, device), 'usr_sofia')
  device.setItem('careloop.selectedDemoPatient.v1', 'usr_unknown'); assert.equal(initialPatientId(patients, device), 'usr_ava')
})
test('keeps a valid hash route across reload-style initialization', () => {
  assert.equal(routeFromHash('#/diary', ['dashboard', 'diary']), 'diary'); assert.equal(routeFromHash('#/other', ['dashboard', 'diary']), 'dashboard')
})
test('rejects an end time before its start time', () => {
  assert.match(validateEpisode(form({ endTime: '10:00' }), { now }).errors.end, /before the start/)
})
test('rejects truly future timestamps against the real clock', () => {
  assert.match(validateEpisode(form({ startDate: '2026-10-10', endDate: '2026-10-10' }), { now }).errors.start, /future/)
})
test('defaults an empty end date to the selected start date', () => {
  assert.equal(withDefaultEndDate({ startDate: '', endDate: '' }, '2025-03-19').endDate, '2025-03-19')
})
test('changes a default end date with the start date but preserves a manual date', () => {
  assert.equal(withDefaultEndDate({ startDate: '2025-03-19', endDate: '2025-03-19' }, '2025-03-20').endDate, '2025-03-20')
  assert.equal(withDefaultEndDate({ startDate: '2025-03-19', endDate: '2025-03-21' }, '2025-03-20').endDate, '2025-03-21')
})
test('ongoing episodes retain a null end without an invented time', () => {
  const episode = makeUserEpisode(form({ endState: 'ongoing', endDate: '', endTime: '' }), 'usr_ava', null, { now })
  assert.equal(episode.endAt, null); assert.equal(episode.endUnknown, false)
})
test('prepopulates every editable field from an existing entry', () => {
  const state = formFromEpisode({ startAt: '2025-03-19T14:00:00+08:00', endAt: '2025-03-19T22:00:00+08:00', endUnknown: false, peakSeverity: 7, associatedSymptoms: ['photophobia', 'nausea'], functionalImpact: 'missed_some', notes: 'after workshop' })
  assert.deepEqual(state, { startDate: '2025-03-19', startTime: '14:00', endDate: '2025-03-19', endTime: '22:00', endState: 'ended', peakSeverity: 7, severityUnknown: false, associatedSymptoms: ['photophobia', 'nausea'], functionalImpact: 'missed_some', notes: 'after workshop' })
})
test('editing a user entry keeps its stable ID and does not create a duplicate', () => {
  const device = storage(); const original = makeUserEpisode(form(), 'usr_ava', null, { now }); saveUserEpisode(original, device)
  const edited = makeUserEpisode(form({ peakSeverity: '9', notes: 'updated' }), 'usr_ava', original, { now: '2026-10-09T12:01:00.000Z' }); saveUserEpisode(edited, device)
  const entries = userEpisodesFor('usr_ava', device).episodes; assert.equal(entries.length, 1); assert.equal(entries[0].id, original.id); assert.equal(entries[0].peakSeverity, 9); assert.equal(entries[0].notes, 'updated')
})
test('fixture edits are stored as patient-specific overrides and retain unknown observations', () => {
  const device = storage(); const fixture = { id: 'ep_ava_1', patientId: 'usr_ava', origin: 'fixture', startAt: '2025-03-19T14:00:00+08:00', endAt: null, endUnknown: true, peakSeverity: null, associatedSymptoms: [], functionalImpact: null, notes: '' }
  const edited = makeUserEpisode(form({ endState: 'ended', peakSeverity: '8' }), 'usr_ava', fixture, { now }); saveFixtureOverride(edited, device)
  assert.equal(fixtureOverridesFor('usr_ava', device).ep_ava_1.id, 'ep_ava_1'); assert.equal(fixtureOverridesFor('usr_mei', device).ep_ava_1, undefined); assert.equal(fixture.endAt, null); assert.equal(fixture.endUnknown, true)
})
test('cancelling an edit writes nothing and ongoing entries can be closed through an edit', () => {
  const device = storage(); const original = makeUserEpisode(form({ endState: 'ongoing', endDate: '', endTime: '', peakSeverity: '', severityUnknown: true }), 'usr_ava', null, { now }); saveUserEpisode(original, device)
  assert.equal(userEpisodesFor('usr_ava', device).episodes[0].endAt, null)
  const closed = makeUserEpisode(form({ endState: 'ended', endDate: '2025-03-19', endTime: '22:00', peakSeverity: '', severityUnknown: true }), 'usr_ava', original, { now }); saveUserEpisode(closed, device)
  assert.match(userEpisodesFor('usr_ava', device).episodes[0].endAt, /^2025-03-19T22:00:00[+-]\d{2}:\d{2}$/)
})
test('formats elapsed duration with minute precision, including overnight episodes', () => {
  assert.equal(formatDuration('2026-10-09T10:00:00+08:00', '2026-10-09T10:35:00+08:00'), '35 min')
  assert.equal(formatDuration('2026-10-09T10:00:00+08:00', '2026-10-09T11:00:00+08:00'), '1 hr')
  assert.equal(formatDuration('2026-10-09T10:00:00+08:00', '2026-10-09T11:25:00+08:00'), '1 hr 25 min')
  assert.equal(formatDuration('2026-10-09T23:40:00+08:00', '2026-10-10T01:15:00+08:00'), '1 hr 35 min')
  assert.equal(formatDuration('2026-10-09T10:00:00+08:00', null), 'Ongoing')
})
test('deletes a manually-added entry', () => {
  const device = storage(); const episode = makeUserEpisode(form(), 'usr_ava', null, { now }); saveUserEpisode(episode, device); removeUserEpisode('usr_ava', episode.id, device)
  assert.equal(userEpisodesFor('usr_ava', device).episodes.length, 0)
})
test('hides a fixture through a tombstone without modifying the fixture object', () => {
  const device = storage(); const fixture = Object.freeze({ id: 'ep_ava_1', endAt: '2025-01-01T10:00:00+08:00' }); hideFixtureEpisode('usr_ava', fixture.id, device)
  assert.deepEqual(hiddenFixtureIdsFor('usr_ava', device), ['ep_ava_1']); assert.equal(fixture.endAt, '2025-01-01T10:00:00+08:00')
})
test('fixture tombstones remain after reading storage again', () => {
  const device = storage(); hideFixtureEpisode('usr_ava', 'ep_ava_1', device)
  assert.deepEqual(hiddenFixtureIdsFor('usr_ava', device), ['ep_ava_1'])
})
test('fixture tombstones are isolated by patient', () => {
  const device = storage(); hideFixtureEpisode('usr_ava', 'ep_ava_1', device)
  assert.deepEqual(hiddenFixtureIdsFor('usr_mei', device), [])
})
test('resetting demo data restores fixture visibility and clears user entries for only that patient', () => {
  const device = storage(); const ava = makeUserEpisode(form(), 'usr_ava', null, { now }); const mei = makeUserEpisode(form(), 'usr_mei', null, { now }); saveUserEpisode(ava, device); saveUserEpisode(mei, device); hideFixtureEpisode('usr_ava', 'ep_ava_1', device)
  saveFixtureOverride({ id: 'ep_ava_2', patientId: 'usr_ava', origin: 'fixture', peakSeverity: 9 }, device)
  resetPatientEpisodes('usr_ava', device)
  assert.equal(userEpisodesFor('usr_ava', device).episodes.length, 0); assert.deepEqual(hiddenFixtureIdsFor('usr_ava', device), []); assert.deepEqual(fixtureOverridesFor('usr_ava', device), {}); assert.equal(userEpisodesFor('usr_mei', device).episodes.length, 1)
})
