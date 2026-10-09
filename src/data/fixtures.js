import ava from './fixtures/ava.json'
import mei from './fixtures/mei.json'
import sofia from './fixtures/sofia.json'

const rawFixtures = { usr_ava: ava, usr_mei: mei, usr_sofia: sofia }

const freezeEpisode = (episode, patientId) => Object.freeze({
  ...episode,
  patientId,
  origin: 'fixture',
  endUnknown: false,
  associatedSymptoms: Array.isArray(episode.associatedSymptoms) ? [...episode.associatedSymptoms] : [],
  functionalImpact: episode.functionalImpact ?? null,
  notes: typeof episode.notes === 'string' ? episode.notes : '',
})

export const fixtureEpisodesFor = (patientId) => Object.freeze((rawFixtures[patientId]?.episodes ?? []).map((episode) => freezeEpisode(episode, patientId)))
