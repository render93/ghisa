export type Scheme = 'wave' | 'linear';

export type Settings = {
  defaultRestSec: number;
  weightUnit: 'kg' | 'lb';
  waveCycleIncrementPct: number;
  linearIncrementKg: number;
  linearResetPct: number;
  plateRounding: number;
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
  // wave
  waveBaseLoad?: number;
  waveCurrentWeek?: number;
  waveCurrentCycle?: number;
  cycleFailures?: number;
  pendingDeload?: boolean;
  // linear
  linearCurrentLoad?: number;
  linearTargetSets?: number;
  linearTargetReps?: number;
  linearConsecutiveFailures?: number;
};

export type Prescription = {
  sets: number;
  reps: number;
  load: number;
  week?: number;
  cycle?: number;
  isDeload?: boolean;
  consecutiveFails?: number;
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
  waveCycleIncrementPct: 2.5,
  linearIncrementKg: 2.5,
  linearResetPct: 10,
  plateRounding: 2.5,
  notificationsEnabled: false,
  cycleHoldThreshold: 2,
  cycleResetThreshold: 3,
  cycleResetPct: 5,
  deloadEveryNCycles: 3,
  deloadLoadPct: 90,
  deloadSetsMult: 0.5,
  deloadRepsMult: 0.8
};
