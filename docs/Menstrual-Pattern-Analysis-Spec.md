# CareLoop — Menstrual Migraine Pattern Analysis (Revised)

**Milestone:** deterministic perimenstrual-window analysis · **Stack:** React + JavaScript · **No LLM, no backend, no diagnosis**
**Demo clock:** `DEMO_NOW = 2025-03-20T18:00:00+08:00`; `asOfDate = '2025-03-20'`. Never `Date.now()`.

> **This revision corrects a factual error in the original agent spec.**
> The ICHD-3 perimenstrual window is **days −2, −1, 1, 2, 3 = five calendar days** (P−2 … P+2), because **there is no day 0**. The original `expectedRatioByChance = 6/28 = 0.214` is **wrong on two counts**: the numerator must be 5, and the denominator must be the patient's own cycle length, never a fixed 28.
> `6/28` is retired. Do not port it. `grep -rn "0.214\|6/28\|6 / 28" src/` must return nothing.

---

## 0. Terminology and sources (medical criteria vs. our algorithm)

| Term | Source | Meaning |
|---|---|---|
| Day 1 of menstruation | ICHD-3 A1.1.1 note | First day of menstrual bleeding |
| Day −1 | ICHD-3 A1.1.1 note | "The first day of menstruation is day 1 and the preceding day is day −1; **there is no day 0**" |
| Perimenstrual window | ICHD-3 appendix A1.1.1 / A1.1.2 | Attacks starting on **days −2, −1, 1, 2, 3** |
| "Two out of three cycles" | ICHD-3 appendix A1.1.1 / A1.1.2 | Attacks in the window in **at least two out of three menstrual cycles** (diagnostic criterion) |
| Menstruation | ICHD-3 | Endometrial bleeding from the normal cycle **or** withdrawal bleeding from combined hormonal contraception / cyclic HRT. **Breakthrough bleeding is not menstruation.** |

**Citations**
1. Headache Classification Committee of the International Headache Society. *ICHD-3*, appendix **A1.1.1 Pure menstrual migraine without aura** and **A1.1.2 Menstrually-related migraine without aura**. https://ichd-3.org/appendix/a1-migraine/a1-1-migraine-without-aura/a1-1-1-pure-menstrual-migraine-without-aura/
2. Verhagen IE, Spaink HAJ, van der Arend BWH, van Casteren DS, MaassenVanDenBrink A, Terwindt GM. *Validation of diagnostic ICHD-3 criteria for menstrual migraine.* Cephalalgia. 2022;42(11). doi:10.1177/03331024221099031. PMID 35514214. Quotes used below:
   - "A perimenstrual migraine attack was defined as an attack starting on day 1 ± 2 of the menstrual cycle (**day −2 till +3, there is no day 0**)."
   - "**Attacks that were already ongoing before day −2 were considered non-perimenstrual.**"
   - ICHD-3 MM "is defined as the occurrence of migraine attacks during the menstrual window in **at least two out of three menstrual cycles**."
   - "**Criteria for MM have not been sufficiently validated** and are, therefore, part of the ICHD-3 appendix."
   - "It is still disputed whether the 'two out of three menstrual cycles' criterion has **sufficient sensitivity and specificity**."

**Hard boundary — read this before writing any UI copy.**
CareLoop computes a **descriptive tally of onset dates against a fixed calendar window**. It does **not** apply ICHD-3 diagnostic criteria, does **not** diagnose pure menstrual migraine or menstrually-related migraine, and does **not** estimate risk. The words "diagnosis", "you have menstrual migraine", "criteria met", "risk", "probability", "caused by" are banned in this feature. Always render the footer: *"This is a description of your own log. It is not a diagnosis."*

---

## 1. Date-based window algorithm

