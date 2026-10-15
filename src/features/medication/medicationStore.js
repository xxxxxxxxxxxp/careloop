export const MEDICATION_STORE_KEY = 'careloop.medications.v1'

const PATIENT_IDS = ['usr_ava', 'usr_mei', 'usr_sofia']
const EMPTY_PATIENT = () => ({
  regimens: [],
  intakes: [],
  hiddenRegimenIds: [],
  hiddenIntakeIds: [],
  regimenOverrides: {},
  intakeOverrides: {},
})
const EMPTY_STORE = () => ({
  version: 1,
  byPatient: Object.fromEntries(PATIENT_IDS.map((patientId) => [patientId, EMPTY_PATIENT()])),
})
const clone = (value) => JSON.parse(JSON.stringify(value))
const usable = (storage) => storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
let memoryStore = EMPTY_STORE()

const patientData = (store, patientId) => {
  const saved = store.byPatient[patientId] ?? {}
  return {
    ...EMPTY_PATIENT(),
    ...saved,
    regimens: Array.isArray(saved.regimens) ? saved.regimens : [],
    intakes: Array.isArray(saved.intakes) ? saved.intakes : [],
    hiddenRegimenIds: Array.isArray(saved.hiddenRegimenIds) ? saved.hiddenRegimenIds : [],
    hiddenIntakeIds: Array.isArray(saved.hiddenIntakeIds) ? saved.hiddenIntakeIds : [],
    regimenOverrides: saved.regimenOverrides && typeof saved.regimenOverrides === 'object' ? saved.regimenOverrides : {},
    intakeOverrides: saved.intakeOverrides && typeof saved.intakeOverrides === 'object' ? saved.intakeOverrides : {},
  }
}

export function readMedicationStore(storage = globalThis.localStorage) {
  if (!usable(storage)) return { store: clone(memoryStore), persistent: false }
  try {
    const raw = storage.getItem(MEDICATION_STORE_KEY)
    if (!raw) return { store: EMPTY_STORE(), persistent: true }
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !parsed.byPatient || typeof parsed.byPatient !== 'object') throw new Error('Unsupported medication store')
    return { store: { ...EMPTY_STORE(), ...parsed, byPatient: { ...EMPTY_STORE().byPatient, ...parsed.byPatient } }, persistent: true }
  } catch (error) {
    console.warn('CareLoop medication storage is invalid; starting with an empty local medication record.', error)
    return { store: EMPTY_STORE(), persistent: true }
  }
}

function writeMedicationStore(store, storage = globalThis.localStorage) {
  memoryStore = clone(store)
  if (!usable(storage)) return { persistent: false }
  try {
    storage.setItem(MEDICATION_STORE_KEY, JSON.stringify(store))
    return { persistent: true }
  } catch (error) {
    console.warn('CareLoop medication storage could not be written.', error)
    return { persistent: false, error }
  }
}

export function medicationChangesFor(patientId, storage = globalThis.localStorage) {
  const { store, persistent } = readMedicationStore(storage)
  return { ...patientData(store, patientId), persistent }
}

export function resetPatientMedications(patientId, storage = globalThis.localStorage) {
  const { store } = readMedicationStore(storage)
  store.byPatient[patientId] = EMPTY_PATIENT()
  return { ok: true, ...writeMedicationStore(store, storage) }
}

function saveUserRecord(patientId, collection, record, limit, storage) {
  const { store } = readMedicationStore(storage)
  const data = patientData(store, patientId)
  const entries = data[collection]
  const index = entries.findIndex((entry) => entry.id === record.id)
  if (index < 0 && entries.length >= limit) return { ok: false, persistent: true, error: `This demo can store up to ${limit} ${collection} per patient.` }
  data[collection] = index < 0 ? [...entries, record] : entries.map((entry) => entry.id === record.id ? record : entry)
  store.byPatient[patientId] = data
  const result = writeMedicationStore(store, storage)
  return { ok: true, persistent: result.persistent, error: result.persistent ? null : "Couldn't save permanently on this device." }
}

function removeUserRecord(patientId, collection, recordId, storage) {
  const { store } = readMedicationStore(storage)
  const data = patientData(store, patientId)
  data[collection] = data[collection].filter((entry) => entry.id !== recordId)
  store.byPatient[patientId] = data
  return { ok: true, ...writeMedicationStore(store, storage) }
}

function hideFixtureRecord(patientId, collection, recordId, storage) {
  const { store } = readMedicationStore(storage)
  const data = patientData(store, patientId)
  data[collection] = data[collection].includes(recordId) ? data[collection] : [...data[collection], recordId]
  store.byPatient[patientId] = data
  return { ok: true, ...writeMedicationStore(store, storage) }
}

function saveFixtureOverride(patientId, collection, record, storage) {
  const { store } = readMedicationStore(storage)
  const data = patientData(store, patientId)
  data[collection] = { ...data[collection], [record.id]: record }
  store.byPatient[patientId] = data
  return { ok: true, ...writeMedicationStore(store, storage) }
}

export const saveUserRegimen = (record, storage = globalThis.localStorage) => saveUserRecord(record.patientId, 'regimens', record, 100, storage)
export const removeUserRegimen = (patientId, id, storage = globalThis.localStorage) => removeUserRecord(patientId, 'regimens', id, storage)
export const hideFixtureRegimen = (patientId, id, storage = globalThis.localStorage) => hideFixtureRecord(patientId, 'hiddenRegimenIds', id, storage)
export const saveFixtureRegimenOverride = (record, storage = globalThis.localStorage) => saveFixtureOverride(record.patientId, 'regimenOverrides', record, storage)

export const saveUserIntake = (record, storage = globalThis.localStorage) => saveUserRecord(record.patientId, 'intakes', record, 1000, storage)
export const removeUserIntake = (patientId, id, storage = globalThis.localStorage) => removeUserRecord(patientId, 'intakes', id, storage)
export const hideFixtureIntake = (patientId, id, storage = globalThis.localStorage) => hideFixtureRecord(patientId, 'hiddenIntakeIds', id, storage)
export const saveFixtureIntakeOverride = (record, storage = globalThis.localStorage) => saveFixtureOverride(record.patientId, 'intakeOverrides', record, storage)
