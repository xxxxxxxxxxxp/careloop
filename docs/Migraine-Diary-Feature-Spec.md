# CareLoop — Migraine Diary Feature Specification

**Milestone:** Diary (log / view / edit / delete migraine episodes) · **Stack:** React + **JavaScript** (JSX) · **Persistence:** `localStorage`
**Demo clock:** all "now" logic uses the fixed historical date **`2025-03-20T18:00:00+08:00`** (`DEMO_NOW`). The real system clock (2026) must never be used for dates, durations or validation.
**Non-goals for this milestone:** no AI, no backend, no diagnosis, no medication advice, no predictions, no cycle-phase math, no forecast.

> Existing files to reuse, not recreate: `fixtures/ava.json`, `fixtures/mei.json`, `fixtures/sofia.json` (read-only), `schemas/careloop.types.ts` (documentation only — implement in JS).

---

## 1. Data & storage model

### 1.1 Episode shape (subset + extension of `MigraineEpisode`)
```js
/** @typedef {Object} DiaryEpisode
 * @property {string} id            'ep_usr_<uuid>' for user entries
 * @property {string} patientId     'usr_ava' | 'usr_mei' | 'usr_sofia'
 * @property {'user'|'fixture'} origin
 * @property {string} startAt       ISO-8601 with offset, e.g. '2025-03-19T14:00:00+08:00'
 * @property {?string} endAt        null + endUnknown=false === STILL ONGOING
 * @property {boolean} endUnknown   true === "it ended, I didn't record when" (endAt stays null)
 * @property {number} peakSeverity  0..10, REQUIRED, never defaulted
 * @property {string[]} associatedSymptoms  [] means "not logged", NOT "no symptoms"
 * @property {?('none'|'slowed_down'|'missed_some'|'missed_work_or_school'|'bedbound')} functionalImpact
 * @property {string} notes         <= 2000 chars, trimmed
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} [outsideDemoWindow] // Option B only, see 1.4
 */
```
**Derived, never stored:**
```js
isOngoing   = endAt == null && endUnknown !== true
durationMin = endAt == null ? null : (endAt - startAt)   // null for ongoing AND for "end unknown"
```
The tri-state matters: an unrecorded end time must never be displayed as "Ongoing" — that would be the app inventing a fact. Fixture entries are loaded with `endUnknown: false`.

### 1.2 Two layers — fixtures never touch storage
| Layer | Source | Writable | Where |
|---|---|---|---|
| Fixture | `import ava from './fixtures/ava.json'` | ❌ read-only | bundle. `Object.freeze` in dev; `origin: 'fixture'`, `patientId` injected at load |
| User | `localStorage['careloop.user.episodes.v1']` | ✅ | `byPatient: { usr_ava: [], usr_mei: [], usr_sofia: [] }` |

- **Merge at read time only:** `selectEpisodes(patientId) = [...fixturesForPatient, ...userForPatient].sort(byStartAtDesc)`. Never write merged data back, never mutate the imported arrays.
- **Fixture entries are read-only in the UI:** Edit/Delete controls are disabled with tooltip `Demo data — use "Reset demo data" to clear your own entries`. A small `Demo` chip marks them.
- **Quota:** cap 500 user entries per patient. On `QuotaExceededError`, keep the form data intact and show an error banner.
- **Corruption/migration:** if the key is missing JSON or `version !== 1`, ignore it, start empty, and log one console warning. Wrap every read in try/catch.
- **No localStorage (private mode):** fall back to in-memory + persistent banner "Entries won't be saved on this device."
- **Reset:** `Reset demo data` deletes only `byPatient[currentPatientId]` (and `Reset all patients` clears the whole key). Fixtures always survive.

### 1.3 Demo clock (critical)
```js
export const DEMO_NOW = '2025-03-20T18:00:00+08:00';   // src/lib/demoClock.js
export const nowIso = () => DEMO_NOW;                  // never Date.now() for diary logic
```
Use it for: default start time of a new entry, `max` on every date/time input, "Mark as ended now", ongoing duration ("4 h 20 m so far"), relative labels ("2 days ago").