### 1.1 Onset date (timezone-safe)
```js
// src/lib/cycleDates.js
export const MS_DAY = 86400000;

/** Calendar date the user experienced — the date as WRITTEN in the ISO string. Never UTC-converted. */
export const localDateOf = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : null);

const utcMs = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
export const diffDays = (a, b) => Math.round((utcMs(a) - utcMs(b)) / MS_DAY);   // a - b, in whole days
export const addDays  = (d, n) => new Date(utcMs(d) + n * MS_DAY).toISOString().slice(0, 10);
```
`Date.UTC` is used deliberately: date-only arithmetic must not be affected by DST or by the host timezone.

### 1.2 Menstrual day number (the corrected core)
```js
/**
 * ICHD-3 menstrual day number of onsetDate relative to periodStart (day 1 = first day of bleeding).
 * k = calendar offset in days from periodStart.
 *   k >= 0 -> day k + 1     (P -> 1, P+1 -> 2, P+2 -> 3)
 *   k <  0 -> day k         (P-1 -> -1, P-2 -> -2)   *** no day 0 ***
 */
export function menstrualDayNumber(onsetDate, periodStart) {
  const k = diffDays(onsetDate, periodStart);
  return k >= 0 ? k + 1 : k;
}

export const WINDOW_DAYS = Object.freeze([-2, -1, 1, 2, 3]);         // 5 day-numbers
export const isInWindow = (onsetDate, periodStart) =>
  WINDOW_DAYS.includes(menstrualDayNumber(onsetDate, periodStart));

/** The 5 calendar dates of the window, oldest first. */
export const windowDates = (periodStart) => [-2, -1, 0, 1, 2].map((k) => addDays(periodStart, k));
```
**Sanity table (P = 2025-03-15)** — assert this verbatim in tests:

| Date | k | Day number | In window |
|---|---|---|---|
| 2025-03-13 | −2 | **−2** | ✅ |
| 2025-03-14 | −1 | **−1** | ✅ |
| 2025-03-15 | 0 | **+1** | ✅ |
| 2025-03-16 | +1 | **+2** | ✅ |
| 2025-03-17 | +2 | **+3** | ✅ |
| 2025-03-18 | +3 | +4 | ❌ |
| 2025-03-12 | −3 | −3 | ❌ |

> **Known trap:** the naive `dayNumber = k + 1` puts day `0` at P−1 (a false negative) and day `−2` at P−3 (a false positive). Both are wrong. Use the branch above.

### 1.3 Onset-only rule
Classification uses **onset date only**. An attack that started before day −2 and was still running on day +1 is **outside** the window — per Verhagen et al., "attacks that were already ongoing before day −2 were considered non-perimenstrual". `endAt` is never read by this module.

### 1.4 Attribution (exactly one window per episode)
```js
// for each episode: collect every period start whose window contains the onset date
const matches = starts.map((p, j) => ({ j, dn: menstrualDayNumber(onset, p.date) }))
                      .filter(({ dn }) => WINDOW_DAYS.includes(dn))
                      .sort((a, b) => Math.abs(a.dn) - Math.abs(b.dn) || a.j - b.j);
// matches[0] wins: nearest day number, tie broken by earlier cycle. 0 matches => outside window.
```
An episode is therefore counted **at most once**. Two windows can only both match if two period starts are ≤ 4 days apart — prevented by guard **G1** (§4.1).

---

## 2. Deterministic analysis specification

### 2.1 Inputs
```js
analysePattern({
  cycles,      // [{ id, startDate: 'YYYY-MM-DD' | null, isComplete, lengthDays? }]
  episodes,    // [{ id, startAt: ISO-8601 with offset | null, peakSeverity|null, endAt }]
  asOfDate,    // 'YYYY-MM-DD'  (demo: '2025-03-20')
})
```
- `cycles` and `episodes` come from the **merged read** in the diary spec (fixtures + user layer), already deduped by `id`. This function is **pure**: no I/O, no `Date.now()`, no memoisation across calls.

