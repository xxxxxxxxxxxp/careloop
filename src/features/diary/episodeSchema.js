import { asMillis, systemNowIso, toIsoWithOffset } from '../../lib/demoClock.js'

export const symptoms = ['aura', 'photophobia', 'phonophobia', 'nausea', 'vomiting', 'osmophobia', 'dizziness', 'neck_pain', 'brain_fog', 'fatigue']
export const impacts = ['none', 'slowed_down', 'missed_some', 'missed_work_or_school', 'bedbound']

export function formFromEpisode(episode) {
  const start = episode ? { date: episode.startAt.slice(0, 10), time: episode.startAt.slice(11, 16) } : { date: '', time: '' }
  const end = episode?.endAt ? { date: episode.endAt.slice(0, 10), time: episode.endAt.slice(11, 16) } : { date: '', time: '' }
  return { startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, endState: episode ? (episode.endAt ? 'ended' : episode.endUnknown ? 'unknown' : 'ongoing') : '', peakSeverity: episode?.peakSeverity ?? '', severityUnknown: episode?.peakSeverity === null, associatedSymptoms: [...(episode?.associatedSymptoms ?? [])], functionalImpact: episode?.functionalImpact ?? '', notes: episode?.notes ?? '' }
}

export function withDefaultEndDate(form, startDate) {
  const shouldFollowStart = !form.endDate || form.endDate === form.startDate
  return { ...form, startDate, endDate: shouldFollowStart ? startDate : form.endDate }
}

export function validateEpisode(form, { now = systemNowIso() } = {}) {
  const errors = {}
  const startAt = toIsoWithOffset(form.startDate, form.startTime)
  const endAt = form.endState === 'ended' ? toIsoWithOffset(form.endDate, form.endTime) : null
  if (!startAt || Number.isNaN(asMillis(startAt))) errors.start = 'When did it start?'
  else if (asMillis(startAt) > asMillis(now)) errors.start = "Start time can't be in the future"
  if (!form.endState) errors.endState = "Tell me whether it's still going, ended at a time, or ended at an unknown time."
  if (form.endState === 'ended' && (!endAt || Number.isNaN(asMillis(endAt)))) errors.end = 'When did it end?'
  else if (endAt && asMillis(endAt) <= asMillis(startAt)) errors.end = "End time is before the start time. Fix it or clear it — CareLoop won't guess."
  else if (endAt && asMillis(endAt) > asMillis(now)) errors.end = "End time can't be in the future"
  const severity = form.severityUnknown ? null : form.peakSeverity === '' || form.peakSeverity === null ? null : Number(form.peakSeverity)
  if (!form.severityUnknown && (!Number.isInteger(severity) || severity < 0 || severity > 10)) errors.peakSeverity = 'Rate the worst point (0–10), or explicitly mark it unknown.'
  const notes = (form.notes ?? '').trim()
  if (notes.length > 2000) errors.notes = 'Notes must be 2,000 characters or fewer.'
  const selectedSymptoms = (form.associatedSymptoms ?? []).filter((symptom) => symptoms.includes(symptom))
  if ((form.associatedSymptoms ?? []).length !== selectedSymptoms.length) errors.associatedSymptoms = 'Choose symptoms from the available list.'
  if (form.functionalImpact && !impacts.includes(form.functionalImpact)) errors.functionalImpact = 'Choose an impact from the available list.'
  return { errors, values: { startAt, endAt, peakSeverity: severity, notes, associatedSymptoms: selectedSymptoms } }
}

export function makeUserEpisode(form, patientId, existing = null, { now = systemNowIso() } = {}) {
  const { values } = validateEpisode(form, { now })
  return {
    ...existing,
    id: existing?.id ?? `ep_usr_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    patientId: existing?.patientId ?? patientId,
    origin: existing?.origin ?? 'user',
    startAt: values.startAt,
    endAt: form.endState === 'ended' ? values.endAt : null,
    endUnknown: form.endState === 'unknown',
    peakSeverity: values.peakSeverity,
    associatedSymptoms: values.associatedSymptoms,
    functionalImpact: form.functionalImpact || null,
    notes: values.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}