### 1.4 Future dates — Option A (default) / Option B (fallback)
- **Option A (recommended):** every date/time input gets `max = DEMO_NOW`; picking a later date is prevented, so V2 and V4 only fire if data arrives from another source (import, devtools). Keeps the historical demo coherent.
- **Option B (only if the team wants real-clock logging):** allow later dates, set `outsideDemoWindow: true`, show an `Outside demo window` chip, and **exclude those entries from every dashboard counter** (they still appear in the diary). Pick one option before coding; tests T18 differ.

---

## 2. Logging form (low friction)

**Entry points:** dashboard `Log an attack` (primary, header) · diary `Log an attack` / `Log a past attack`.

| Field | Control | Required | Default |
|---|---|---|---|
| Start date + time | `datetime-local` (split into date + time for mobile) | ✅ | for "happening now": `DEMO_NOW`; for "past attack": empty → user must set |
| End | radio tri-state: `Still going` / `Ended at [datetime-local]` / `Ended, time not recorded` | ❌ | `Still going` for "happening now"; **nothing pre-selected** for "past attack" — the user must pick one |
| Peak severity | `input[type=range]` 0–10 + big number readout | ✅ | **unset** — "Tap to rate" state; Save disabled until touched |
| Associated symptoms | checkbox chip group (aura, photophobia, phonophobia, nausea, vomiting, osmophobia, dizziness, neck pain, brain fog, fatigue) | ❌ | none selected |
| Functional impact | radio group (None / Slowed down / Missed some / Missed work or school / Bedbound) | ❌ | none selected (`null`) |
| Notes | textarea + live counter | ❌ | `''` |

**Two quick actions on the diary header:** `Happening now` (start = `DEMO_NOW`, end = `null`, jumps straight to severity) and `Log a past attack` (full form).
**Save bar is sticky:** `Save` + `Cancel`. Autosave/drafts are out of scope.
**Copy guardrails:** helper text under severity — "Rate the worst point, we won't guess it for you"; under notes — "Avoid names, phone numbers or addresses."

Validation errors are shown **inline under the field plus in an error summary at the top**; they never auto-correct the user's input (see V9).

---

## 3. Ongoing episodes (no end time)

- Derived state `isOngoing = endAt == null && endUnknown !== true`. "Happening now" entries start ongoing; in edit mode switching the radio to `Still going` clears `endAt` and sets `endUnknown = false`.
- **`endUnknown: true` is a different state and must look different:** grey (not amber) chip, `End time not logged`, no duration, **not** counted in `In progress now`, excluded from duration averages.
- **Card treatment:** amber left border + `● Ongoing` chip, live duration `Started 3 h 20 m ago` (recomputed against `DEMO_NOW`), severity shown as `7/10 worst so far`, and a "still going" note instead of a duration.
- **Actions on an ongoing card:** `Mark as ended` (writes `endAt = DEMO_NOW`, 1 tap) · `Add end time` (opens editor focused on the end field) · `Edit` · `Delete`.
- **At most one *user-logged* ongoing episode per patient.** Starting a second one shows a blocking confirm: `An attack is already in progress. End it now and start a new one?` → [End and start new] [Cancel]. (Test T9b.)
- **Fixture ongoing episodes are excluded from this rule.** Sofia's fixture contains `ep_sof_8` with `endAt = null`, so her diary legitimately shows a `Demo` ongoing card on first load. Because fixture entries are read-only, `End and start new` **must never write to it** — when the open episode is `origin: 'fixture'`, the confirm dialog is replaced by the non-blocking notice `A demo attack is already in progress. You can log yours alongside it.` → [Log mine anyway] [Cancel]. Two ongoing rows may then coexist; `In progress now` counts both and labels them `1 ongoing (demo)` / `1 ongoing (you)`.
- **No auto-closing, ever:** on reload, an open episode stays open; duration is never inferred from a "typical" length.
- **Statistics:** ongoing episodes **count** in attack counts but are **excluded** from any duration average (their duration is unknown).

---

## 4. Validation rules

