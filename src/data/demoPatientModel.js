export const DEMO_DATE = '2025-03-20'

const numericFields = [
  'energyLevel', 'breastTenderness', 'bloating', 'cramps', 'stressLevel',
  'caffeineUnits', 'alcoholUnits', 'mealsSkipped', 'exerciseMinutes', 'hydrationGlasses',
]

const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const nullableNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const nullableBoolean = (value) => typeof value === 'boolean' ? value : null

function validateFixture(fixture) {
  if (!fixture || typeof fixture !== 'object' || !fixture.profile?.id) throw new Error('Demo fixture is missing a profile id.')
  if (!Array.isArray(fixture.cycles) || !Array.isArray(fixture.episodes) || !Array.isArray(fixture.dailyLogs)) {
    throw new Error(`Demo fixture ${fixture.profile.id} is missing a required history collection.`)
  }
  fixture.cycles.forEach((cycle) => {
    if (!isDate(cycle.startDate) || (cycle.endDate !== null && !isDate(cycle.endDate))) throw new Error(`Invalid cycle date in ${fixture.profile.id}.`)
  })
  fixture.episodes.forEach((episode) => {
    if (typeof episode.startAt !== 'string' || (episode.endAt !== null && typeof episode.endAt !== 'string')) throw new Error(`Invalid episode timestamp in ${fixture.profile.id}.`)
  })
}

export function calculateDataSufficiency({ cycles, episodes, dailyLogs }) {
  const completeCycles = cycles.filter((cycle) => cycle.isComplete === true).length
  const episodeCount = episodes.length
  const loggedDays = dailyLogs.length
  const level = completeCycles >= 3 && episodeCount >= 6 ? 2 : (completeCycles >= 1 || loggedDays >= 28) && episodeCount >= 2 ? 1 : 0
  return { level, completeCycles, episodeCount, loggedDays }
}

export function selectDemoPatient(patients, patientId) {
  return patients.find((patient) => patient.id === patientId) ?? patients[0] ?? null
}

export function normaliseDemoPatient(fixture, name) {
  validateFixture(fixture)
  const cycles = fixture.cycles.map((cycle) => ({
    id: cycle.id,
    startDate: cycle.startDate,
    endDate: cycle.endDate ?? null,
    isComplete: cycle.isComplete === true,
    lengthDays: nullableNumber(cycle.lengthDays),
    source: cycle.source ?? null,
  }))
  const episodes = fixture.episodes.map((episode) => ({
    id: episode.id,
    startAt: episode.startAt,
    endAt: episode.endAt ?? null,
    durationMin: nullableNumber(episode.durationMin),
    peakSeverity: nullableNumber(episode.peakSeverity),
    notes: typeof episode.notes === 'string' ? episode.notes : null,
  }))
  const dailyLogs = fixture.dailyLogs.map((log) => {
    const normalised = { date: log.date, headachePresent: nullableBoolean(log.headachePresent) }
    numericFields.forEach((field) => { normalised[field] = nullableNumber(log[field]) })
    return normalised
  })
  return {
    id: fixture.profile.id,
    name,
    profile: {
      ageBand: fixture.profile.ageBand ?? null,
      timezone: fixture.profile.timezone ?? null,
      cycleRegularity: fixture.profile.cycleRegularity ?? null,
      cycleLengthEstimate: nullableNumber(fixture.profile.cycleLengthEstimate),
      periodLengthEstimate: nullableNumber(fixture.profile.periodLengthEstimate),
    },
    cycles,
    episodes,
    dailyLogs,
    dataSufficiency: calculateDataSufficiency({ cycles, episodes, dailyLogs }),
  }
}