### 2.2 Output
```js
{
  schemaVersion: 1,
  asOfDate: '2025-03-20',
  window: { dayNumbers: [-2,-1,1,2,3], calendarDays: 5, calendarSpan: 'P-2..P+2',
            dayOneDefinition: 'first day of menstrual bleeding', noDayZero: true },

  cycles: [{ id, startDate, lengthDays, lengthSource: 'derived'|null,
             state: 'complete'|'open'|'no_anchor' }],

  episodes: [{ id, onsetDate, anchorCycleId, dayNumber, inWindow,
               baselineEligible: boolean, inBaselineSet: boolean }],

  excluded: [{ episodeId, reason }],        // 'no_onset' | 'before_first_period' | 'implausible_cycle_spacing' | 'duplicate_id'

  counts: { classified, inWindow, outsideWindow, excluded },

  observedRatio,                            // inWindow / classified, null when classified === 0

  baseline: {
    type: 'uniform_timing_reference',       // NOT a probability, NOT a risk
    windowDays: 5,
    cyclesUsed: ['cyc_ava_1','cyc_ava_2'],
    episodesInBaseline: 6,
    expectedInWindow: 1.071,
    expectedRatio: 0.1786,
    observedInBaseline: 5,
    observedRatioMatched: 0.8333,
    perCycle: [{ cycleId, lengthDays, episodes, expectedInWindow }]
  },

  severity: { meanInWindow, meanOutsideWindow, nInWindow, nOutsideWindow },

  cyclesWithWindowAttack: { with: 3, of: 3, cycleIds: [...] },

  dataSufficiency: { level: 0|1|2, completeCycles, cyclesWithKnownLength,
                     episodesClassified, episodesInBaseline, reasons: [] },

  warnings: [],   // data-quality: G1 spacing, stored lengthDays mismatch, missing period start…
  caveats:  []    // mandatory copy fragments the UI must render
}
```

### 2.3 Pipeline (in order)
1. **Normalise cycles** — drop `startDate == null` (reason `no_anchor`, warning `missing_period_start`); sort ascending; dedupe identical dates.
2. **Guard G1 — implausible spacing / length.** If `P[j+1] − P[j] < 10` **or** `> 60` days, flag both cycles `state:'implausible'`, emit warning `implausible_cycle_length`, and move episodes whose *only* window match is one of them to `excluded.implausible_cycle_spacing`. Guard G1 runs **before** classification, so no episode is ever counted by two windows and no `5/L` reference above 1 can reach the UI (with `L = 4` the naive reference would be 1.25 — an impossible "expected" count).
3. **Derive lengths** — `L[j] = diffDays(P[j+1], P[j])` when `P[j+1]` exists, else `null`. **Derived length always wins over the stored `lengthDays`.** If they differ, emit warning `length_mismatch`. `isComplete` is *display metadata only* — a cycle is `complete` for analysis iff its derived length is known.
4. **Filter episodes** — dedupe by `id` (first wins, warning `duplicate_id`); `startAt` missing/unparseable → `excluded.no_onset`; `onsetDate < P[0] − 2` → `excluded.before_first_period`.
5. **Classify** — §1.4 attribution; record `dayNumber`, `inWindow`, `anchorCycleId`.
6. **Territory (for baseline only)** — episode belongs to cycle `j` when `onsetDate ∈ [P[j], P[j+1] − 1]`; for the last open cycle, `[P[j], asOfDate]`. `baselineEligible = territory found AND L[j] != null`.
7. **Baseline** — over baseline-eligible episodes:
   `expectedInWindow = Σ_j ( n_j × 5 / L[j] )`, `expectedRatio = expectedInWindow / Σ_j n_j`, `observedRatioMatched = Σ_j (in-window in cycle j) / Σ_j n_j`.
8. **Ratios & severity** — `observedRatio = inWindow / classified`; means over non-null `peakSeverity`, 1 dp, `null` when empty. Missing severity is never treated as 0.
9. **DataSufficiency** — §5. Everything recomputed from scratch on every call.

---

## 3. Completed vs. ongoing cycles, unknown dates, irregular cycles

