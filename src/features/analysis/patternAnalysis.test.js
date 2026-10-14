import test from 'node:test'
import assert from 'node:assert/strict'
import { addCalendarDays, analysePattern, menstrualDayNumber, windowDates } from './patternAnalysis.js'

const cycles = [{ id: 'a', startDate: '2025-01-06' }, { id: 'b', startDate: '2025-02-03' }, { id: 'c', startDate: '2025-03-03' }, { id: 'd', startDate: '2025-03-31' }]
const episode = (id, date, severity = null) => ({ id, startAt: `${date}T09:30:00+08:00`, peakSeverity: severity })

test('the menstrual window has exactly five dates and no day zero', () => {
  assert.deepEqual(windowDates('2025-03-03'), ['2025-03-01', '2025-03-02', '2025-03-03', '2025-03-04', '2025-03-05'])
  assert.equal(menstrualDayNumber('2025-03-03', '2025-03-03'), 1)
  assert.equal(menstrualDayNumber('2025-03-05', '2025-03-03'), 3)
  assert.equal(menstrualDayNumber('2025-03-01', '2025-03-03'), -2)
})
test('calendar arithmetic is safe across month, year, and leap-year boundaries', () => {
  assert.equal(addCalendarDays('2024-03-01', -2), '2024-02-28')
  assert.equal(addCalendarDays('2025-01-01', -2), '2024-12-30')
  assert.equal(analysePattern({ cycles: [{ startDate: '2024-03-01' }], episodes: [episode('leap', '2024-02-28')] }).classifications[0].menstrualDay, -2)
})
test('episodes count once, classify against confirmed starts, and leave open cycles out of the reference', () => {
  const result = analysePattern({ cycles, episodes: [episode('one', '2025-03-01', 8), episode('one', '2025-03-01', 8), episode('two', '2025-03-15', 5)] })
  assert.equal(result.counts.recordedEpisodes, 2); assert.equal(result.counts.inWindow, 1); assert.equal(result.counts.outsideWindow, 1)
  assert.equal(result.baseline.episodesInBaseline, 2); assert.notEqual(result.baseline.expectedRatio, 214 / 1000)
})
test('missing starts, pre-anchor onsets, and implausible intervals do not create false matches', () => {
  assert.equal(analysePattern({ cycles: [], episodes: [episode('none', '2025-03-03')] }).classifications[0].status, 'excluded')
  assert.equal(analysePattern({ cycles: [{ startDate: '2025-03-03' }], episodes: [episode('old', '2025-02-28')] }).classifications[0].reason, 'before first confirmed period window')
  assert.equal(analysePattern({ cycles: [{ startDate: '2025-01-01' }, { startDate: '2025-01-05' }], episodes: [episode('bad', '2025-01-03')] }).counts.inWindow, 0)
})
test('the retained sufficiency rule requires three complete cycles and six usable episodes', () => {
  const six = Array.from({ length: 6 }, (_, index) => episode(`ep${index}`, '2025-03-03'))
  assert.equal(analysePattern({ cycles: cycles.slice(0, 3), episodes: six }).dataSufficiency.level, 1)
  assert.equal(analysePattern({ cycles, episodes: six }).dataSufficiency.level, 2)
})
test('changed merged episode inputs affect only the supplied patient view', () => {
  const first = analysePattern({ cycles, episodes: [episode('saved', '2025-03-03')] })
  const deleted = analysePattern({ cycles, episodes: [] })
  const otherPatient = analysePattern({ cycles: [{ startDate: '2025-04-01' }], episodes: [episode('saved', '2025-03-03')] })
  assert.equal(first.counts.inWindow, 1); assert.equal(deleted.counts.recordedEpisodes, 0); assert.equal(otherPatient.counts.classified, 0)
})
