import ava from './fixtures/ava.json' with { type: 'json' }
import mei from './fixtures/mei.json' with { type: 'json' }
import sofia from './fixtures/sofia.json' with { type: 'json' }

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

const freezeRegimen = (regimen, patientId) => Object.freeze({
  ...regimen,
  patientId,
  origin: 'fixture',
  reminderTimes: Object.freeze(Array.isArray(regimen.reminderTimes) ? [...regimen.reminderTimes] : []),
  notes: typeof regimen.notes === 'string' ? regimen.notes : null,
})

const freezeIntake = (intake, patientId) => Object.freeze({
  ...intake,
  patientId,
  origin: 'fixture',
  doseText: typeof intake.doseText === 'string' ? intake.doseText : null,
  linkedEpisodeId: typeof intake.linkedEpisodeId === 'string' ? intake.linkedEpisodeId : null,
  sideEffects: Object.freeze(Array.isArray(intake.sideEffects) ? [...intake.sideEffects] : []),
  isSkipped: intake.isSkipped === true,
  skipReason: typeof intake.skipReason === 'string' ? intake.skipReason : null,
  notes: typeof intake.notes === 'string' ? intake.notes : null,
})

export const fixtureEpisodesFor = (patientId) => Object.freeze((rawFixtures[patientId]?.episodes ?? []).map((episode) => freezeEpisode(episode, patientId)))
export const fixtureCyclesFor = (patientId) => Object.freeze((rawFixtures[patientId]?.cycles ?? []).map((cycle) => Object.freeze({ ...cycle, patientId, origin: 'fixture' })))
export const fixturePeriodDaysFor = (patientId) => Object.freeze((rawFixtures[patientId]?.periodDays ?? []).map((day) => Object.freeze({ ...day, patientId, origin: 'fixture' })))
export const fixtureRegimensFor = (patientId) => Object.freeze((rawFixtures[patientId]?.regimens ?? []).map((regimen) => freezeRegimen(regimen, patientId)))
export const fixtureIntakesFor = (patientId) => Object.freeze((rawFixtures[patientId]?.intakeEvents ?? []).map((intake) => freezeIntake(intake, patientId)))
