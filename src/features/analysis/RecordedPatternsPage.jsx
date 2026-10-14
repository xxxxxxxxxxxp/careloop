import { useMemo, useState } from 'react'
import { fixtureCyclesFor } from '../../data/fixtures'
import { calendarDataFor } from '../calendar/calendarStore'
import { explanationFacts, fetchAiExplanation } from './aiExplanation'
import { analysePattern, recordedPatternsCopy, WINDOW_DAY_NUMBERS } from './patternAnalysis'

const percent = (value) => value === null ? 'Not available' : `${Math.round(value * 100)}%`
const label = (day) => day > 0 ? `Day ${day}` : `Day ${day}`
export default function RecordedPatternsPage({ patient, episodes }) {
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [accessRequired, setAccessRequired] = useState(false)
  const [demoPassword, setDemoPassword] = useState('')
  const result = useMemo(() => {
    const local = calendarDataFor(patient.id)
    const cycles = [...fixtureCyclesFor(patient.id), ...local.periodStarts.map((item) => ({ id: item.id, startDate: item.date }))]
    return analysePattern({ cycles, episodes, asOfDate: '2025-03-20' })
  }, [patient.id, episodes])
  const fallback = recordedPatternsCopy(result)
  const generateExplanation = async () => {
    setLoading(true)
    setError('')
    setExplanation('')
    try {
      setExplanation(await fetchAiExplanation(explanationFacts(result), { demoPassword }))
    } catch (requestError) {
      if (requestError?.category === 'ACCESS_REQUIRED') setAccessRequired(true)
      setError(requestError instanceof Error ? requestError.message : 'The AI explanation is unavailable.')
    } finally {
      setLoading(false)
    }
  }
  const marksFor = (startDate, day) => result.classifications.filter((item) => item.status === 'inWindow' && item.periodStartDate === startDate && item.menstrualDay === day)
  return <section>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-indigo-600">Synthetic historical reference: 20 Mar 2025</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Recorded Patterns</h1><p className="mt-2 max-w-2xl text-slate-600">A calendar-based summary of recorded migraine onset dates and confirmed period starts. It does not make a diagnosis or prediction.</p></div><span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">Synthetic historical data</span></div>
    <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(59,76,155,0.07)]"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Recorded onsets in window" value={`${result.counts.inWindow} / ${result.counts.classified}`} detail={percent(result.observedRatio)} /><Metric label="Complete cycles" value={result.dataSufficiency.completeCycles} detail={`Data sufficiency: Level ${result.dataSufficiency.level}`} /><Metric label="Outside the window" value={result.counts.outsideWindow} detail={`${result.counts.excluded} excluded / unknown`} /></div><p className="mt-5 rounded-2xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">{fallback}</p></section>
    <section className="mt-6 rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-6" aria-labelledby="ai-explanation-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">CareLoop Insights</p><h2 id="ai-explanation-title" className="mt-1 text-lg font-bold text-slate-900">AI explanation</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Sends only the aggregate counts above to the published agent. No diary notes, dates, names or patient identifiers are sent.</p></div>
        <button type="button" onClick={generateExplanation} disabled={loading} className="w-fit rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{loading ? 'Generating…' : explanation ? 'Generate again' : 'Generate AI Explanation'}</button>
      </div>
      {accessRequired && <div className="mt-4 max-w-sm"><label htmlFor="demo-access-password" className="text-sm font-semibold text-slate-700">Demo access password</label><input id="demo-access-password" type="password" autoComplete="current-password" value={demoPassword} onChange={(event) => setDemoPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /><p className="mt-1 text-xs text-slate-500">Held in memory for this page only and sent only to the CareLoop server over HTTPS.</p></div>}
      <div className="mt-5 min-h-20 rounded-2xl border border-white bg-white/80 p-4" aria-live="polite" aria-busy={loading}>
        {loading && <p className="text-sm text-slate-600">Asking CareLoop Insights to explain the recorded pattern…</p>}
        {!loading && explanation && <><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{explanation}</p><p className="mt-3 text-xs font-semibold text-violet-700">Generated by Tencent Cloud ADP from synthetic aggregate facts.</p></>}
        {!loading && error && <><p role="alert" className="text-sm font-semibold text-rose-700">{error}</p><p className="mt-3 text-sm leading-6 text-slate-700"><strong>Safe recorded-summary fallback:</strong> {fallback}</p></>}
        {!loading && !explanation && !error && <p className="text-sm text-slate-500">Generate an optional plain-language explanation. The deterministic cards and summary remain the source of truth.</p>}
      </div>
      <p className="mt-3 text-xs text-slate-500">AI output is screened for unsupported statistics, diagnoses and medication guidance. This feature does not provide medical advice.</p>
    </section>
    <section className="mt-6 rounded-3xl border border-blue-100 bg-white p-6"><h2 className="text-lg font-bold text-slate-900">Onset timeline around confirmed period starts</h2><p className="mt-1 text-sm text-slate-500">Five calendar days only: −2, −1, 1, 2 and 3. The period start is labelled day 1; there is no day 0.</p><div className="mt-5 space-y-3">{result.cycles.map((cycle) => <div key={cycle.startDate} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Confirmed start: {cycle.startDate}</strong><span className="text-slate-500">{cycle.status === 'complete' ? `${cycle.lengthDays}-day complete cycle` : cycle.status === 'open' ? 'Open / partial cycle' : 'Excluded implausible interval'}</span></div><div className="mt-3 grid grid-cols-5 gap-2">{WINDOW_DAY_NUMBERS.map((day) => <div key={day} className="min-h-14 rounded-xl bg-white p-2 text-center text-xs text-slate-500"><span>{label(day)}</span><div className="mt-2 flex justify-center gap-1" aria-label={`${marksFor(cycle.startDate, day).length} migraine onsets on ${label(day)}`}>{marksFor(cycle.startDate, day).map((item) => <i key={item.id} title={item.onsetDate} className="size-2 rounded-full bg-blue-500" />)}</div></div>)}</div></div>)}</div></section>
    <details className="mt-6 rounded-3xl border border-violet-100 bg-violet-50 p-5"><summary className="cursor-pointer font-bold text-slate-900">How calculated</summary><div className="mt-4 space-y-3 text-sm text-slate-700"><p>Uses migraine onset dates only, not episode end dates. Uses confirmed period starts only; a cycle end date is not treated as a bleeding end date.</p><p>Period starts used: {result.cycles.length ? result.cycles.map((cycle) => cycle.startDate).join(', ') : 'none recorded'}.</p><ul className="list-disc space-y-1 pl-5">{result.classifications.map((item) => <li key={item.id}>{item.onsetDate ?? 'Unknown onset'} — {item.status === 'inWindow' ? `${label(item.menstrualDay)} relative to ${item.periodStartDate}` : item.status === 'outsideWindow' ? 'outside the five-day window' : `excluded: ${item.reason}`}</li>)}</ul><p>For complete cycles with known lengths, the optional even-timing reference uses five divided by that cycle’s length. It is a descriptive comparison, not a clinical probability.</p>{result.baseline.episodesInBaseline > 0 && <p>Even-timing reference: {percent(result.baseline.expectedRatio)} across {result.baseline.episodesInBaseline} recorded onsets in complete cycles.</p>}<p className="text-xs text-slate-500">This is a record summary, not a diagnosis. Discuss symptoms or concerns with a qualified clinician.</p></div></details>
  </section>
}
function Metric({ label, value, detail }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div> }