| Situation | Rule |
|---|---|
| **Completed cycle** (next period start logged) | `state:'complete'`, `lengthDays = P[j+1] − P[j]`, contributes to the baseline |
| **Open / current cycle** (no next start yet) | `state:'open'`, `lengthDays = null`. Its episodes **are classified** (onset is known) but are **excluded from the baseline** — the chance denominator is unknown. Never substitute 28, and never substitute the patient's mean length. |
| **Missing `startDate`** | Cycle dropped as an anchor (`no_anchor` + warning). Episodes in the gap classify against the nearest known start, and are flagged `sparse_history` when the gap between two known starts exceeds 45 days. |
| **`isComplete: true` but no next start** | Trust the **derived** length, not the flag. If the next start is absent, the cycle is `open` for analysis regardless of the stored flag; emit `length_mismatch`. |
| **Irregular cycles** | **Never** pool a single "28-day" baseline. Compute `5 / L[j]` **per cycle** and weight by that cycle's episode count (§2.3 step 7). Additionally expose `perCycle[]` so the UI can show the range. If `max(L) − min(L) > 7` among cycles used, add caveat `irregular_cycles`. |
| **Withdrawal bleeding** (hormonal contraception / cyclic HRT) | Counts as a period start in ICHD-3. CareLoop cannot distinguish it from breakthrough bleeding from the current schema, so add caveat `bleeding_type_unverified` whenever the patient has any hormonal-contraception regimen. |
| **Spotting vs. menstruation** | Out of scope. If `periodDays` exists in future, require ≥1 day flagged as flow; until then all `startDate`s are taken as given. |

---

## 4. Edited / deleted records and double counting

1. **Recompute, never increment.** No counters are persisted. `analysePattern` is called with the current merged arrays on every render (memoised by React, not by a cache). An edit or delete therefore cannot leave a stale count.
2. **Deleting an episode** removes it from `classified`, from its cycle's `n_j`, and from the severity means. Fixture episodes are read-only in the UI, so "deleting" one is a test-only operation.
3. **Editing an episode onset** reclassifies it immediately — including crossing a cycle boundary. Day number and window membership both change; no residual state.
4. **Editing a cycle `startDate`** shifts its window and **also changes the derived length of the previous cycle**, because `L[j] = P[j+1] − P[j]`. Both the numerator and the baseline must move. Test T18 pins this.
5. **Deleting a cycle** removes an anchor *and* removes the derived length of the preceding cycle, which can drop the patient a DataSufficiency level. Test T19 pins this.
6. **Double counting is prevented three ways:** (a) attribution takes at most one anchor per episode (§1.4); (b) dedupe by episode `id` before analysis; (c) an episode contributes to exactly one cycle's `n_j` via territory (§2.3 step 6), even when its window is anchored to the *next* period start — see `ep_sof_6`, which sits in cycle 2's territory but in cycle 3's window.
7. **Baseline-eligible ≠ classified.** Episodes in an open cycle, or before the first logged period, count in `observedRatio` but **not** in `baseline`. The UI must therefore compare `observedRatioMatched` against `expectedRatio` (matched denominators), and may only quote `observedRatio` as a plain description.

---

## 5. DataSufficiency levels and confidence wording

```js
// src/features/analysis/dataSufficiency.js
if (completeCycles < 1 || episodesClassified < 3)      level = 0;
else if (cyclesWithKnownLength >= 2 &&
         episodesInBaseline   >= 6 &&
         episodesClassified   >= 6)                     level = 2;
else                                                    level = 1;
```
`completeCycles` = cycles whose **derived** length is known. `reasons[]` records which condition failed.

