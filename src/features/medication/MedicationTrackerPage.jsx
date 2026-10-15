import { useMemo, useState } from 'react'
import { systemDateTimeParts } from '../../lib/demoClock'
import {
  PURPOSES,
  blankIntakeForm,
  blankRegimenForm,
  intakeFormFrom,
  makeIntake,
  makeRegimen,
  regimenFormFrom,
  selectMedicationRecords,
  validateIntakeForm,
  validateRegimenForm,
} from './medicationModel'
import {
  hideFixtureIntake,
  hideFixtureRegimen,
  removeUserIntake,
  removeUserRegimen,
  resetPatientMedications,
  saveFixtureIntakeOverride,
  saveFixtureRegimenOverride,
  saveUserIntake,
  saveUserRegimen,
} from './medicationStore'

const purposeLabel = (purpose) => PURPOSES.find(([id]) => id === purpose)?.[1] ?? 'Not recorded'
const humanise = (value) => value ? value.replaceAll('_', ' ') : 'Not recorded'
const formatTakenAt = (value, timeZone) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Time not recorded'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || 'Asia/Shanghai' }).format(new Date(value))
}
const episodeLabel = (episode) => {
  const date = episode.startAt?.slice(0, 10) ?? 'date not recorded'
  const severity = episode.peakSeverity === null ? 'severity not recorded' : 'severity ' + episode.peakSeverity + '/10'
  return date + ' · ' + severity
}

