import { recordedPatternsCopy, analysePattern } from '../analysis/patternAnalysis.js'
import { durationMinutes } from '../diary/duration.js'

const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const present = (value) => typeof value === 'string' && value.trim() ? value.trim() : null

export function formatRecordedDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return null
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

function episodeSummary(episode) {
  const calculatedDuration = Number.isFinite(episode.durationMin) ? episode.durationMin : durationMinutes(episode.startAt, episode.endAt)
  return {
    id: episode.id,
    date: validDate(episode.startAt?.slice(0, 10)) ? episode.startAt.slice(0, 10) : null,
    durationMinutes: Number.isFinite(calculatedDuration) ? calculatedDuration : null,
    duration: formatRecordedDuration(calculatedDuration),
    severity: Number.isFinite(episode.peakSeverity) ? episode.peakSeverity : null,
    symptoms: Array.isArray(episode.associatedSymptoms) ? episode.associatedSymptoms.filter((item) => typeof item === 'string') : [],
    endStatus: episode.endAt ? 'ended' : episode.endUnknown ? 'end time not recorded' : 'ongoing',
  }
}

function missingInformation(episodeRows, pattern) {
  const missing = []
  if (!episodeRows.length) missing.push('No migraine episodes are currently recorded.')
  else {
    const missingSeverity = episodeRows.filter((episode) => episode.severity === null).length
    const missingDuration = episodeRows.filter((episode) => episode.duration === null).length
    if (missingSeverity) missing.push(`${missingSeverity} episode${missingSeverity === 1 ? '' : 's'} ${missingSeverity === 1 ? 'has' : 'have'} no recorded peak severity.`)
    if (missingDuration) missing.push(`${missingDuration} episode${missingDuration === 1 ? '' : 's'} ${missingDuration === 1 ? 'has' : 'have'} no complete recorded duration.`)
    if (!episodeRows.some((episode) => episode.symptoms.length)) missing.push('No associated migraine symptoms are recorded.')
  }
  if (!pattern.cycles.length) missing.push('No confirmed menstrual-cycle start is recorded.')
  else if (pattern.dataSufficiency.completeCycles < 3) missing.push('Fewer than three completed cycles are available for the timing summary.')
  if (pattern.counts.excluded) missing.push(`${pattern.counts.excluded} migraine onset${pattern.counts.excluded === 1 ? ' was' : 's were'} excluded from timing classification because the recorded dates could not be compared reliably.`)
  return missing
}

export function buildAppointmentQuestions(report) {
  const questions = []
  const { pattern, episodeRows, medications } = report
  if (pattern.dataSufficiency.level === 0) {
    questions.push('What additional migraine or menstrual-cycle information would be most useful to record before assessing timing?')
  } else if (pattern.counts.inWindow > 0) {
    questions.push(`Do the ${pattern.counts.inWindow} of ${pattern.counts.classified} recorded migraine onsets near confirmed period starts warrant further monitoring?`)
  } else {
    questions.push('Does the recorded timing so far suggest any particular information would be useful to monitor next?')
  }

  if (report.missingInformation.length) questions.push('Which gaps in this record would be most useful to clarify before a future appointment?')

  const symptoms = [...new Set(episodeRows.flatMap((episode) => episode.symptoms))]
  if (symptoms.length) questions.push(`Which recorded symptoms should we discuss in more detail: ${symptoms.slice(0, 4).map((item) => item.replaceAll('_', ' ')).join(', ')}?`)
  else if (episodeRows.length) questions.push('Which symptoms or functional effects would be most useful to record with future migraine episodes?')

  if (medications.regimens.length || medications.intakes.length) questions.push('Which parts of the recorded medication instructions and intake history are most useful to review together?')
  return questions.slice(0, 4)
}

export function prepareDoctorReport({ patient, episodes = [], cycles = [], medicationRecords = {}, preparation = {}, asOfDate = '2025-03-20' }) {
  const pattern = analysePattern({ cycles, episodes, asOfDate })
  const episodeRows = episodes.map(episodeSummary).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const dates = episodeRows.map((episode) => episode.date).filter(Boolean).sort()
  const regimens = (medicationRecords.regimens ?? []).map((record) => ({
    id: record.id,
    name: present(record.name) ?? 'Name not recorded',
    purpose: present(record.purpose),
    amount: present(record.doseText),
    instructions: present(record.frequencyText),
    schedule: present(record.scheduleText),
  }))
  const intakes = (medicationRecords.intakes ?? []).map((record) => ({
    id: record.id,
    name: present(record.name) ?? 'Name not recorded',
    takenAt: typeof record.takenAt === 'string' ? record.takenAt : null,
    amount: present(record.doseText),
    linkedEpisodeId: present(record.linkedEpisodeId),
    isSkipped: record.isSkipped === true,
  }))
  const report = {
    patient: { id: patient.id, name: patient.name },
    appointment: preparation.appointment ?? { date: '', professionalType: '', concerns: '' },
    customQuestions: preparation.customQuestions ?? [],
    episodeCount: episodes.length,
    timeframe: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    episodeRows,
    cycleStarts: pattern.cycles.map((cycle) => ({ date: cycle.startDate, status: cycle.status, lengthDays: cycle.lengthDays })),
    completedCycleCount: pattern.dataSufficiency.completeCycles,
    pattern,
    dataSufficiencyExplanation: recordedPatternsCopy(pattern),
    medications: { regimens, intakes },
  }
  report.missingInformation = missingInformation(episodeRows, pattern)
  report.templateQuestions = buildAppointmentQuestions(report)
  return report
}