| Level | Gate | Required wording | Banned wording |
|---|---|---|---|
| **0** Mirror only | <1 complete cycle or <3 classified episodes | "You've logged N attacks. Pattern analysis needs at least one completed cycle and three attacks." Show the raw list only. | any "pattern", "cluster", "tends to", any comparison |
| **1** Hedged | ≥1 complete cycle + ≥3 attacks, not yet Level 2 | "**So far**, X of the Y attacks you logged started in the five-day window around the start of your period." Always append the reason it is not yet Level 2 ("only N attacks", "one cycle length known so far"). | "your pattern shows", "you tend to", "more likely" |
| **2** Descriptive pattern | ≥2 cycles with known length, ≥6 baseline episodes, ≥6 classified | "**In your log**, X of Y attacks (Z%) started in the five-day window from 2 days before to 3 days after the first day of your period." Then the matched baseline sentence, then the uncertainty sentence. | "you have menstrual migraine", "you meet ICHD-3 criteria", "your risk", "caused by your period", "this proves" |

**Mandatory on every card, at every level**
- Footer: *"This is a description of your own log. It is not a diagnosis."*
- The window is always spelled out: *"five days: 2 days before through 3 days after day 1 of bleeding (there is no day 0)."*
- The baseline is always labelled: *"if attacks were spread evenly across the cycle"* — never "expected", never "normal", never "probability".
- Uncertainty sentence: state the sample size in cycles *and* attacks.
- Never quote a p-value, confidence interval, odds ratio or sensitivity/specificity.

---

## 6. Example insight cards (computed from the fixtures)

All numbers below were recomputed from `fixtures/*.json` with the corrected algorithm. Per-episode day numbers are in §8 (T10–T12).

### Ava Chen, 29 — Level 2
> **Your attacks cluster around the start of your period**
> In your log, **7 of the 9 attacks** you recorded (**78%**) started in the five-day window from 2 days before to 3 days after the first day of a period.
> Across the **2 cycles where your cycle length is known**, **5 of 6** attacks fell in that window. If attacks were spread evenly across the cycle you'd expect about **1 of 6** — the window is 5 of 28 days (18%).
> Attacks in the window averaged **7.6 / 10** peak severity vs **5.5 / 10** outside it (7 vs 2 attacks — a rough comparison on small numbers).
> In all **3 of your 3** logged cycles, at least one attack fell in the window.
> *Three cycles is a small sample. This is a description of your own log. It is not a diagnosis.*

### Mei Lin, 34 — Level 1
> **So far, most of your logged attacks started near your period — but it's early**
> So far, **3 of the 5** attacks you logged started in the five-day window around the start of your period.
> Over the 2 cycles with a known length, **2 of 4** attacks fell in the window; spread evenly across the cycle you'd expect about **0.7 of 4**.
> Your logged cycle lengths vary (**31 and 25 days**), so the comparison is less steady than it is for a regular cycle.
> *Level 1 because: only 5 attacks logged, and only 4 fall inside cycles with a known length. Five attacks over three cycles isn't enough to describe a pattern yet. This is a description of your own log. It is not a diagnosis.*

### Sofia R., 41 — Level 2
> **About half of your attacks start near your period**
> In your log, **4 of the 8** attacks you recorded (**50%**) started in the five-day window around the start of a period.
> Across the 2 cycles with a known length, **3 of 6** attacks fell in the window; spread evenly across the cycle you'd expect about **0.9 of 6** — your cycle lengths are 33 and 32 days, so the reference is about 15%.
> Attacks in the window averaged **8.3 / 10** vs **6.8 / 10** outside it (4 vs 4 attacks).
> At least one attack fell in the window in **2 of your 3** logged cycles.
> *One attack you logged is still in progress; it's counted because we know when it started. Three cycles is a small sample. This is a description of your own log. It is not a diagnosis.*

---

## 7. Safety review — misleading causal claims and invalid comparisons