| ID | Rule | Behaviour on violation |
|---|---|---|
| V1 | `startAt` required and parseable | Error `When did it start?`; block save; focus start field |
| V2 | `startAt <= DEMO_NOW` | Error `Start time can't be later than 20 Mar 2025 18:00`; block save |
| V3 | `endAt > startAt` when provided | Error `End time is before the start time. Fix it or clear it — CareLoop won't guess.`; **block save**; focus end field |
| V4 | `endAt <= DEMO_NOW` when provided | Error `End time can't be in the future`; block save |
| V5 | `peakSeverity` integer 0–10 and **explicitly set** | Save disabled with `Rate the worst point (0–10)`; **no default value is ever written** |
| V6 | Duration sanity: `0 < duration <= 14 days` | Soft confirm `That's longer than 14 days — save anyway?` [Save anyway] [Cancel]. Cancel returns to the form untouched |
| V7 | Notes ≤ 2000 chars | Trim on save; block with counter in red if longer |
| V8 | `id` unique; patientId matches the active patient | Programmatic guard, no UI |
| V9 | **Never invent data** | No default severity, no `startAt + 2 h` end time, no inferred symptoms or impact, no "unknown → 0". Empty stays `null` / `[]` |
| V10 | Overlap warning | If a new entry overlaps >50% of an existing entry: soft confirm `This overlaps an entry you already logged. Save both?` — allowed, never auto-merged |
| V11 | Symptom vocabulary | Only values from the closed list in §2 are accepted (checkbox chips guarantee this) |
| V12 | Storage write succeeds | On failure keep the form filled and show `Couldn't save on this device. Your entries are still shown but not stored.` |
| V13 | Exactly one end state must be chosen for a past attack | If no end radio is picked: error `Tell me whether it's still going, ended at a time, or ended at an unknown time.`; block save. Choosing `Still going` for an entry that started more than 7 days before `DEMO_NOW` triggers the soft confirm `This started N days ago and is still marked in progress — is that right?` |

Timezone: store the same offset style as the fixtures (`+08:00`). Use one helper `toIsoWithOffset(localDate, localTime, '+08:00')` for all writes so diary, dashboard and fixtures stay comparable.

---

## 5. View / edit / delete

**Diary view** (`/diary`, also reachable from the dashboard): reverse-chronological list grouped by calendar month (newest first), each row:
`Fri 14 Mar · 16:20 → 22:00 (5 h 40 m)` · severity chip `7/10 Moderate` · symptom chips · impact line · notes (2-line clamp, expandable) · origin chip (`Demo` / `You`) · `Edit` `Delete`.
Ongoing rows sort to the top of their month with the ongoing treatment from §3.
Simple filter chips: `All` / `Ongoing` / `Last 30 days` / `Logged by me`.

**Edit:** same form component in `mode="edit"`, prefilled with the stored values, all V1–V12 still applied. `updatedAt` set on save; `id`, `origin`, `createdAt` unchanged. Fixture entries open read-only (inputs disabled) with a `Demo data` banner.

**Delete (user entries only):** confirm dialog `Delete this entry? This can't be undone after 30 seconds.` → row removed, dashboard recomputes, snackbar `Entry deleted · Undo` for 30 s (undo buffer in memory, no tombstone). After 30 s the deletion is final.

---

## 6. Diary → dashboard updates

Merge → memoized selectors → render. No caching, no invalidation logic: everything is recomputed from the merged array, so edits/deletes/patient switches are automatically consistent.

```js
// src/features/diary/selectors.js  (pure, no I/O)
selectEpisodes(patientId)                 // fixtures + user, desc by startAt
selectOngoing(episodes)                   // endAt == null && !endUnknown  (expect 0 or 1)
selectAttacksLast30(episodes)             // startAt within 30 d before DEMO_NOW, incl. ongoing
selectDaysSinceLastAttack(episodes)       // null when none
selectMeanPeakSeverity30(episodes)        // mean of non-null severities, 1 dp; null when none
selectImpactDays30(episodes)              // days with missed_work_or_school / bedbound
selectEntriesLoggedByYou(episodes)        // origin === 'user'
```
Dashboard widgets to wire (labels are literal):
- **Attacks in the last 30 days** — `n` (tooltip: counts entries still in progress)
- **Days since your last attack** — `n days` or `—` when none
- **Average peak severity (30 d)** — `7.6 / 10` or `Not enough data`
- **In progress now** — `1 attack in progress · started 3 h ago`, or the widget is hidden when zero
- **Entries you logged** — `n` (proves the user layer works)

**Hard rules:** every widget shows `—` / `Not enough data` rather than `0` when there is no data; missing severity never counts as 0; no cycle-phase labels, no predictions, no medication or diagnosis copy anywhere in this feature.

---

## 7. Accessibility & empty states

