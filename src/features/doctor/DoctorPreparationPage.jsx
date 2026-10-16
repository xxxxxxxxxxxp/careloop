import { useState } from 'react'
import { DEMO_DATE } from '../../data/demoPatients'
import { fixtureCyclesFor } from '../../data/fixtures'
import { calendarDataFor } from '../calendar/calendarStore'
import { selectMedicationRecords } from '../medication/medicationModel'
import { doctorPreparationFor, removeCustomQuestion, saveAppointmentDetails, saveCustomQuestion } from './doctorStore'
import { prepareDoctorReport } from './doctorReport'

const questionId = () => `question_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
const displayDate = (value) => {
  if (!value) return 'Not recorded'
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.valueOf()) ? 'Not recorded' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}
const displayDateTime = (value, timeZone) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Date not recorded'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || 'Asia/Shanghai' }).format(new Date(value))
}
const humanise = (value) => value ? value.replaceAll('_', ' ') : 'Not recorded'
const detail = (value) => value || 'Not recorded'

export default function DoctorPreparationPage({ patient, episodes }) {
  const [preparation, setPreparation] = useState(() => doctorPreparationFor(patient.id))
  const [newQuestion, setNewQuestion] = useState('')
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [notice, setNotice] = useState('')
  const localCalendar = calendarDataFor(patient.id)
  const cycles = [
    ...fixtureCyclesFor(patient.id),
    ...localCalendar.periodStarts.map((item) => ({ id: item.id, startDate: item.date, origin: 'user' })),
  ]
  const medicationRecords = selectMedicationRecords(patient.id)
  const report = prepareDoctorReport({ patient, episodes, cycles, medicationRecords, preparation, asOfDate: DEMO_DATE })

  const updateAppointment = (field, value) => {
    const appointment = { ...preparation.appointment, [field]: value }
    const result = saveAppointmentDetails(patient.id, appointment)
    setPreparation((current) => ({ ...current, appointment, persistent: result.persistent }))
    setNotice(result.persistent === false ? 'This appointment plan is available for this session but could not be saved on this device.' : 'Appointment details saved on this device.')
  }
  const refreshQuestions = (message, result) => {
    const next = doctorPreparationFor(patient.id)
    setPreparation(next)
    setNotice(result?.persistent === false ? `${message} It could not be saved permanently on this device.` : message)
  }
  const addQuestion = () => {
    const result = saveCustomQuestion(patient.id, { id: questionId(), text: newQuestion })
    if (result.ok === false) return setNotice(result.error)
    setNewQuestion('')
    refreshQuestions('Question added.', result)
  }
  const saveEditedQuestion = () => {
    if (!editingQuestion) return
    const result = saveCustomQuestion(patient.id, editingQuestion)
    if (result.ok === false) return setNotice(result.error)
    setEditingQuestion(null)
    refreshQuestions('Question updated.', result)
  }
  const deleteQuestion = (id) => {
    const result = removeCustomQuestion(patient.id, id)
    if (editingQuestion?.id === id) setEditingQuestion(null)
    refreshQuestions('Question removed.', result)
  }

  return <article className="doctor-print-report">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-indigo-600">Prepared from records for {patient.name}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Doctor Preparation</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Organise recorded history and questions for an appointment. This report does not diagnose a condition, assess medication suitability, or recommend treatment.</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">Synthetic demonstration data</span>
        <button type="button" onClick={() => globalThis.print()} className="no-print min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">Print / Save as PDF</button>
      </div>
    </header>

    {!preparation.persistent && <p className="no-print mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Appointment details and personal questions cannot be saved on this device. They remain available for this session.</p>}
    <p aria-live="polite" className="no-print mt-3 min-h-5 text-sm font-medium text-indigo-700">{notice}</p>

    <ReportSection number="1" title="Appointment Details" className="mt-5">
      <div className="no-print grid gap-4 md:grid-cols-2">
        <Field label="Appointment date (optional)"><input type="date" value={preparation.appointment.date} onChange={(event) => updateAppointment('date', event.target.value)} className="input" /></Field>
        <Field label="Healthcare professional type (optional)"><input type="text" maxLength="120" value={preparation.appointment.professionalType} onChange={(event) => updateAppointment('professionalType', event.target.value)} placeholder="For example, GP or neurologist" className="input" /></Field>
        <div className="md:col-span-2"><Field label="Main concerns or questions to raise (optional)"><textarea rows="4" maxLength="2000" value={preparation.appointment.concerns} onChange={(event) => updateAppointment('concerns', event.target.value)} placeholder="Record your own priorities for the appointment" className="input resize-y" /></Field></div>
      </div>
      <dl className="print-only grid grid-cols-2 gap-3 text-sm">
        <PrintDetail label="Patient" value={patient.name} />
        <PrintDetail label="Appointment date" value={displayDate(report.appointment.date)} />
        <PrintDetail label="Healthcare professional" value={detail(report.appointment.professionalType)} />
        <PrintDetail label="Main concerns or questions" value={detail(report.appointment.concerns)} wide />
      </dl>
    </ReportSection>

    <ReportSection number="2" title="Migraine & Cycle Summary">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Recorded episodes" value={report.episodeCount} detail={report.timeframe ? `${displayDate(report.timeframe.from)} to ${displayDate(report.timeframe.to)}` : 'No available timeframe'} />
        <Metric label="Confirmed cycle starts" value={report.cycleStarts.length} detail={`${report.completedCycleCount} completed cycle${report.completedCycleCount === 1 ? '' : 's'}`} />
        <Metric label="Onsets in five-day window" value={`${report.pattern.counts.inWindow} / ${report.pattern.counts.classified}`} detail={`${report.pattern.counts.excluded} excluded or unclassified`} />
        <Metric label="Data sufficiency" value={`Level ${report.pattern.dataSufficiency.level}`} detail={`${report.pattern.dataSufficiency.episodeCount} usable onset date${report.pattern.dataSufficiency.episodeCount === 1 ? '' : 's'}`} />
      </div>
      <p className="mt-4 rounded-2xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">{report.dataSufficiencyExplanation}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">The established CareLoop analysis uses five calendar dates around each confirmed period start: days −2, −1, 1, 2 and 3. It describes recorded timing only.</p>

      <Subheading>Migraine episodes</Subheading>
      {report.episodeRows.length ? <Table headers={['Onset date', 'Duration', 'Peak severity', 'Status']} rows={report.episodeRows.map((episode) => [displayDate(episode.date), episode.duration ?? 'Not recorded', episode.severity === null ? 'Not recorded' : `${episode.severity} / 10`, episode.endStatus])} /> : <Empty>No migraine episodes are recorded for this patient.</Empty>}

      <Subheading>Confirmed menstrual-cycle starts</Subheading>
      {report.cycleStarts.length ? <Table headers={['Start date', 'Cycle status', 'Recorded interval']} rows={report.cycleStarts.map((cycle) => [displayDate(cycle.date), cycle.status === 'complete' ? 'Completed' : cycle.status === 'open' ? 'Open / partial' : 'Excluded from analysis', cycle.lengthDays === null ? 'Not available' : `${cycle.lengthDays} days`])} /> : <Empty>No confirmed cycle starts are recorded.</Empty>}

      <Subheading>Information worth clarifying</Subheading>
      {report.missingInformation.length ? <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{report.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-slate-600">No standard completeness gaps were identified in the fields included in this report. This does not mean the history is clinically complete.</p>}
    </ReportSection>

    <ReportSection number="3" title="Medication Summary">
      <p className="text-sm leading-6 text-slate-600">Prescribed regimen records are shown separately from logged intake events. These are user-provided records; CareLoop does not assess whether they are medically appropriate.</p>
      <Subheading>Recorded regimens</Subheading>
      {report.medications.regimens.length ? <Table headers={['Medication', 'Purpose', 'Recorded amount', 'Recorded instructions']} rows={report.medications.regimens.map((record) => [record.name, humanise(record.purpose), detail(record.amount), [record.instructions, record.schedule].filter(Boolean).join(' · ') || 'Not recorded'])} /> : <Empty>No medication regimens are recorded.</Empty>}
      <Subheading>Logged intake events</Subheading>
      {report.medications.intakes.length ? <Table headers={['Medication', 'Recorded date and time', 'Amount taken', 'Record type']} rows={report.medications.intakes.map((record) => [record.name, displayDateTime(record.takenAt, patient.profile.timezone), detail(record.amount), record.isSkipped ? 'Skipped-dose record' : 'Intake record'])} /> : <Empty>No medication intake events are recorded.</Empty>}
    </ReportSection>

    <ReportSection number="4" title="Questions for My Doctor">
      <p className="text-sm text-slate-600">These deterministic prompts reflect the information currently available. Edit only your own questions below.</p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-800">{report.templateQuestions.map((question) => <li key={question}>{question}</li>)}</ol>

      {preparation.customQuestions.length > 0 && <><Subheading>My questions</Subheading><ul className="space-y-3">{preparation.customQuestions.map((question) => <li key={question.id} className="rounded-2xl bg-violet-50 p-4">{editingQuestion?.id === question.id ? <><div className="no-print"><textarea aria-label="Edit appointment question" rows="3" maxLength="500" value={editingQuestion.text} onChange={(event) => setEditingQuestion({ ...editingQuestion, text: event.target.value })} className="input resize-y" /><div className="mt-3 flex gap-2"><button type="button" onClick={saveEditedQuestion} className="min-h-10 rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white">Save</button><button type="button" onClick={() => setEditingQuestion(null)} className="min-h-10 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700">Cancel</button></div></div><p className="print-only whitespace-pre-wrap text-sm leading-6 text-slate-800">{question.text}</p></> : <div className="flex items-start justify-between gap-4"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{question.text}</p><div className="no-print flex shrink-0 gap-2"><button type="button" onClick={() => setEditingQuestion({ ...question })} className="text-sm font-semibold text-indigo-700">Edit</button><button type="button" onClick={() => deleteQuestion(question.id)} className="text-sm font-semibold text-rose-700">Remove</button></div></div>}</li>)}</ul></>}

      <div className="no-print mt-5 rounded-2xl border border-violet-100 bg-white p-4"><Field label="Add my own question"><textarea rows="3" maxLength="500" value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} placeholder="Type a question you want to remember" className="input resize-y" /></Field><button type="button" onClick={addQuestion} className="mt-3 min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">Add question</button></div>
    </ReportSection>

    <ReportSection number="5" title="Print Report" className="print-section">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm leading-6 text-slate-700">Use your browser’s print dialog to print this report or save it as a PDF. Editing controls and application navigation are excluded automatically.</p><p className="mt-2 text-xs leading-5 text-slate-500">Synthetic demonstration data. This limited record is not a diagnosis, prescription, complete medical history, or substitute for professional care.</p></div><button type="button" onClick={() => globalThis.print()} className="no-print min-h-12 shrink-0 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">Print / Save as PDF</button></div>
    </ReportSection>
  </article>
}

function ReportSection({ number, title, children, className = '' }) { return <section className={`print-card mt-6 rounded-3xl border border-indigo-100 bg-white p-5 shadow-[0_8px_30px_rgba(59,76,155,0.06)] sm:p-6 ${className}`}><div className="mb-5 flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{number}</span><h2 className="text-xl font-bold text-slate-900">{title}</h2></div>{children}</section> }
function Field({ label, children }) { return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label> }
function Metric({ label, value, detail: metricDetail }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{metricDetail}</p></div> }
function Subheading({ children }) { return <h3 className="mt-6 mb-3 font-bold text-slate-900">{children}</h3> }
function Empty({ children }) { return <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{children}</p> }
function PrintDetail({ label, value, wide = false }) { return <div className={wide ? 'col-span-2' : ''}><dt className="font-semibold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-slate-900">{value}</dd></div> }
function Table({ headers, rows }) { return <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{headers.map((header) => <th key={header} scope="col" className="border-b border-indigo-100 bg-indigo-50 px-3 py-2 font-semibold text-slate-700">{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${rowIndex}-${row[0]}`}>{row.map((cell, index) => <td key={`${index}-${cell}`} className="border-b border-slate-100 px-3 py-3 align-top text-slate-700">{cell}</td>)}</tr>)}</tbody></table></div> }