### 7.1 Causal claims that must never appear
| Banned | Why | Use instead |
|---|---|---|
| "Your period causes your migraines" | Co-occurrence in a calendar window is not causation; oestrogen withdrawal is a hypothesis, not a demonstrated mechanism in this app | "Your attacks often start in the same five days as your period" |
| "You have menstrual migraine" / "You meet ICHD-3 criteria" | Requires a clinician; ICHD-3 MM criteria are **unvalidated appendix criteria** and the 2-of-3-cycles rule is **disputed** (Verhagen 2022) | "In 3 of your 3 logged cycles, at least one attack started in the window" — plus the not-a-diagnosis footer |
| "X% of your attacks are hormonal" | The window is temporal, not mechanistic; attacks in the window can have other triggers | "X% started in the five-day window" |
| "Your risk of an attack is N% on day 2" | The uniform-timing reference is not a probability for any individual | "You logged N attacks on day 2" |

### 7.2 Invalid comparisons
1. **Retired `6/28 = 0.214`.** Six days overstates the window by 20% and *understates* the contrast. Use `5 / L[j]`.
2. **Uniform timing is an assumption, not a fact.** `5/L` assumes every cycle day is equally likely and attacks are independent. Real migraine clusters for many other reasons. Label it "if attacks were spread evenly across the cycle"; never "expected", "normal", "baseline risk", or "probability".
3. **Mismatched denominators.** `observedRatio` (all classified episodes) must never be compared against `expectedRatio` (baseline-eligible episodes only). The UI compares `observedRatioMatched` vs `expectedRatio` and shows `episodesInBaseline` next to them.
4. **Pooling irregular cycles into one 28-day baseline.** Weighted per-cycle `5/L[j]` only; surface `perCycle[]`.
5. **Severity comparison on tiny n.** Ava's out-of-window mean is 2 attacks; Mei's is 2. Never present it as a finding on its own; print both n's.
6. **Cross-patient comparison.** Ava 78% vs Sofia 50% differ in cycle length and n — the app never compares two patients.
7. **Duration-based classification.** An attack beginning on day −5 that runs into day +1 is **not** perimenstrual (Verhagen 2022). Onset only.
8. **UTC date conversion.** Parsing `2025-03-06T07:00:00+08:00` as UTC yields 2025-03-05 and silently flips classification. Use `localDateOf`.
9. **Presenting "2 out of 3 cycles" as a diagnostic result.** It is a descriptive tally; ICHD-3's criterion is a clinical judgement with an unvalidated threshold.
10. **Double counting.** An episode lying in two windows (implausible cycle spacing) or duplicated by `id` would inflate the numerator — guards G1 + dedupe, both tested.
11. **Recall / logging bias.** Users log more during bad weeks. State sample size; never generalise to unlogged time.
12. **Bleeding type unverified.** Withdrawal bleeding counts as menstruation in ICHD-3, breakthrough bleeding does not; CareLoop cannot tell them apart. Caveat required when a hormonal regimen exists.

---

## 8. Acceptance tests

Automate all of these with Vitest against `asOfDate = '2025-03-20'`. Expected values are computed from the fixtures, not estimated.

