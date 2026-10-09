export const EPISODE_STORE_KEY = 'careloop.user.episodes.v1'
const EMPTY_STORE = () => ({ version: 1, byPatient: { usr_ava: [], usr_mei: [], usr_sofia: [] }, hiddenFixtureIdsByPatient: { usr_ava: [], usr_mei: [], usr_sofia: [] }, fixtureOverridesByPatient: { usr_ava: {}, usr_mei: {}, usr_sofia: {} } })
let memoryStore = EMPTY_STORE()

const clone = (value) => JSON.parse(JSON.stringify(value))
const usableStorage = (storage) => storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'

export function readEpisodeStore(storage = globalThis.localStorage) {
  if (!usableStorage(storage)) return { store: clone(memoryStore), persistent: false }
  try {
    const raw = storage.getItem(EPISODE_STORE_KEY)
    if (!raw) return { store: EMPTY_STORE(), persistent: true }
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.version !== 1 || !parsed.byPatient || typeof parsed.byPatient !== 'object') throw new Error('Unsupported episode store')
      return { store: { ...EMPTY_STORE(), ...parsed, byPatient: { ...EMPTY_STORE().byPatient, ...parsed.byPatient }, hiddenFixtureIdsByPatient: { ...EMPTY_STORE().hiddenFixtureIdsByPatient, ...(parsed.hiddenFixtureIdsByPatient ?? {}) }, fixtureOverridesByPatient: { ...EMPTY_STORE().fixtureOverridesByPatient, ...(parsed.fixtureOverridesByPatient ?? {}) } }, persistent: true }
    } catch (error) {
      console.warn('CareLoop episode storage is invalid; starting with an empty diary.', error)
      return { store: EMPTY_STORE(), persistent: true }
    }
  } catch (error) {
    console.warn('CareLoop episode storage could not be read; using this session only.', error)
    return { store: clone(memoryStore), persistent: false }
  }
}

export function writeEpisodeStore(store, storage = globalThis.localStorage) {
  memoryStore = clone(store)
  if (!usableStorage(storage)) return { persistent: false }
  try {
    storage.setItem(EPISODE_STORE_KEY, JSON.stringify(store))
    return { persistent: true }
  } catch (error) {
    console.warn('CareLoop episode storage could not be written.', error)
    return { persistent: false, error }
  }
}

export function userEpisodesFor(patientId, storage = globalThis.localStorage) {
  const result = readEpisodeStore(storage)
  return { episodes: result.store.byPatient[patientId] ?? [], persistent: result.persistent }
}

export function saveUserEpisode(episode, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  const entries = store.byPatient[episode.patientId] ?? []
  const index = entries.findIndex((entry) => entry.id === episode.id)
  if (index === -1 && entries.length >= 500) return { ok: false, error: 'You can save up to 500 entries per demo patient.' }
  store.byPatient[episode.patientId] = index === -1 ? [...entries, episode] : entries.map((entry) => entry.id === episode.id ? episode : entry)
  const result = writeEpisodeStore(store, storage)
  return result.persistent ? { ok: true, persistent: true } : { ok: true, persistent: false, error: "Couldn't save on this device. Your entries are still shown but not stored." }
}

export function removeUserEpisode(patientId, episodeId, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  store.byPatient[patientId] = (store.byPatient[patientId] ?? []).filter((episode) => episode.id !== episodeId)
  const result = writeEpisodeStore(store, storage)
  return { ok: true, persistent: result.persistent }
}

export function resetPatientEpisodes(patientId, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  store.byPatient[patientId] = []
  store.hiddenFixtureIdsByPatient[patientId] = []
  store.fixtureOverridesByPatient[patientId] = {}
  return writeEpisodeStore(store, storage)
}

export function hideFixtureEpisode(patientId, episodeId, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  const hidden = store.hiddenFixtureIdsByPatient[patientId] ?? []
  store.hiddenFixtureIdsByPatient[patientId] = hidden.includes(episodeId) ? hidden : [...hidden, episodeId]
  return writeEpisodeStore(store, storage)
}

export function restoreFixtureEpisode(patientId, episodeId, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  store.hiddenFixtureIdsByPatient[patientId] = (store.hiddenFixtureIdsByPatient[patientId] ?? []).filter((id) => id !== episodeId)
  return writeEpisodeStore(store, storage)
}

export function hiddenFixtureIdsFor(patientId, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  return store.hiddenFixtureIdsByPatient[patientId] ?? []
}

export function fixtureOverridesFor(patientId, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  return store.fixtureOverridesByPatient[patientId] ?? {}
}

export function saveFixtureOverride(episode, storage = globalThis.localStorage) {
  const { store } = readEpisodeStore(storage)
  store.fixtureOverridesByPatient[episode.patientId] = { ...(store.fixtureOverridesByPatient[episode.patientId] ?? {}), [episode.id]: episode }
  return writeEpisodeStore(store, storage)
}
