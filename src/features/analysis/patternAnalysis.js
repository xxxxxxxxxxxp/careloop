// Calendar-only analysis: no system clock, network, predictions, or diagnosis.
export const WINDOW_DAY_NUMBERS = Object.freeze([-2, -1, 1, 2, 3])
const DAY_MS = 86400000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const localDateOf = (timestamp) => typeof timestamp === 'string' ? timestamp.slice(0, 10) : null
const utcDay = (date) => { if (!DATE_RE.test(date ?? '')) return null; const [y, m, d] = date.split('-').map(Number); const value = Date.UTC(y, m - 1, d); return Number.isNaN(value) ? null : value }
export const diffCalendarDays = (from, to) => { const a = utcDay(from); const b = utcDay(to); return a === null || b === null ? null : Math.round((b - a) / DAY_MS) }
export const addCalendarDays = (date, amount) => { const day = utcDay(date); if (day === null) return null; const value = new Date(day + amount * DAY_MS); return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}` }
// ICHD labels the period-start calendar date as day 1, deliberately with no day 0.
export const menstrualDayNumber = (onsetDate, periodStartDate) => { const difference = diffCalendarDays(periodStartDate, onsetDate); return difference === null ? null : difference >= 0 ? difference + 1 : difference }
export const windowDates = (periodStartDate) => [-2, -1, 0, 1, 2].map((offset) => addCalendarDays(periodStartDate, offset))

const validStart = (value) => typeof value === 'string' && DATE_RE.test(value)
const ratio = (part, whole) => whole ? part / whole : null
const mean = (values) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null

export function normaliseConfirmedCycles(cycles = []) {
  const unique = new Map()
  for (const cycle of cycles) if (validStart(cycle?.startDate) && !unique.has(cycle.startDate)) unique.set(cycle.startDate, cycle)
  const starts = [...unique.keys()].sort()
  return starts.map((startDate, index) => {
    const nextStartDate = starts[index + 1] ?? null
    const lengthDays = nextStartDate ? diffCalendarDays(startDate, nextStartDate) : null
    const previousStartDate = starts[index - 1] ?? null
    const previousLength = previousStartDate ? diffCalendarDays(previousStartDate, startDate) : null
    // Neither endpoint is a reliable anchor when the interval between two
    // purported starts is implausible; otherwise the later anchor could
    // incorrectly classify dates in the bad interval as its -2/-1 days.
    const implausible = (lengthDays !== null && (lengthDays < 10 || lengthDays > 60)) || (previousLength !== null && (previousLength < 10 || previousLength > 60))
    return { id: unique.get(startDate).id ?? startDate, startDate, nextStartDate, lengthDays: implausible ? null : lengthDays, status: implausible ? 'implausible' : nextStartDate ? 'complete' : 'open' }
  })
}

export function analysePattern({ cycles = [], episodes = [], asOfDate = '2025-03-20' } = {}) {
  const normalisedCycles = normaliseConfirmedCycles(cycles)
  const usableCycles = normalisedCycles.filter((cycle) => cycle.status !== 'implausible')
  const seen = new Set()
  const classifications = []
  for (const episode of episodes) {
    if (!episode?.id || seen.has(episode.id)) continue
    seen.add(episode.id)
    const onsetDate = localDateOf(episode.startAt)
    if (!validStart(onsetDate)) { classifications.push({ id: episode.id, onsetDate: null, status: 'excluded', reason: 'missing onset date', episode }); continue }
    // The first anchor can legitimately match its -2/-1 days, even though they
    // precede the anchor date itself. Only exclude dates before that first window.
    if (!usableCycles.length || onsetDate < addCalendarDays(usableCycles[0].startDate, -2)) { classifications.push({ id: episode.id, onsetDate, status: 'excluded', reason: 'before first confirmed period window', episode }); continue }
    const matches = usableCycles.filter((cycle) => windowDates(cycle.startDate).includes(onsetDate))
    const anchor = matches.sort((a, b) => Math.abs(menstrualDayNumber(onsetDate, a.startDate)) - Math.abs(menstrualDayNumber(onsetDate, b.startDate)) || a.startDate.localeCompare(b.startDate))[0]
    classifications.push({ id: episode.id, onsetDate, status: anchor ? 'inWindow' : 'outsideWindow', menstrualDay: anchor ? menstrualDayNumber(onsetDate, anchor.startDate) : null, periodStartDate: anchor?.startDate ?? null, episode })
  }
  const classified = classifications.filter((item) => item.status === 'inWindow' || item.status === 'outsideWindow')
  const inWindow = classifications.filter((item) => item.status === 'inWindow')
  const completeCycles = normalisedCycles.filter((cycle) => cycle.status === 'complete')
  const territory = (item) => completeCycles.find((cycle) => item.onsetDate >= cycle.startDate && item.onsetDate < cycle.nextStartDate)
  const baselineEpisodes = classified.filter(territory)
  const expectedInWindow = baselineEpisodes.reduce((total, item) => total + 5 / territory(item).lengthDays, 0)
  const observedInBaseline = baselineEpisodes.filter((item) => item.status === 'inWindow').length
  const severity = (items) => mean(items.map((item) => item.episode.peakSeverity).filter(Number.isFinite))
  const level = completeCycles.length >= 3 && classified.length >= 6 ? 2 : completeCycles.length >= 1 && classified.length >= 2 ? 1 : 0
  return {
    asOfDate, cycles: normalisedCycles, classifications, counts: { recordedEpisodes: seen.size, classified: classified.length, inWindow: inWindow.length, outsideWindow: classified.filter((item) => item.status === 'outsideWindow').length, excluded: classifications.length - classified.length },
    observedRatio: ratio(inWindow.length, classified.length), baseline: { completeCycles: completeCycles.length, episodesInBaseline: baselineEpisodes.length, expectedInWindow, expectedRatio: ratio(expectedInWindow, baselineEpisodes.length), observedInBaseline, observedRatio: ratio(observedInBaseline, baselineEpisodes.length) },
    severity: { inWindow: severity(inWindow), outsideWindow: severity(classified.filter((item) => item.status === 'outsideWindow')) },
    dataSufficiency: { level, completeCycles: completeCycles.length, episodeCount: classified.length },
  }
}

export function recordedPatternsCopy(result) {
  if (result.dataSufficiency.level === 0) return `You have ${result.counts.classified} usable recorded onset date${result.counts.classified === 1 ? '' : 's'}. More confirmed period starts and onset dates are needed before summarising the log.`
  if (result.dataSufficiency.level === 1) return `${result.counts.inWindow} of ${result.counts.classified} recorded onset dates fall in the five calendar days around a confirmed period start. This is an early log summary, not a conclusion.`
  return `${result.counts.inWindow} of ${result.counts.classified} recorded onset dates fall in the five calendar days around a confirmed period start. This describes the recorded history only.`
}