| ID | Given / When / Then |
|---|---|
| **T1** Window dates — `windowDates('2025-03-15')` → `['2025-03-13','2025-03-14','2025-03-15','2025-03-16','2025-03-17']`, length 5. |
| **T2** No day 0 — `menstrualDayNumber('2025-03-14','2025-03-15') === -1`, `('2025-03-15') === 1`. Assert `0` is never returned for any date. |
| **T3** Month boundary — `windowDates('2025-03-01')` → `['2025-02-27','2025-02-28','2025-03-01','2025-03-02','2025-03-03']` (2025 is not a leap year; **no 02-29**). |
| **T4** Year boundary backwards — `windowDates('2025-01-01')` → `['2024-12-30','2024-12-31','2025-01-01','2025-01-02','2025-01-03']`. |
| **T5** Leap year — `windowDates('2024-03-01')` → `['2024-02-28','2024-02-29','2024-03-01','2024-03-02','2024-03-03']`; `windowDates('2024-02-28')` → `['2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01']`. |
| **T6** Year rollover forwards — `windowDates('2025-12-31')` → `['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02']`. |
| **T7** Positive-offset timezone — episode `2025-03-06T07:00:00+08:00`, P = `2025-03-03` → local date `2025-03-06`, day **+4**, **outside**. Assert the result is identical under `TZ=UTC`, `TZ=Asia/Shanghai` and `TZ=America/New_York` (UTC parsing would wrongly give `2025-03-05`, day +3, inside). |
| **T8** Negative-offset timezone — episode `2025-03-05T20:00:00-05:00`, P = `2025-03-03` → local date `2025-03-05`, day **+3**, **inside**; UTC parsing would give `2025-03-06`, day +4, outside. |
| **T9** Onset-only — episode `startAt 2025-03-10T20:00:00+08:00`, `endAt 2025-03-16T10:00:00+08:00`, P = `2025-03-15` → **outside** (started day −5, still running on day +2). `endAt` is not read. |
| **T10** Ava baseline — `inWindow = 7`, `classified = 9`, `observedRatio = 0.7778`; day numbers `+1,+3,+14,+2,+3,−2,+1,+3,+13`; `meanInWindow = 7.6`, `meanOutsideWindow = 5.5`; `baseline.episodesInBaseline = 6`, `expectedInWindow = 1.071`, `expectedRatio = 0.1786`, `observedInBaseline = 5`, `observedRatioMatched = 0.8333`; `cyclesWithWindowAttack = 3 of 3`; level **2**. **Assert `expectedRatio !== 0.214`.** |
| **T11** Mei baseline — `inWindow = 3`, `classified = 5`, `observedRatio = 0.6`; day numbers `+2,−12,+2,−12,+2`; `meanInWindow = 8.3`, `meanOutsideWindow = 5.5`; derived lengths **31 and 25** (warning `length_mismatch` for `cyc_mei_2`, stored 26); `expectedRatio = 0.1806`; level **1** with reason `episodesInBaseline < 6` (4). |
| **T12** Sofia baseline — `inWindow = 4`, `classified = 8`, `observedRatio = 0.5`; day numbers `−2,+2,+12,−14,−10,−2,+2,+5`; `meanInWindow = 8.3`, `meanOutsideWindow = 6.8`; lengths 33, 32; `expectedRatio = 0.1555`, `observedInBaseline = 3`; `cyclesWithWindowAttack = 2 of 3`; level **2**. |
| **T13** Ongoing episode is included — `ep_sof_8` (`endAt: null`, onset 2025-03-19) → day **+5**, outside, `classified`; removing `endAt` from any episode must not change `inWindow`. |
| **T14** Missing onset — episode with `startAt: null` → `excluded` with reason `no_onset`; `counts.classified` unchanged; `observedRatio` unchanged. |
| **T15** Before first period — add episode onset `2025-01-01` to Ava (P₁ = 2025-01-06, P₁−2 = 2025-01-04) → `excluded` reason `before_first_period`; `inWindow` stays 7, `classified` stays 9. |
| **T16** Deleted episode — remove `ep_ava_7` → `inWindow = 6`, `classified = 8`, `observedRatio = 0.75`, `meanInWindow = 7.5`, `cyclesWithWindowAttack = 3 of 3` (2/2/2). |
| **T17** Edited episode onset — move `ep_ava_9` to `2025-03-04T10:00:00+08:00` → day **+2**, inside; `inWindow = 8`, `observedRatio = 0.8889`, `meanInWindow = 7.4`, `meanOutsideWindow = 5.0`, cycle-3 hits 4. |
| **T18** Edited cycle start — move `cyc_ava_2.startDate` to `2025-02-05` → derived lengths become **30 and 26**; `ep_ava_4` becomes day **−1** (inside) and `ep_ava_5` day **+1** (inside); `inWindow = 7`, `baseline.expectedRatio = 0.1752`, `observedInBaseline = 5`. Proves the baseline moves with the edit and that day −1 still classifies (the old `k+1` formula would have produced day 0 here). |
| **T19** Deleted cycle — remove `cyc_ava_3` → `ep_ava_6/7/8/9` lose their anchor, `inWindow = 4`, `observedRatio = 0.4444`, `meanInWindow = 7.8`, `meanOutsideWindow = 6.6`; `cyclesWithKnownLength = 1` → level drops to **1**; `baseline.episodesInBaseline = 3`, `expectedRatio = 0.1786`. |
| **T20** No double counting (implausible spacing) — cycles `2025-03-01` and `2025-03-05`, one episode `2025-03-03` (inside both windows, day +3 of the first and day −1 of the second) → guard **G1** fires, warning `implausible_cycle_spacing`, the episode is `excluded` (not counted once per window), `baseline` is empty, level **0**. Without the guard the naive run yields `1/1` with `L = 4` and `expectedRatio = 1.25`, which the test must reject. |
| **T21** Duplicate id — the same episode object twice → deduped, counted once, warning `duplicate_id`; totals identical to the single-copy run. |
| **T22** Purity — calling `analysePattern` twice on inputs that differ only by one edited onset returns different results (no cross-call memoisation); and calling it twice on identical inputs returns deep-equal results. |
| **T23** Patient isolation — running for Ava then Sofia in the same session returns T10 and T12 respectively; no value leaks between patients. |
| **T24** Irregular cycles — Mei's `perCycle` must be `[{31, n:2}, {25, n:2}]` with per-cycle references `0.1613` and `0.2`, and the UI must not render a single pooled "28-day" figure. |
| **T25** Copy guard — snapshot the rendered card strings for all three patients; assert none contains /diagnos\|you have menstrual\|caused by\|risk of\|probability\|meets? ICHD\|criteria/ and that each contains "not a diagnosis". |