- Every input has a visible `<label>` (or `aria-label` for icon buttons: `Edit entry`, `Delete entry`).
- Severity: `input[type=range]` with `aria-valuetext="7 out of 10"`; severity is **never conveyed by colour alone** — the number and a word (`Mild/Moderate/Severe`) are always rendered.
- Symptoms = `checkbox` group inside `<fieldset><legend>`; impact = `radio` group inside `<fieldset><legend>`.
- Errors: `aria-invalid="true"` + `aria-describedby` on the field; error summary at the top in `role="alert"` with anchor links to each field; on failed submit move focus to the summary, then to the first invalid field.
- `aria-live="polite"` status region for `Entry saved`, `Entry deleted`, `Undo available for 30 seconds`; `role="status"` for the ongoing duration.
- Modal dialogs: focus trap, `Esc` closes (discarding unsaved changes only after a confirm if the form is dirty), focus returns to the trigger button.
- New entry → focus moves to the new diary row and announces `Entry added`; deleted row → focus moves to the next row.
- Touch targets ≥ 44 px, layout usable at 320 px, text contrast ≥ 4.5:1, `prefers-reduced-motion` disables the pulsing ongoing dot.
- Keyboard-only path: log → rate → save → edit → delete must be completable without a mouse (test T19).

**Empty states**
| Situation | Copy + action |
|---|---|
| No episodes at all | `No attacks logged yet.` + primary `Log an attack` + secondary `Log a past attack` |
| Only fixture entries | Banner: `N entries are demo data (Ava 9 / Mei 5 / Sofia 8). Anything you add is stored on this device only.` |
| Filter matches nothing | `No entries match this filter.` + `Clear filter` |
| No ongoing episode | Ongoing widget hidden (no placeholder text) |
| Storage unavailable | Persistent banner `Entries won't be saved on this device.` |

---

## 8. Acceptance tests

Run against `DEMO_NOW = 2025-03-20T18:00:00+08:00`. 23 tests. Automate T1–T17 (incl. T2b, T9b, T9c) with Vitest + React Testing Library; T18–T20 manual.

