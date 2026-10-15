import { fixtureIntakesFor, fixtureRegimensFor } from '../../data/fixtures.js'
import { asMillis, systemNowIso, toInputParts, toIsoWithOffset } from '../../lib/demoClock.js'
import { medicationChangesFor } from './medicationStore.js'

export const PURPOSES = Object.freeze([
  ['preventive', 'Preventive'],
  ['acute', 'Acute / as needed'],
  ['perimenstrual_prophylaxis', 'Short perimenstrual course'],
  ['rescue', 'Rescue'],
  ['other', 'Other'],
])
const PURPOSE_IDS = new Set(PURPOSES.map(([id]) => id))
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const id = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`

export function selectMedicationRecords(patientId, storage = globalThis.localStorage) {
  const changes = medicationChangesFor(patientId, storage)
  const hiddenRegimens = new Set(changes.hiddenRegimenIds)
  const hiddenIntakes = new Set(changes.hiddenIntakeIds)
  const regimens = fixtureRegimensFor(patientId)
    .filter((record) => !hiddenRegimens.has(record.id))
    .map((record) => ({ ...record, ...(changes.regimenOverrides[record.id] ?? {}), patientId, origin: 'fixture' }))
    .concat(changes.regimens.map((record) => ({ ...record, patientId, origin: 'user' })))
    .sort((a, b) => a.name.localeCompare(b.name))
  const intakes = fixtureIntakesFor(patientId)
    .filter((record) => !hiddenIntakes.has(record.id))
    .map((record) => ({ ...record, ...(changes.intakeOverrides[record.id] ?? {}), patientId, origin: 'fixture' }))
    .concat(changes.intakes.map((record) => ({ ...record, patientId, origin: 'user' })))
    .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''))
  return { regimens, intakes, persistent: changes.persistent }
}

export const blankRegimenForm = () => ({ name: '', purpose: 'other', doseText: '', frequencyText: '', scheduleText: '', reminderTime: '' })
export const regimenFormFrom = (record) => ({
  name: record?.name ?? '',
  purpose: record?.purpose ?? 'other',
  doseText: record?.doseText ?? '',
  frequencyText: record?.frequencyText ?? '',
  scheduleText: record?.scheduleText ?? '',
  reminderTime: record?.reminderTimes?.[0] ?? '',
})

export function validateRegimenForm(form) {
  const errors = {}
  const name = clean(form.name)
  const doseText = clean(form.doseText)
  const frequencyText = clean(form.frequencyText)
  const scheduleText = clean(form.scheduleText)
  const reminderTime = clean(form.reminderTime)
  if (!name) errors.name = 'Enter the medication name exactly as recorded.'
  else if (name.length > 100) errors.name = 'Medication name must be 100 characters or fewer.'
  if (!PURPOSE_IDS.has(form.purpose)) errors.purpose = 'Choose a purpose.'
  if (!frequencyText) errors.frequencyText = 'Enter the prescribed instructions exactly as recorded.'
  else if (frequencyText.length > 500) errors.frequencyText = 'Instructions must be 500 characters or fewer.'
  if (doseText.length > 100) errors.doseText = 'Dose or amount must be 100 characters or fewer.'
  if (scheduleText.length > 500) errors.scheduleText = 'Schedule information must be 500 characters or fewer.'
  if (reminderTime && !TIME_RE.test(reminderTime)) errors.reminderTime = 'Enter a valid reminder time.'
  return { errors, values: { name, doseText, frequencyText, scheduleText, reminderTime } }
}

export function makeRegimen(form, patientId, existing = null) {
  const { values } = validateRegimenForm(form)
  return {
    ...existing,
    id: existing?.id ?? id('reg_usr'),
    patientId,
    origin: existing?.origin ?? 'user',
    name: values.name,
    genericName: existing?.genericName ?? null,
    drugClass: existing?.drugClass ?? 'other',
    purpose: form.purpose,
    doseText: values.doseText,
    frequencyText: values.frequencyText,
    scheduleText: values.scheduleText || null,
    maxDosesPerDay: existing?.maxDosesPerDay ?? null,
    maxDosesPerWeek: existing?.maxDosesPerWeek ?? null,
    startDate: existing?.startDate ?? null,
    endDate: existing?.endDate ?? null,
    prescriberText: existing?.prescriberText ?? null,
    isActive: existing?.isActive ?? true,
    reminderTimes: values.reminderTime ? [values.reminderTime] : [],
    notes: existing?.notes ?? null,
    source: existing?.source ?? 'user_form',
    confirmedAt: existing?.confirmedAt ?? null,
    deletedAt: null,
  }
}

export const blankIntakeForm = ({ date = '', time = '' } = {}) => ({ regimenId: '', date, time, linkedEpisodeId: '' })
export const intakeFormFrom = (record) => {
  const taken = toInputParts(record?.takenAt)
  return { regimenId: record?.regimenId ?? '', date: taken.date, time: taken.time, linkedEpisodeId: record?.linkedEpisodeId ?? '' }
}

export function validateIntakeForm(form, { regimens = [], episodes = [], now = systemNowIso(), existing = null } = {}) {
  const errors = {}
  const regimen = regimens.find((record) => record.id === form.regimenId)
  const existingRegimenSelected = existing?.regimenId === form.regimenId && Boolean(existing?.name)
  const takenAt = toIsoWithOffset(form.date, form.time)
  if (!regimen && !existingRegimenSelected) errors.regimenId = 'Choose a medication from the recorded regimen list.'
  if (!takenAt || Number.isNaN(asMillis(takenAt))) errors.takenAt = 'Enter the date and time recorded for this intake.'
  else if (asMillis(takenAt) > asMillis(now)) errors.takenAt = "Intake time can't be in the future."
  if (form.linkedEpisodeId && !episodes.some((episode) => episode.id === form.linkedEpisodeId)) errors.linkedEpisodeId = 'Choose an available migraine episode or leave this blank.'
  return { errors, values: { regimen, takenAt } }
}

export function makeIntake(form, patientId, { regimens = [], episodes = [], existing = null, now = systemNowIso() } = {}) {
  const { values } = validateIntakeForm(form, { regimens, episodes, existing, now })
  const sameRegimen = existing?.regimenId === form.regimenId
  return {
    ...existing,
    id: existing?.id ?? id('int_usr'),
    patientId,
    origin: existing?.origin ?? 'user',
    regimenId: form.regimenId,
    name: values.regimen?.name ?? existing?.name ?? '',
    takenAt: values.takenAt,
    doseText: sameRegimen ? existing?.doseText ?? null : null,
    indication: sameRegimen ? existing?.indication ?? 'other' : 'other',
    linkedEpisodeId: form.linkedEpisodeId || null,
    effectiveness2h: sameRegimen ? existing?.effectiveness2h ?? null : null,
    sideEffects: sameRegimen && Array.isArray(existing?.sideEffects) ? [...existing.sideEffects] : [],
    isSkipped: sameRegimen ? existing?.isSkipped === true : false,
    skipReason: sameRegimen ? existing?.skipReason ?? null : null,
    notes: sameRegimen ? existing?.notes ?? null : null,
    source: existing?.source ?? 'user_form',
    confirmedAt: existing?.confirmedAt ?? now,
    deletedAt: null,
  }
}
