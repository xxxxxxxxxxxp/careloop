import test from 'node:test'
import assert from 'node:assert/strict'
import { analysePattern } from '../analysis/patternAnalysis.js'
import { selectMedicationRecords } from '../medication/medicationModel.js'
import { saveUserIntake, saveUserRegimen } from '../medication/medicationStore.js'
import { doctorPreparationFor, removeCustomQuestion, saveAppointmentDetails, saveCustomQuestion } from './doctorStore.js'
import { buildAppointmentQuestions, prepareDoctorReport } from './doctorReport.js'

const browserStorage = () => {
  const values = new Map()
  return { open: () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }) }
}
const patient = (id = 'usr_ava', name = 'Ava Chen') => ({ id, name })
const cycleStarts = [
  { id: 'c1', startDate: '2025-01-06' },
  { id: 'c2', startDate: '2025-02-03' },
  { id: 'c3', startDate: '2025-03-03' },
  { id: 'c4', startDate: '2025-03-31' },
]
const episode = (id, date, overrides = {}) => ({ id, startAt: `${date}T09:00:00+08:00`, endAt: `${date}T13:00:00+08:00`, endUnknown: false, peakSeverity: 7, associatedSymptoms: ['photophobia'], ...overrides })

test('appointment details and user questions persist separately for each patient', () => {
  const browser = browserStorage()
  saveAppointmentDetails('usr_ava', { date: '2026-11-03', professionalType: 'Neurologist', concerns: 'Discuss the recorded timing.' }, browser.open())
  saveAppointmentDetails('usr_mei', { date: '', professionalType: 'GP', concerns: 'Review missing durations.' }, browser.open())
  saveCustomQuestion('usr_ava', { id: 'q_ava', text: 'Which details should I keep recording?' }, browser.open())
  saveCustomQuestion('usr_mei', { id: 'q_mei', text: 'Is another cycle start useful?' }, browser.open())

  const avaAfterRefresh = doctorPreparationFor('usr_ava', browser.open())
  const meiAfterSwitch = doctorPreparationFor('usr_mei', browser.open())
  const sofiaAfterSwitch = doctorPreparationFor('usr_sofia', browser.open())
  assert.equal(avaAfterRefresh.appointment.professionalType, 'Neurologist')
  assert.deepEqual(avaAfterRefresh.customQuestions, [{ id: 'q_ava', text: 'Which details should I keep recording?' }])
  assert.equal(meiAfterSwitch.appointment.professionalType, 'GP')
  assert.deepEqual(meiAfterSwitch.customQuestions, [{ id: 'q_mei', text: 'Is another cycle start useful?' }])
  assert.deepEqual(sofiaAfterSwitch.appointment, { date: '', professionalType: '', concerns: '' })
  assert.deepEqual(sofiaAfterSwitch.customQuestions, [])

  saveCustomQuestion('usr_ava', { id: 'q_ava', text: 'Edited question' }, browser.open())
  assert.deepEqual(doctorPreparationFor('usr_ava', browser.open()).customQuestions, [{ id: 'q_ava', text: 'Edited question' }])
  removeCustomQuestion('usr_ava', 'q_ava', browser.open())
  assert.deepEqual(doctorPreparationFor('usr_ava', browser.open()).customQuestions, [])
  assert.equal(doctorPreparationFor('usr_mei', browser.open()).customQuestions.length, 1)
})

test('report reuses the established five-day analysis and its sufficiency result exactly', () => {
  const episodes = [
    episode('e1', '2025-01-06'), episode('e2', '2025-02-01'), episode('e3', '2025-02-15'),
    episode('e4', '2025-03-03'), episode('e5', '2025-03-17'), episode('e6', '2025-03-31'),
  ]
  const expected = analysePattern({ cycles: cycleStarts, episodes, asOfDate: '2025-03-20' })
  const report = prepareDoctorReport({ patient: patient(), episodes, cycles: cycleStarts, asOfDate: '2025-03-20' })
  assert.deepEqual(report.pattern, expected)
  assert.equal(report.completedCycleCount, expected.dataSufficiency.completeCycles)
  assert.equal(report.pattern.dataSufficiency.level, 2)
  assert.match(report.dataSufficiencyExplanation, /recorded history only/)
})

