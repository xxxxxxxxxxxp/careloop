export const DOCTOR_PREPARATION_STORE_KEY = 'careloop.doctorPreparation.v1'

const EMPTY_PATIENT = () => ({
  appointment: { date: '', professionalType: '', concerns: '' },
  customQuestions: [],
})
const EMPTY_STORE = () => ({ version: 1, byPatient: {} })
const clone = (value) => JSON.parse(JSON.stringify(value))
const usable = (storage) => storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
let memoryStore = EMPTY_STORE()

const cleanText = (value, maxLength) => typeof value === 'string' ? value.slice(0, maxLength) : ''
const patientData = (store, patientId) => {
  const saved = store.byPatient[patientId] ?? {}
  const appointment = saved.appointment ?? {}
  return {
    appointment: {
      date: /^\d{4}-\d{2}-\d{2}$/.test(appointment.date ?? '') ? appointment.date : '',
      professionalType: cleanText(appointment.professionalType, 120),
      concerns: cleanText(appointment.concerns, 2000),
    },
    customQuestions: Array.isArray(saved.customQuestions)
      ? saved.customQuestions.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string').map((item) => ({ id: item.id, text: cleanText(item.text, 500) }))
      : [],
  }
}

export function readDoctorPreparationStore(storage = globalThis.localStorage) {
  if (!usable(storage)) return { store: clone(memoryStore), persistent: false }
  try {
    const raw = storage.getItem(DOCTOR_PREPARATION_STORE_KEY)
    if (!raw) return { store: EMPTY_STORE(), persistent: true }
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !parsed.byPatient || typeof parsed.byPatient !== 'object') throw new Error('Unsupported doctor preparation store')
    return { store: { ...EMPTY_STORE(), ...parsed, byPatient: { ...parsed.byPatient } }, persistent: true }
  } catch (error) {
    console.warn('CareLoop doctor preparation storage is invalid; starting with an empty appointment plan.', error)
    return { store: EMPTY_STORE(), persistent: true }
  }
}

function writeDoctorPreparationStore(store, storage = globalThis.localStorage) {
  memoryStore = clone(store)
  if (!usable(storage)) return { persistent: false }
  try {
    storage.setItem(DOCTOR_PREPARATION_STORE_KEY, JSON.stringify(store))
    return { persistent: true }
  } catch (error) {
    console.warn('CareLoop doctor preparation storage could not be written.', error)
    return { persistent: false, error }
  }
}

export function doctorPreparationFor(patientId, storage = globalThis.localStorage) {
  const { store, persistent } = readDoctorPreparationStore(storage)
  return { ...patientData(store, patientId), persistent }
}

export function saveAppointmentDetails(patientId, appointment, storage = globalThis.localStorage) {
  const { store } = readDoctorPreparationStore(storage)
  const current = patientData(store, patientId)
  store.byPatient[patientId] = {
    ...current,
    appointment: patientData({ byPatient: { [patientId]: { appointment } } }, patientId).appointment,
  }
  return { ok: true, ...writeDoctorPreparationStore(store, storage) }
}

export function saveCustomQuestion(patientId, question, storage = globalThis.localStorage) {
  const text = cleanText(question?.text, 500).trim()
  if (!question?.id || !text) return { ok: false, persistent: true, error: 'Enter a question before saving.' }
  const { store } = readDoctorPreparationStore(storage)
  const current = patientData(store, patientId)
  const index = current.customQuestions.findIndex((item) => item.id === question.id)
  if (index < 0 && current.customQuestions.length >= 30) return { ok: false, persistent: true, error: 'This demo can store up to 30 appointment questions per patient.' }
  current.customQuestions = index < 0
    ? [...current.customQuestions, { id: question.id, text }]
    : current.customQuestions.map((item) => item.id === question.id ? { id: question.id, text } : item)
  store.byPatient[patientId] = current
  return { ok: true, ...writeDoctorPreparationStore(store, storage) }
}

export function removeCustomQuestion(patientId, questionId, storage = globalThis.localStorage) {
  const { store } = readDoctorPreparationStore(storage)
  const current = patientData(store, patientId)
  current.customQuestions = current.customQuestions.filter((item) => item.id !== questionId)
  store.byPatient[patientId] = current
  return { ok: true, ...writeDoctorPreparationStore(store, storage) }
}
