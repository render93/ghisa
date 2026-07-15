export type Scheme = 'wave' | 'linear';

export type Settings = {
  defaultRestSec: number;
  weightUnit: 'kg' | 'lb';
  waveCycleIncrementPct: number;
  linearIncrementSteps: number;
  linearResetPct: number;
  linearLoadShiftPct: number;
  linearFailThreshold: number;
  plateRoundingWave: number;
  plateRoundingLinear: number;
  notificationsEnabled: boolean;
  cycleHoldThreshold: number;
  cycleResetThreshold: number;
  cycleResetPct: number;
  deloadEveryNCycles: number;
  deloadLoadPct: number;
  deloadSetsMult: number;
  deloadRepsMult: number;
};

export type Exercise = {
  id: string;
  name: string;
  scheme: Scheme;
  restSeconds: number;
  plateRounding?: number; // override del passo di arrotondamento; assente = default dello schema
  barWeight?: number; // peso bilanciere (kg): concorre al totale ma esente da arrotondamento; assente = 0
  // assente equivale al motore legacy v1
  progressionVersion?: number;
  // wave
  waveBaseLoad?: number;
  // piano v2: esattamente 5 carichi, tutti escluso bilanciere
  waveCycleLoads?: number[];
  waveCurrentWeek?: number;
  waveCurrentCycle?: number;
  cycleFailures?: number;
  pendingDeload?: boolean;
  // linear
  linearCurrentLoad?: number;
  linearTargetSets?: number;
  linearTargetReps?: number;
  linearConsecutiveFailures?: number;
  linearIncrementSteps?: number; // override del numero di passi per advance; assente = settings.linearIncrementSteps
};

export type Prescription = {
  sets: number;
  reps: number;
  load: number; // peso dischi (lo step di arrotondamento si applica qui)
  barWeight?: number; // snapshot del peso bilanciere al momento della prescrizione; totale = load + barWeight
  week?: number;
  cycle?: number;
  isDeload?: boolean;
  consecutiveFails?: number;
  algorithmVersion?: number;
};

export type SetStatus = 'ok' | 'fail' | null;

export type ActualSet = {
  status: SetStatus;
  reps: number;
  load: number;
  ts?: string;
};

export type Entry = {
  prescribed: Prescription;
  actualSets: ActualSet[];
  isDeloadSession?: boolean;
};

export type UserAction = 'repeat' | null;

export type ProgressionResult =
  | { kind: 'noop' }
  | { kind: 'linear-advance'; newLoad: number }
  | { kind: 'linear-downshift'; newLoad: number }
  | { kind: 'linear-upshift'; newLoad: number }
  | { kind: 'linear-repeat' }
  | { kind: 'linear-deload'; newLoad: number }
  | { kind: 'wave-advance-week'; failed: boolean; week: number; cycleFailures: number }
  | { kind: 'wave-repeat-week'; cycleFailures: number }
  | { kind: 'wave-cycle-end';
      adjustmentKind: 'normal' | 'hold' | 'reset';
      fails: number;
      completedCycle: number;
      oldBase: number;
      newBase: number;
      pendingDeload: boolean;
      nextCycle: number;
    }
  | {
      kind: 'wave-v2-advance';
      algorithmVersion: 2;
      completedWeek: number;
      nextWeek: number;
      prescribedLoad: number;
      consolidatedLoad: number;
      requiredSets: number;
      validSets: number;
      nextLoad: number;
    }
  | {
      kind: 'wave-v2-rebase-advance';
      algorithmVersion: 2;
      completedWeek: number;
      prescribedLoad: number;
      consolidatedLoad: number;
      oldPlan: number[];
      newPlan: number[];
    }
  | {
      kind: 'wave-v2-repeat-reduced';
      algorithmVersion: 2;
      week: number;
      prescribedLoad: number;
      reducedLoad: number;
      requiredSets: number;
      validSets: number;
      oldPlan: number[];
      newPlan: number[];
    }
  | {
      kind: 'wave-v2-cycle-end';
      algorithmVersion: 2;
      completedCycle: number;
      adjustmentKind: 'advance' | 'rebase';
      prescribedLoad: number;
      consolidatedLoad: number;
      requiredSets: number;
      validSets: number;
      oldPlan: number[];
      completedPlan: number[];
      nextPlan: number[];
      pendingDeload: boolean;
    }
  | {
      kind: 'linear-v2-complete' | 'linear-v2-tolerated' | 'linear-v2-repeat' | 'linear-v2-deload';
      algorithmVersion: 2;
      requiredSets: number;
      validSets: number;
      oldLoad: number;
      newLoad: number;
      incrementApplied: number;
      consecutiveFailures: number;
    }
  | { kind: 'deload-completed' };

export type EntryStatus =
  | { kind: 'ok'; text: string }
  | { kind: 'fail'; text: string }
  | { kind: 'partial'; text: string };

export const WAVE_PATTERN = [
  { sets: 3, reps: 8, mult: 1.0 },
  { sets: 4, reps: 6, mult: 1.05 },
  { sets: 5, reps: 5, mult: 1.1 },
  { sets: 6, reps: 4, mult: 1.15 },
  { sets: 8, reps: 3, mult: 1.2 }
] as const;

export const DEFAULT_SETTINGS: Settings = {
  defaultRestSec: 180,
  weightUnit: 'kg',
  waveCycleIncrementPct: 2,
  linearIncrementSteps: 1,
  linearResetPct: 10,
  linearLoadShiftPct: 25,
  linearFailThreshold: 2,
  plateRoundingWave: 2.5,
  plateRoundingLinear: 2,
  notificationsEnabled: false,
  cycleHoldThreshold: 2,
  cycleResetThreshold: 3,
  cycleResetPct: 5,
  deloadEveryNCycles: 3,
  deloadLoadPct: 90,
  deloadSetsMult: 0.5,
  deloadRepsMult: 0.8
};