test('report includes current Medication Tracker records and reflects later edits', () => {
  const device = browserStorage().open()
  const regimen = { id: 'reg_user', patientId: 'usr_ava', origin: 'user', name: 'User-recorded medication', purpose: 'other', doseText: 'Recorded amount', frequencyText: 'Original user instructions', scheduleText: null, reminderTimes: [] }
  const intake = { id: 'int_user', patientId: 'usr_ava', origin: 'user', regimenId: regimen.id, name: regimen.name, takenAt: '2025-03-03T09:30:00+08:00', doseText: 'Amount recorded at intake', linkedEpisodeId: 'e1', isSkipped: false }
  saveUserRegimen(regimen, device)
  saveUserIntake(intake, device)
  saveUserRegimen({ ...regimen, frequencyText: 'Edited user instructions' }, device)

  const medicationRecords = selectMedicationRecords('usr_ava', device)
  const report = prepareDoctorReport({ patient: patient(), episodes: [], cycles: [], medicationRecords })
  const reportRegimen = report.medications.regimens.find((item) => item.id === regimen.id)
  const reportIntake = report.medications.intakes.find((item) => item.id === intake.id)
  assert.equal(reportRegimen.instructions, 'Edited user instructions')
  assert.equal(reportRegimen.amount, 'Recorded amount')
  assert.equal(reportIntake.takenAt, intake.takenAt)
  assert.equal(reportIntake.amount, 'Amount recorded at intake')
})

test('missing observations remain missing while a recorded zero severity remains zero', () => {
  const episodes = [episode('unknown', '2025-03-02', { endAt: null, endUnknown: true, peakSeverity: null, associatedSymptoms: [] }), episode('zero', '2025-03-03', { endAt: null, peakSeverity: 0, associatedSymptoms: [] })]
  const report = prepareDoctorReport({ patient: patient(), episodes, cycles: [{ id: 'c1', startDate: '2025-03-03' }] })
  assert.equal(report.episodeRows.find((item) => item.id === 'unknown').severity, null)
  assert.equal(report.episodeRows.find((item) => item.id === 'unknown').duration, null)
  assert.equal(report.episodeRows.find((item) => item.id === 'zero').severity, 0)
  assert.ok(report.missingInformation.some((item) => item.includes('no recorded peak severity')))
  assert.ok(report.missingInformation.some((item) => item.includes('no complete recorded duration')))
  assert.equal(report.timeframe.from, '2025-03-02')
  assert.equal(report.timeframe.to, '2025-03-03')
})

test('appointment questions are deterministic and respond to available facts', () => {
  const lowDataReport = prepareDoctorReport({ patient: patient(), episodes: [], cycles: [], medicationRecords: { regimens: [], intakes: [] } })
  const repeated = buildAppointmentQuestions(lowDataReport)
  assert.deepEqual(repeated, lowDataReport.templateQuestions)
  assert.match(repeated[0], /additional migraine or menstrual-cycle information/)
  assert.equal(repeated.some((question) => question.includes('medication')), false)

  const richerReport = prepareDoctorReport({
    patient: patient(),
    episodes: [episode('e1', '2025-03-03', { associatedSymptoms: ['nausea'] }), episode('e2', '2025-03-15')],
    cycles: [{ id: 'c1', startDate: '2025-02-03' }, { id: 'c2', startDate: '2025-03-03' }],
    medicationRecords: { regimens: [{ id: 'r1', name: 'Recorded medication' }], intakes: [] },
  })
  assert.ok(richerReport.templateQuestions.some((question) => question.includes('recorded migraine onsets')))
  assert.ok(richerReport.templateQuestions.some((question) => question.includes('nausea')))
  assert.ok(richerReport.templateQuestions.some((question) => question.includes('medication instructions')))
})

test('prepared report contains appointment, episode, cycle, medication, question, and limitation-ready facts', () => {
  const preparation = { appointment: { date: '2026-11-03', professionalType: 'GP', concerns: 'Bring a concise history.' }, customQuestions: [{ id: 'q1', text: 'My saved question?' }] }
  const report = prepareDoctorReport({ patient: patient(), episodes: [episode('e1', '2025-03-03')], cycles: cycleStarts.slice(0, 2), medicationRecords: { regimens: [], intakes: [] }, preparation })
  assert.equal(report.patient.name, 'Ava Chen')
  assert.deepEqual(report.appointment, preparation.appointment)
  assert.deepEqual(report.customQuestions, preparation.customQuestions)
  assert.equal(report.episodeCount, 1)
  assert.equal(report.episodeRows[0].duration, '4 hr')
  assert.deepEqual(report.cycleStarts.map((cycle) => cycle.date), ['2025-01-06', '2025-02-03'])
  assert.deepEqual(report.medications, { regimens: [], intakes: [] })
  assert.ok(report.dataSufficiencyExplanation)
  assert.ok(report.templateQuestions.length > 0)
})