---

## 9. Fixture defects found while recomputing (fix or guard)

| # | File | Defect | Action |
|---|---|---|---|
| F1 | `fixtures/mei.json` | `cyc_mei_2.lengthDays = 26`, but `2025-02-20 → 2025-03-17` is **25** days | Change to `25`, or leave it and rely on the derived length + `length_mismatch` warning (T11 asserts the warning) |
| F2 | `fixtures/sofia.json` | `ep_sof_6.notes` = "Day before period.", but onset 2025-03-13 with P₃ = 2025-03-15 is **day −2** | Reword to "Two days before period." |
| F3 | `fixtures/ava.json` | `_expected.clustering.expectedRatioByChance = 0.214` | Replace with `0.1786`; also record `windowDays: 5`, `baselineEpisodes: 6`, `expectedInWindow: 1.071` |
| F4 | all | `_expected` blocks contain no `cyclesWithWindowAttack` or `perCycle` baseline | Extend, or delete `_expected` and treat §8 as the single source of truth |

---

## 10. Files and milestone plan

```
src/lib/cycleDates.js                       localDateOf, diffDays, addDays, menstrualDayNumber, windowDates, isInWindow
src/features/analysis/perimenstrualWindow.js  WINDOW_DAYS, attribution (§1.4), guard G1
src/features/analysis/analysePattern.js       pipeline §2.3, returns the §2.2 object
src/features/analysis/dataSufficiency.js      level 0/1/2 + reasons
src/features/analysis/insightCopy.js          pure functions -> the §6 strings (no branching on diagnosis)
src/features/analysis/PatternInsightCard.jsx  renders level-appropriate copy + mandatory footer/caveats
src/features/analysis/__tests__/*.test.js     T1–T25
```

**Order (2–3 days):** `cycleDates.js` + its tests (T1–T9) → `analysePattern.js` + fixture tests (T10–T13) → guards and exclusions (T14–T15, T20–T21) → edit/delete recompute (T16–T19) → `dataSufficiency` + `insightCopy` + card (T22–T25) → fix F1–F4 → grep for `0.214`.

**Definition of done:** T1–T25 pass; `grep -rn "0\.214\|6/28" src/` is empty; every card renders the not-a-diagnosis footer; no level-0 card contains the word "pattern"; `analysePattern` contains no `Date.now()`, no `fetch`, and no LLM call.
