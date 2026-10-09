import { DEMO_NOW, asMillis } from '../../lib/demoClock'
import { fixtureEpisodesFor } from '../../data/fixtures'
import { fixtureOverridesFor, hiddenFixtureIdsFor, userEpisodesFor } from '../../lib/localStore'

export const byStartDesc = (a, b) => b.startAt.localeCompare(a.startAt)
export const selectEpisodes = (patientId, storage) => {
  const hidden = new Set(hiddenFixtureIdsFor(patientId, storage))
  const overrides = fixtureOverridesFor(patientId, storage)
  const fixtures = fixtureEpisodesFor(patientId).filter((episode) => !hidden.has(episode.id)).map((episode) => ({ ...episode, ...(overrides[episode.id] ?? {}), origin: 'fixture', patientId }))
  return [...fixtures, ...userEpisodesFor(patientId, storage).episodes].sort(byStartDesc)
}
export const selectOngoing = (episodes) => episodes.filter((episode) => episode.endAt === null && episode.endUnknown !== true)
export const selectEntriesLoggedByYou = (episodes) => episodes.filter((episode) => episode.origin === 'user')
export const selectAttacksLast30 = (episodes) => episodes.filter((episode) => { const age = asMillis(DEMO_NOW) - asMillis(episode.startAt); return age >= 0 && age <= 30 * 86400000 })
export const selectDaysSinceLastAttack = (episodes) => episodes.length ? Math.floor((asMillis(DEMO_NOW) - asMillis(episodes[0].startAt)) / 86400000) : null
export const selectMeanPeakSeverity30 = (episodes) => { const values = selectAttacksLast30(episodes).map((episode) => episode.peakSeverity).filter((value) => Number.isFinite(value)); return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null }
export const selectImpactDays30 = (episodes) => new Set(selectAttacksLast30(episodes).filter((episode) => ['missed_work_or_school', 'bedbound'].includes(episode.functionalImpact)).map((episode) => episode.startAt.slice(0, 10))).size