export default function MedicationTrackerPage({ patient, episodes }) {
  const [revision, setRevision] = useState(0)
  const [regimenEditor, setRegimenEditor] = useState(null)
  const [intakeEditor, setIntakeEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notice, setNotice] = useState('')
  const records = useMemo(() => selectMedicationRecords(patient.id), [patient.id, revision])

  const refresh = (message, result) => {
    setRevision((value) => value + 1)
    setNotice(result?.persistent === false ? message + ' This change is available for this session but could not be saved on this device.' : message)
  }

  const saveRegimen = (record) => {
    const result = record.origin === 'fixture' ? saveFixtureRegimenOverride(record) : saveUserRegimen(record)
    if (result?.ok === false) return setNotice(result.error || 'This medication could not be saved.')
    setRegimenEditor(null)
    refresh('Medication record saved.', result)
  }

  const saveIntake = (record) => {
    const result = record.origin === 'fixture' ? saveFixtureIntakeOverride(record) : saveUserIntake(record)
    if (result?.ok === false) return setNotice(result.error || 'This intake could not be saved.')
    setIntakeEditor(null)
    refresh('Intake record saved.', result)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const { kind, record } = pendingDelete
    let result
    if (kind === 'regimen') {
      result = record.origin === 'fixture' ? hideFixtureRegimen(patient.id, record.id) : removeUserRegimen(patient.id, record.id)
    } else {
      result = record.origin === 'fixture' ? hideFixtureIntake(patient.id, record.id) : removeUserIntake(patient.id, record.id)
    }
    setPendingDelete(null)
    refresh(kind === 'regimen' ? 'Medication record deleted. Existing intake history was kept.' : 'Intake record deleted.', result)
  }

  const resetDemoData = () => {
    const result = resetPatientMedications(patient.id)
    setRegimenEditor(null)
    setIntakeEditor(null)
    setPendingDelete(null)
    refresh(`Medication demo data restored for ${patient.name}.`, result)
  }

  return <section>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-indigo-600">Synthetic historical reference: 20 Mar 2025</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Medication Tracker</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Keep prescribed regimen information separate from records of what was actually taken. CareLoop stores what you enter and does not assess whether a medication or instruction is appropriate.</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">Synthetic demonstration data</span>
        <button type="button" onClick={resetDemoData} className="min-h-10 rounded-xl bg-white px-3 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100 hover:bg-indigo-50">Reset demo data</button>
      </div>
    </header>

    {!records.persistent && <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Medication changes cannot be saved on this device. They remain available for this browser session.</p>}
    <p aria-live="polite" className="mt-3 min-h-5 text-sm font-medium text-indigo-700">{notice}</p>

    <section className="mt-5 rounded-3xl border border-violet-100 bg-white p-5 shadow-[0_8px_30px_rgba(59,76,155,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Medication regimens</h2>
          <p className="mt-1 text-sm text-slate-500">Prescribed or intended information recorded for {patient.name}. These are not intake events.</p>
        </div>
        <button type="button" onClick={() => { setRegimenEditor({ record: null }); setIntakeEditor(null); setNotice('') }} className="min-h-11 w-fit rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">Add medication</button>
      </div>

      {regimenEditor && <div className="mt-5"><RegimenForm key={regimenEditor.record?.id ?? 'new-regimen'} patientId={patient.id} record={regimenEditor.record} onSave={saveRegimen} onCancel={() => setRegimenEditor(null)} /></div>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {records.regimens.length ? records.regimens.map((record) => <RegimenCard key={record.id} record={record} onEdit={() => { setRegimenEditor({ record }); setIntakeEditor(null) }} onDelete={() => setPendingDelete({ kind: 'regimen', record })} />) : <EmptyState title="No medication regimens recorded" body={'CareLoop has no medication record for ' + patient.name + '. Add one only from information you already have.'} />}
      </div>
    </section>

    <section className="mt-6 rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_8px_30px_rgba(59,76,155,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Intake history</h2>
          <p className="mt-1 text-sm text-slate-500">Timestamped records are separate from prescribed instructions. Synthetic fixture history may also contain clearly marked skipped-dose records.</p>
        </div>
        <button type="button" disabled={!records.regimens.length} onClick={() => { setIntakeEditor({ record: null }); setRegimenEditor(null); setNotice('') }} className="min-h-11 w-fit rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Log intake</button>
      </div>
      {!records.regimens.length && <p className="mt-3 text-sm text-amber-700">Add a medication regimen before logging an intake.</p>}

      {intakeEditor && <div className="mt-5"><IntakeForm key={intakeEditor.record?.id ?? 'new-intake'} patientId={patient.id} record={intakeEditor.record} regimens={records.regimens} episodes={episodes} onSave={saveIntake} onCancel={() => setIntakeEditor(null)} /></div>}

      <div className="mt-5 space-y-3">
        {records.intakes.length ? records.intakes.map((record) => <IntakeRow key={record.id} record={record} episodes={episodes} timeZone={patient.profile.timezone} onEdit={() => { setIntakeEditor({ record }); setRegimenEditor(null) }} onDelete={() => setPendingDelete({ kind: 'intake', record })} />) : <EmptyState title="No intake history recorded" body="Logging an intake records only the information you select; it does not confirm adherence or provide dosing guidance." />}
      </div>
    </section>

    {pendingDelete && <DeleteDialog kind={pendingDelete.kind} record={pendingDelete.record} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />}
  </section>
}

function RegimenCard({ record, onEdit, onDelete }) {
  return <article className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-lg font-bold text-slate-900">{record.name}</p>
        {record.genericName && record.genericName !== record.name && <p className="mt-0.5 text-xs text-slate-500">Generic name recorded: {record.genericName}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">{purposeLabel(record.purpose)}</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{record.origin === 'fixture' ? 'Synthetic demo' : 'Recorded by you'}</span>
      </div>
    </div>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <Detail label="Prescribed dose / amount" value={record.doseText} />
      <Detail label="Prescribed instructions" value={record.frequencyText} />
      <Detail label="Schedule information" value={record.scheduleText} />
      <Detail label="Reminder recorded" value={record.reminderTimes?.length ? record.reminderTimes.join(', ') : null} />
      {record.prescriberText && <Detail label="Prescriber on record" value={record.prescriberText} />}
    </dl>
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={onEdit} className="min-h-11 rounded-xl bg-indigo-50 px-3 text-sm font-semibold text-indigo-700">Edit</button>
      <button type="button" onClick={onDelete} className="min-h-11 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700">Delete</button>
    </div>
  </article>
}

function IntakeRow({ record, episodes, timeZone, onEdit, onDelete }) {
  const episode = episodes.find((item) => item.id === record.linkedEpisodeId)
  return <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-900">{record.name || 'Medication name not recorded'}</p>
          {record.isSkipped && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Skipped-dose record</span>}
          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{record.origin === 'fixture' ? 'Synthetic demo' : 'Recorded by you'}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">{formatTakenAt(record.takenAt, timeZone)}</p>
        <p className="mt-1 text-sm text-slate-500">Amount: {record.doseText || 'not recorded for this event'}</p>
        <p className="mt-1 text-sm text-slate-500">{record.linkedEpisodeId ? episode ? 'Linked migraine: ' + episodeLabel(episode) : 'Linked migraine record is not currently available' : 'No migraine episode linked'}</p>
        {record.isSkipped && <p className="mt-1 text-sm text-amber-700">Recorded reason: {humanise(record.skipReason)}</p>}
        {record.sideEffects?.length > 0 && <p className="mt-1 text-sm text-slate-500">Recorded side effects: {record.sideEffects.join(', ')}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="min-h-11 rounded-xl bg-indigo-50 px-3 text-sm font-semibold text-indigo-700">Edit</button>
        <button type="button" onClick={onDelete} className="min-h-11 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700">Delete</button>
      </div>
    </div>
  </article>
}

function RegimenForm({ patientId, record, onSave, onCancel }) {
  const [form, setForm] = useState(() => record ? regimenFormFrom(record) : blankRegimenForm())
  const [errors, setErrors] = useState({})
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = (event) => {
    event.preventDefault()
    const result = validateRegimenForm(form)
    setErrors(result.errors)
    if (Object.keys(result.errors).length) return
    onSave(makeRegimen(form, patientId, record))
  }
  return <form onSubmit={submit} noValidate className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
    <h3 className="font-bold text-slate-900">{record ? 'Edit medication record' : 'Add medication record'}</h3>
    <p className="mt-1 text-sm text-slate-600">Copy information from your existing prescription or care instructions. CareLoop does not verify or complete it.</p>
    {Object.keys(errors).length > 0 && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">Please check the highlighted medication fields.</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="Medication name" required error={errors.name}><input value={form.name} onChange={(event) => update('name', event.target.value)} maxLength="101" /></Field>
      <Field label="Purpose" required error={errors.purpose}><select value={form.purpose} onChange={(event) => update('purpose', event.target.value)}>{PURPOSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
      <Field label="Prescribed dose or amount (optional)" error={errors.doseText}><input value={form.doseText} onChange={(event) => update('doseText', event.target.value)} maxLength="101" /></Field>
      <Field label="Reminder time (optional)" error={errors.reminderTime}><input type="time" value={form.reminderTime} onChange={(event) => update('reminderTime', event.target.value)} /></Field>
      <div className="md:col-span-2"><Field label="Prescribed instructions" required error={errors.frequencyText}><textarea value={form.frequencyText} onChange={(event) => update('frequencyText', event.target.value)} maxLength="501" /></Field></div>
      <div className="md:col-span-2"><Field label="Additional schedule information (optional)" error={errors.scheduleText}><textarea value={form.scheduleText} onChange={(event) => update('scheduleText', event.target.value)} maxLength="501" /></Field></div>
    </div>
    <p className="mt-3 text-xs text-slate-500">A recorded reminder time is informational only; this prototype does not schedule device notifications.</p>
    <div className="mt-5 flex gap-3">
      <button type="submit" className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">Save medication</button>
      <button type="button" onClick={onCancel} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
    </div>
  </form>
}

function IntakeForm({ patientId, record, regimens, episodes, onSave, onCancel }) {
  const [form, setForm] = useState(() => record ? intakeFormFrom(record) : blankIntakeForm(systemDateTimeParts()))
  const [errors, setErrors] = useState({})
  const today = systemDateTimeParts()
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const currentRegimenMissing = record?.regimenId && !regimens.some((item) => item.id === record.regimenId)
  const submit = (event) => {
    event.preventDefault()
    const result = validateIntakeForm(form, { regimens, episodes, existing: record })
    setErrors(result.errors)
    if (Object.keys(result.errors).length) return
    onSave(makeIntake(form, patientId, { regimens, episodes, existing: record }))
  }
  return <form onSubmit={submit} noValidate className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
    <h3 className="font-bold text-slate-900">{record ? 'Edit intake record' : 'Log medication intake'}</h3>
    <p className="mt-1 text-sm text-slate-600">This records an event. It does not copy a prescribed dose into the event or confirm that the regimen was followed.</p>
    {Object.keys(errors).length > 0 && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">Please check the highlighted intake fields.</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="Medication" required error={errors.regimenId}>
        <select value={form.regimenId} onChange={(event) => update('regimenId', event.target.value)}>
          <option value="">Choose a recorded medication</option>
          {currentRegimenMissing && <option value={record.regimenId}>{record.name} (medication record deleted)</option>}
          {regimens.map((regimen) => <option key={regimen.id} value={regimen.id}>{regimen.name}</option>)}
        </select>
      </Field>
      <Field label="Related migraine episode (optional)" error={errors.linkedEpisodeId}>
        <select value={form.linkedEpisodeId} onChange={(event) => update('linkedEpisodeId', event.target.value)}>
          <option value="">No linked migraine episode</option>
          {episodes.map((episode) => <option key={episode.id} value={episode.id}>{episodeLabel(episode)}</option>)}
        </select>
      </Field>
      <Field label="Date" required error={errors.takenAt}><input type="date" max={today.date} value={form.date} onChange={(event) => update('date', event.target.value)} /></Field>
      <Field label="Time" required error={errors.takenAt}><input type="time" max={form.date === today.date ? today.time : undefined} value={form.time} onChange={(event) => update('time', event.target.value)} /></Field>
    </div>
    <div className="mt-5 flex gap-3">
      <button type="submit" className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">Save intake</button>
      <button type="button" onClick={onCancel} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
    </div>
  </form>
}

function Field({ label, required = false, error, children }) {
  return <label className="block text-sm font-semibold text-slate-800">{label}{required && <span className="ml-1 text-rose-600">(required)</span>}<span className="mt-2 block [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:p-3 [&_input]:font-normal [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:p-3 [&_select]:font-normal [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-white [&_textarea]:p-3 [&_textarea]:font-normal">{children}</span>{error && <span className="mt-1 block text-sm font-normal text-rose-600">{error}</span>}</label>
}

function Detail({ label, value }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{value || 'Not recorded'}</dd></div>
}

function EmptyState({ title, body }) {
  return <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 lg:col-span-2"><p className="font-bold text-slate-800">{title}</p><p className="mt-2 max-w-2xl text-sm text-slate-600">{body}</p></div>
}

function DeleteDialog({ kind, record, onConfirm, onCancel }) {
  const title = kind === 'regimen' ? 'Delete this medication record?' : 'Delete this intake record?'
  const body = kind === 'regimen'
    ? 'The regimen will be removed for this demo patient. Existing intake history remains as a separate record.'
    : 'This intake entry will be removed for this demo patient.'
  return <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/30 p-5" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{record.name || 'Medication name not recorded'}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold">Cancel</button>
        <button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white">Delete</button>
      </div>
    </div>
  </div>
}
