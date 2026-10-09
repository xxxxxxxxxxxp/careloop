export const SELECTED_PATIENT_KEY = 'careloop.selectedDemoPatient.v1'

const usableStorage = (storage) => storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'

export function initialPatientId(patients, storage = globalThis.localStorage) {
  const fallback = patients[0]?.id ?? null
  if (!usableStorage(storage)) return fallback
  try {
    const saved = storage.getItem(SELECTED_PATIENT_KEY)
    return patients.some((patient) => patient.id === saved) ? saved : fallback
  } catch { return fallback }
}

export function persistPatientId(patientId, patients, storage = globalThis.localStorage) {
  if (!patients.some((patient) => patient.id === patientId) || !usableStorage(storage)) return false
  try { storage.setItem(SELECTED_PATIENT_KEY, patientId); return true } catch { return false }
}

export function routeFromHash(hash, routeIds, fallback = 'dashboard') {
  const route = (hash ?? '').replace('#/', '')
  return routeIds.includes(route) ? route : fallback
}