| ID | Given / When / Then |
|---|---|
| **T1** Ordinary use — open Diary → `Log a past attack` → start `2025-03-19 14:00`, end `2025-03-19 22:00`, severity 7, symptoms [photophobia, nausea], impact `missed_some`, notes `after workshop` → Save. **Then:** entry is first in the list; shows `8 h`; dashboard `Attacks (30 d)` incremented by 1; `Entries you logged` = 1; reload → still present. |
| **T2** Missing data (past attack) — start `2025-03-18 09:00`, severity 5, end radio = `Ended, time not recorded`, symptoms/impact/notes untouched → Save. **Then:** entry saves; row shows `End time not logged` (**not** `Ongoing`); `In progress now` stays hidden; duration average ignores it; `Attacks (30 d)` +1; no field contains a fabricated value. |
| **T2b** Missing data (no end state chosen) — past attack with no end radio selected → **Then:** V13 error; blocked; nothing persisted. |
| **T3** Invalid input — end `2025-03-19 10:00` earlier than start `14:00` → Save. **Then:** inline error + error summary `End time is before the start time…`; **nothing persisted**; focus on the end field; `Entries you logged` unchanged. |
| **T4** Invalid input — end later than `DEMO_NOW` (`2025-03-21 09:00`). **Then:** blocked with `End time can't be in the future`; nothing persisted. |
| **T5** Invalid input — start later than `DEMO_NOW`. **Then:** blocked (and unreachable via the picker, whose `max` is `DEMO_NOW`); nothing persisted. |
| **T6** Missing severity — fill start only, don't touch the slider → **Then:** Save is disabled with `Rate the worst point (0–10)`; after forcing a save attempt, no entry exists and no severity value was written. |
| **T7** Out-of-range severity — set slider to 11 programmatically → **Then:** rejected/clamped to 10; no value > 10 ever stored. |
| **T8** Missing start — clear start, set severity → **Then:** `When did it start?`; blocked; nothing persisted. |
| **T9** Ongoing — `Happening now` → severity 6 → Save. **Then:** row shows `● Ongoing`, `Started 0 m ago` (against `DEMO_NOW`), `6/10 worst so far`, no duration; `In progress now` widget shows 1; entry excluded from any duration average. |
| **T9b** Second ongoing while a **user** episode is open → **Then:** confirm dialog appears; `Cancel` leaves a single ongoing entry; `End and start new` closes the old one at `DEMO_NOW` and opens a new one. |
| **T9c** Ongoing alongside Sofia's fixture → switch to Sofia (who has fixture episode `ep_sof_8` open) → `Happening now` → severity 7 → Save. **Then:** the non-blocking notice appears; `Log mine anyway` produces a second ongoing row; `ep_sof_8` is **unchanged** (`endAt` still `null`, no `updatedAt` written); `In progress now` shows 2 and distinguishes demo vs. yours. |
| **T10** **Editing an ongoing episode** — open it → `Mark as ended` → **Then:** `endAt = 2025-03-20T18:00:00+08:00`, duration computed, chip becomes a normal duration, `In progress now` widget disappears, dashboard attack count unchanged (still 1 attack), duration average now includes it. |
| **T11** Editing an ongoing episode manually with end `2025-03-19 08:00` (before start `2025-03-20 06:00`) → **Then:** same V3 error in edit mode; `endAt` stays `null`; nothing persisted. |
| **T12** Editing a closed episode — severity 7 → 9, add a symptom → **Then:** same `id`, `origin`, `createdAt`; `updatedAt` changes; diary and `Average peak severity (30 d)` reflect 9; reload persists the change. |
| **T13** Delete + undo — delete a user entry → **Then:** row gone, dashboard decremented, snackbar `Entry deleted · Undo`; click Undo within 30 s → entry restored with identical values and dashboard restored; after 30 s the snackbar disappears and the deletion is final. |
| **T14** Persistence — add 2 entries, reload the page → **Then:** both present in the right order; all 9 of Ava's fixture episodes present with unchanged values; `Entries you logged` = 2. |
| **T15** **Patient switching** — add an entry to Ava → switch to Mei → **Then:** Mei's diary shows only her fixtures (no Ava entry), `Entries you logged` = 0; add one to Mei → switch back to Ava → Ava shows her own entry only; both stored under their own `patientId` keys. |
| **T16** Fixture integrity — try to delete/edit a `Demo` entry → **Then:** controls disabled with `Demo data` tooltip; after `Reset demo data` the fixture entries are still there with their original values (baseline dashboard numbers restored). |
| **T17** Reset — add 3 entries → `Reset demo data` → **Then:** user entries for the current patient cleared, other patients untouched, fixtures intact, empty state or fixture-only banner shown. |
| **T18** Out-of-window handling — **Option A:** every date input has `max=DEMO_NOW`, a later date cannot be selected; **Option B:** a 2026 entry saves with an `Outside demo window` chip and is **excluded** from all dashboard counters. |
| **T19** Accessibility — complete log→edit→delete with keyboard only; run axe on Diary + form (0 violations); on failed submit focus lands on the error summary and the first invalid field; screen reader announces `Entry saved` / `Entry deleted`. |
| **T20** Limits — 2500-char note blocked at 2000 with a red counter; overlapping entry shows the V10 soft confirm and `Save anyway` keeps **both** entries; a 15-day duration shows the V6 confirm and `Cancel` returns to an untouched form. |

---

## 9. Files & milestone plan

```
src/lib/demoClock.js                  DEMO_NOW, nowIso(), toIsoWithOffset()
src/lib/localStore.js                 read/write/migrate/reset of careloop.user.episodes.v1
src/data/fixtures.js                  frozen imports, patientId + origin:'fixture' injected
src/features/diary/episodeSchema.js   validateEpisode() -> { errors, values }   (V1–V13)
src/features/diary/selectors.js       pure selectors from §6
src/features/diary/EpisodeForm.jsx    create + edit, error summary, a11y
src/features/diary/DiaryList.jsx      list, ongoing card, empty states, filters
src/features/diary/DiaryPage.jsx      wiring + reset controls
src/features/dashboard/*              read the selectors (no new state)
```

**Suggested order (2–3 days, well inside the 16 Oct 2026 deadline):** storage + fixtures layer → `validateEpisode` + unit tests → form (create) → list + ongoing card → edit/delete/undo → selectors + dashboard wiring → a11y/empty-state pass → run T1–T20.

**Definition of done:** T1–T20 pass; no fixture file is modified by the app; `Reset demo data` always restores the exact baseline numbers from `fixtures/README.md`; no diagnostic, predictive or medication language appears anywhere in the feature.
