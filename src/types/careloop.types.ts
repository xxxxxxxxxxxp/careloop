/**
 * CareLoop — core domain types
 * Companion to: CareLoop-AI-Companion-Spec.md
 *
 * RULES FOR THE IMPLEMENTER
 * 1. `src/core` and `src/safety` are pure. No network, no DOM, no LLM imports.
 * 2. Enums are CLOSED unions. The LLM may only emit members of these unions;
 *    anything else is rejected by the validator (gate V1).
 * 3. `null` means "not logged". Never coerce null -> 0 in aggregations.
 * 4. Every LLM-written record needs `source` + `confirmedAt` set by the user
 *    before it is persisted.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** ISO-8601 instant with offset, e.g. "2025-03-14T16:20:00+08:00" */
export type IsoInstant = string;
/** Local calendar day, e.g. "2025-03-14". Day boundary = user's local midnight. */
export type IsoDate = string;
/** "HH:mm" in the user's local time, e.g. "22:30" */
export type LocalTime = string;

export type Severity0to10 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type Scale0to3 = 0 | 1 | 2 | 3;
export type Quality1to5 = 1 | 2 | 3 | 4 | 5;

export type Source = 'user' | 'device' | 'predicted' | 'system' | 'parsed_from_text';

// ---------------------------------------------------------------------------
// Closed vocabularies (LLM output is constrained to these)
// ---------------------------------------------------------------------------

export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type CycleRegularity = 'regular' | 'somewhat_irregular' | 'very_irregular';

/** Self-reported. This is NOT a diagnosis and must never be rendered as one. */
export type DiagnosisStatus =
  | 'diagnosed_by_clinician'
  | 'self_suspected'
  | 'unsure'
  | 'not_diagnosed';

export type UserGoal =
  | 'spot_my_pattern'
  | 'prepare_for_appointments'
  | 'manage_medication'
  | 'improve_sleep'
  | 'reduce_attack_burden';

export type Flow = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export type AssociatedSymptom =
  | 'aura'
  | 'photophobia'
  | 'phonophobia'
  | 'nausea'
  | 'vomiting'
  | 'osmophobia'
  | 'dizziness'
  | 'neck_pain'
  | 'brain_fog'
  | 'fatigue';

export type AuraType = 'visual' | 'sensory' | 'speech' | 'other';

export type PainSide =
  | 'left'
  | 'right'
  | 'both'
  | 'alternating'
  | 'unilateral_unspecified';

export type PainQuality = 'throbbing' | 'pressing' | 'stabbing' | 'other';

export type FunctionalImpact =
  | 'none'
  | 'slowed_down'
  | 'missed_some'
  | 'missed_work_or_school'
  | 'bedbound';

export type TriggerTag =
  | 'stress'
  | 'skipped_meal'
  | 'dehydration'
  | 'caffeine_withdrawal'
  | 'alcohol'
  | 'poor_sleep'
  | 'weather_change'
  | 'screen_time'
  | 'strong_smell'
  | 'exertion'
  | 'hormonal'
  | 'other';

export type MoodTag =
  | 'irritable'
  | 'low'
  | 'anxious'
  | 'flat'
  | 'calm'
  | 'upbeat'
  | 'weepy';

export type DrugClass =
  | 'triptan'
  | 'nsaid'
  | 'paracetamol'
  | 'combination_analgesic'
  | 'gepant'
  | 'ergot'
  | 'antiemetic'
  | 'beta_blocker'
  | 'anticonvulsant'
  | 'antidepressant'
  | 'cgrp_antibody'
  | 'hormonal'
  | 'supplement'
  | 'other';

export type MedicationPurpose =
  | 'preventive'
  | 'acute'
  | 'perimenstrual_prophylaxis'
  | 'rescue'
  | 'other';

export type IntakeIndication =
  | 'acute_for_episode'
  | 'scheduled_preventive'
  | 'perimenstrual_prophylaxis'
  | 'other';

export type SkipReason =
  | 'felt_better'
  | 'forgot'
  | 'side_effects'
  | 'ran_out'
  | 'worried_about_overuse'
  | 'other';

export type CyclePhase =
  | 'menstrual'
  | 'mid_follicular'
  | 'periovulatory'
  | 'early_luteal'
  | 'late_luteal'
  | 'unknown';

export type RedFlagLevel = 'none' | 'urgent' | 'emergency';

export type JourneyStage =
  | 'ANON'
  | 'ELIGIBILITY_GATE'
  | 'ONBOARDING'
  | 'CALIBRATING'
  | 'LOGGING'
  | 'INSIGHTS_L1'
  | 'INSIGHTS_L2'
  | 'APPOINTMENT_PREP'
  | 'EMERGENCY_REDIRECT';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  createdAt: IsoInstant;
  timezone: string; // IANA, e.g. "Asia/Shanghai"
  locale: string; // e.g. "zh-CN"
  countryCode: string; // drives the emergency number default
  ageBand: AgeBand; // band only — never send a date of birth to a model
  cycleLengthEstimate: number; // 21..45, default 28
  periodLengthEstimate: number; // 2..10, default 5
  cycleRegularity: CycleRegularity;
  migraineDiagnosisStatus: DiagnosisStatus;
  yearsWithMigraine: number | null;
  typicalAttackHours: number | null;
  usualSymptoms: AssociatedSymptom[];
  goals: UserGoal[];
  consents: {
    llmProcessing: boolean;
    analytics: boolean;
    research: boolean;
    updatedAt: IsoInstant;
  };
  redFlagsAcknowledgedAt: IsoInstant | null;
  emergencyNumber: string;
  onboardingCompletedAt: IsoInstant | null;
}

export interface Cycle {
  id: string;
  userId: string;
  startDate: IsoDate;
  endDate: IsoDate | null; // day before the next cycle's startDate; null = current
  isComplete: boolean; // derived
  lengthDays: number | null; // derived, set on close
  isAtypical: boolean; // length outside 21..45
  source: Source;
  notes: string | null;
  deletedAt: IsoInstant | null;
}

export interface PeriodDay {
  id: string;
  cycleId: string;
  date: IsoDate;
  dayIndex: number; // 1-based within the cycle
  flow: Flow;
  painLevel: Severity0to10 | null;
  cramps: boolean | null;
}

export interface MigraineEpisode {
  id: string;
  userId: string;
  startAt: IsoInstant;
  endAt: IsoInstant | null;
  durationMin: number | null; // derived on close
  peakSeverity: Severity0to10 | null; // user-set only, never inferred
  severityTrajectory: 'steady' | 'escalating' | 'peaked_and_settled' | null;
  painSide: PainSide | null;
  painQuality: PainQuality | null;
  associatedSymptoms: AssociatedSymptom[];
  auraPresent: boolean;
  auraType: AuraType | null;
  functionalImpact: FunctionalImpact | null;
  suspectedTriggers: TriggerTag[];
  // Derived; recomputed whenever cycles change. null when unmappable.
  cycleIdAtOnset: string | null;
  cycleDayAtOnset: number | null;
  phaseAtOnset: CyclePhase | null;
  isPerimenstrual: boolean | null; // day -2..+3
  urgentCareUsed: boolean;
  redFlagScreenResult: RedFlagLevel;
  notes: string | null; // <= 2000 chars, PII-scrubbed before any model call
  source: Source;
  confirmedAt: IsoInstant | null;
  deletedAt: IsoInstant | null;
}

export interface DailyLog {
  id: string;
  userId: string;
  date: IsoDate;
  headachePresent: boolean | null;
  linkedEpisodeId: string | null;
  moodTags: MoodTag[];
  energyLevel: Severity0to10 | null;
  breastTenderness: Scale0to3 | null;
  bloating: Scale0to3 | null;
  cramps: Scale0to3 | null;
  cravings: boolean | null;
  stressLevel: Severity0to10 | null;
  caffeineUnits: number | null;
  alcoholUnits: number | null;
  mealsSkipped: Scale0to3 | null;
  exerciseMinutes: number | null;
  hydrationGlasses: number | null;
  medicationAdherence: 'as_planned' | 'partial' | 'skipped' | null;
  notes: string | null;
  deletedAt: IsoInstant | null;
}

export interface SleepLog {
  id: string;
  userId: string;
  sleepDate: IsoDate; // the calendar date the night BEGAN
  bedTime: IsoInstant | null;
  wakeTime: IsoInstant | null;
  durationMin: number | null;
  awakenings: number | null;
  quality: Quality1to5 | null;
  napMinutes: number | null;
  source: Source;
  notes: string | null;
  deletedAt: IsoInstant | null;
}

/** What was PRESCRIBED / INTENDED. The only medication source of truth. */
export interface MedicationRegimen {
  id: string;
  userId: string;
  name: string; // "sumatriptan"
  genericName: string | null;
  drugClass: DrugClass;
  purpose: MedicationPurpose;
  doseText: string; // FREE TEXT, never parsed into arithmetic: "50 mg"
  frequencyText: string; // "as needed", "1 tablet daily"
  scheduleText: string | null; // "morning with food"
  maxDosesPerDay: number | null; // user-entered, used only to flag over-entry
  maxDosesPerWeek: number | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  prescriberText: string | null; // scrubbed from every model payload
  isActive: boolean;
  reminderTimes: LocalTime[];
  notes: string | null;
  source: Source;
  confirmedAt: IsoInstant | null;
  deletedAt: IsoInstant | null;
}

/** What was ACTUALLY TAKEN. */
export interface MedicationIntakeEvent {
  id: string;
  userId: string;
  regimenId: string | null;
  name: string;
  takenAt: IsoInstant | null;
  doseText: string | null; // free text; no arithmetic, ever
  indication: IntakeIndication;
  linkedEpisodeId: string | null;
  effectiveness2h: Scale0to3 | null;
  sideEffects: string[];
  isSkipped: boolean;
  skipReason: SkipReason | null;
  notes: string | null;
  source: Source;
  confirmedAt: IsoInstant | null;
  deletedAt: IsoInstant | null;
}

export interface AppointmentPrep {
  id: string;
  userId: string;
  appointmentDate: IsoDate;
  clinicianType: 'neurologist' | 'primary_care' | 'gynaecology' | 'other';
  questions: AppointmentQuestion[];
  bringList: string[];
  redFlagsToMention: string[];
  summaryTable: CycleSummaryRow[];
  generatedAt: IsoInstant;
  exportedAt: IsoInstant | null;
}

export interface AppointmentQuestion {
  text: string;
  tag: 'from_your_log' | 'general';
  rationale: string; // shown as "why this question"
}

export interface CycleSummaryRow {
  cycleStart: IsoDate;
  cycleLengthDays: number | null;
  attacks: number;
  attacksInPerimenstrualWindow: number;
  meanPeakSeverity: number | null;
  acuteMedDays: number;
  nightsUnder6h: number;
}

// ---------------------------------------------------------------------------
// Derived / computed (never user input, never stored as input)
// ---------------------------------------------------------------------------

export interface DataSufficiency {
  level: 0 | 1 | 2;
  completeCycles: number;
  loggedDays: number;
  episodeCount: number;
  reasons: string[];
}

export interface MenstrualClusteringIndex {
  windowDefinition: 'day -2 to +3';
  attacksInWindow: number;
  attacksTotal: number;
  observedRatio: number;
  expectedRatioByChance: number; // windowDays / cycleLength
  meanSeverityInWindow: number | null;
  meanSeverityOutsideWindow: number | null;
  confidence: 'insufficient' | 'tentative' | 'moderate';
}

export interface MedicationBurden {
  acuteDaysLast30: number;
  acuteDaysByClass: Partial<Record<DrugClass, number>>;
  dosesLast7: number;
  /** Informational, guideline-derived wording only. NEVER phrased as a finding. */
  thresholdNotes: string[];
}

export interface SleepMetrics {
  nightsLogged: number;
  meanDurationH: number | null;
  medianMidpoint: LocalTime | null;
  midpointSdMin: number | null;
  shortNights: number; // < 6 h
}

/**
 * The single object handed to the model. Every number the model may say
 * must exist here. Gate V2 rejects any number in the output that is absent.
 */
export interface FactsJson {
  windowLabel: string;
  cyclesAnalyzed: number;
  episodesTotal: number;
  dataSufficiency: DataSufficiency;
  clustering: MenstrualClusteringIndex | null;
  burden: {
    attacksLast30: number;
    meanPeakSeverity: number | null;
    bedboundDays: number;
    urgentCareVisits: number;
  };
  medication: MedicationBurden;
  sleep: SleepMetrics;
  topTriggerTags: TriggerTag[];
  regimens: Array<Pick<MedicationRegimen, 'name' | 'purpose' | 'doseText' | 'frequencyText' | 'maxDosesPerDay' | 'maxDosesPerWeek'>>;
  knownUnknowns: string[]; // e.g. "no sleep data logged"
}

// ---------------------------------------------------------------------------
// Agent I/O
// ---------------------------------------------------------------------------

export type AgentIntent =
  | 'log_attack'
  | 'log_period'
  | 'log_medication'
  | 'log_sleep'
  | 'ask_pattern'
  | 'ask_medication'
  | 'medication_change_request'
  | 'drug_interaction'
  | 'prepare_appointment'
  | 'pregnancy_or_paediatric'
  | 'distress'
  | 'unknown';

export type AgentResponseKind =
  | 'log_draft'
  | 'explanation'
  | 'questions'
  | 'digest'
  | 'refusal'
  | 'emergency';

export type SourceTag = 'from_your_log' | 'general_information';

export interface ValidationVerdict {
  gate: 'V1_schema' | 'V2_numeric_grounding' | 'V3_prohibited_pattern' | 'V4_drug_allowlist';
  passed: boolean;
  detail: string;
}

export interface AgentResponse {
  kind: AgentResponseKind;
  text: string;
  structured?: unknown;
  sourceTags: SourceTag[];
  factsCited: string[]; // keys into FactsJson — rendered as "why you're seeing this"
  uncertaintyNote?: string;
  promptVersion: string;
  modelId: string | null;
  validation: ValidationVerdict[];
  disclaimer: string;
  usedFallbackTemplate: boolean;
}

export interface AgentRun {
  id: string;
  intent: AgentIntent;
  startedAt: IsoInstant;
  endedAt: IsoInstant | null;
  inputHash: string;
  modelId: string | null;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  output: string | null;
  validation: ValidationVerdict[];
  status:
    | 'ok'
    | 'rejected_numeric_grounding'
    | 'rejected_prohibited_pattern'
    | 'rejected_drug_allowlist'
    | 'rejected_schema'
    | 'blocked_red_flag'
    | 'blocked_consent'
    | 'model_error'
    | 'timeout';
  promptInjectionSuspected: boolean;
}

// ---------------------------------------------------------------------------
// Insight cards
// ---------------------------------------------------------------------------

export interface InsightCard {
  id: string;
  userId: string;
  kind: 'pattern' | 'preparation' | 'education' | 'reflection';
  title: string;
  body: string;
  factsUsed: string[];
  deterministicInputsHash: string; // invalidate when underlying data changes
  promptVersion: string | null;
  modelId: string | null;
  createdAt: IsoInstant;
  dismissedAt: IsoInstant | null;
  feedback: 'helpful' | 'not_helpful' | null;
}

// ---------------------------------------------------------------------------
// Deterministic function signatures (src/core — pure)
// ---------------------------------------------------------------------------

export interface CoreApi {
  cycleDayIndex(date: IsoInstant, cycles: Cycle[]): { cycleId: string | null; dayIndex: number | null };
  phaseFor(cycleDayIndex: number, cycleLength: number): CyclePhase;
  isPerimenstrual(cycleDayIndex: number, cycleLength: number): boolean;
  forecastNextPeriod(cycles: Cycle[], estimate: number): { start: IsoDate; end: IsoDate; confidence: 'low' | 'medium' };
  clusteringIndex(episodes: MigraineEpisode[], cycles: Cycle[]): MenstrualClusteringIndex;
  medicationBurden(events: MedicationIntakeEvent[], regimens: MedicationRegimen[], asOf: IsoDate): MedicationBurden;
  sleepMetrics(logs: SleepLog[]): SleepMetrics;
  dataSufficiency(input: { cycles: Cycle[]; episodes: MigraineEpisode[]; dailyLogs: DailyLog[] }): DataSufficiency;
  computeFacts(input: CoreInputBundle, asOf: IsoDate): FactsJson;
  anonymise(payload: unknown): unknown;
}

export interface CoreInputBundle {
  profile: UserProfile;
  cycles: Cycle[];
  episodes: MigraineEpisode[];
  dailyLogs: DailyLog[];
  sleepLogs: SleepLog[];
  regimens: MedicationRegimen[];
  intakeEvents: MedicationIntakeEvent[];
}
