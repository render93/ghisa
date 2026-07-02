import {
  WAVE_PATTERN,
  type Entry,
  type EntryStatus,
  type Exercise,
  type Prescription,
  type ProgressionResult,
  type Settings,
  type UserAction
} from './types';

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function effectiveRounding(ex: Exercise, settings: Settings): number {
  return (
    ex.plateRounding ??
    (ex.scheme === 'wave' ? settings.plateRoundingWave : settings.plateRoundingLinear)
  );
}

export function effectiveIncrementSteps(ex: Exercise, settings: Settings): number {
  return ex.linearIncrementSteps ?? settings.linearIncrementSteps;
}

export type LinearOutcome =
  | { kind: 'advance'; newLoad: number }
  | { kind: 'downshift'; newLoad: number }
  | { kind: 'upshift'; newLoad: number }
  | { kind: 'repeat'; newLoad: number }
  | { kind: 'deload'; newLoad: number };

export function resolveLinearOutcome(ex: Exercise, entry: Entry, settings: Settings): LinearOutcome {
  const P = entry.prescribed.load;
  const R = entry.prescribed.reps;
  const sets = entry.actualSets;
  const N = sets.length;
  const step = effectiveRounding(ex, settings);
  const currentLoad = ex.linearCurrentLoad ?? 0;

  const completed = N > 0 && sets.every((s) => s.status === 'ok' && (s.reps || 0) >= R);

  const loads = sets.map((s) => s.load);
  const t = settings.linearLoadShiftPct / 100;
  const loweredOverThreshold = N > 0 && sets.filter((s) => s.load < P).length / N > t;
  const raisedOverThreshold = N > 0 && sets.filter((s) => s.load > P).length / N > t;

  if (completed) {
    if (loweredOverThreshold) return { kind: 'downshift', newLoad: roundTo(Math.min(...loads), step) };
    if (raisedOverThreshold) return { kind: 'upshift', newLoad: roundTo(Math.max(...loads), step) };
    const steps = effectiveIncrementSteps(ex, settings);
    return { kind: 'advance', newLoad: roundTo(currentLoad + steps * step, step) };
  }

  // non completato → fallimento; se ha abbassato oltre soglia, il lavoro scende comunque al minimo usato
  const baseLoad = loweredOverThreshold ? Math.min(...loads) : currentLoad;
  const fails = (ex.linearConsecutiveFailures ?? 0) + 1;
  if (fails >= settings.linearFailThreshold) {
    return { kind: 'deload', newLoad: roundTo(baseLoad * (1 - settings.linearResetPct / 100), step) };
  }
  return { kind: 'repeat', newLoad: roundTo(baseLoad, step) };
}

export function nextPrescription(ex: Exercise, settings: Settings): Prescription {
  if (ex.scheme === 'wave') {
    const week = ex.waveCurrentWeek ?? 1;
    const cycle = ex.waveCurrentCycle ?? 1;
    const pattern = WAVE_PATTERN[week - 1];
    const cycleMult = Math.pow(1 + settings.waveCycleIncrementPct / 100, cycle - 1);
    const baseLoad = (ex.waveBaseLoad ?? 0) * cycleMult;
    if (ex.pendingDeload) {
      return {
        sets: Math.max(1, Math.round(pattern.sets * settings.deloadSetsMult)),
        reps: Math.max(1, Math.round(pattern.reps * settings.deloadRepsMult)),
        load: roundTo(baseLoad * pattern.mult * (settings.deloadLoadPct / 100), effectiveRounding(ex, settings)),
        barWeight: ex.barWeight ?? 0,
        week,
        cycle,
        isDeload: true
      };
    }
    return {
      sets: pattern.sets,
      reps: pattern.reps,
      load: roundTo(baseLoad * pattern.mult, effectiveRounding(ex, settings)),
      barWeight: ex.barWeight ?? 0,
      week,
      cycle,
      isDeload: false
    };
  }
  // linear
  return {
    sets: ex.linearTargetSets ?? 0,
    reps: ex.linearTargetReps ?? 0,
    load: ex.linearCurrentLoad ?? 0,
    barWeight: ex.barWeight ?? 0,
    consecutiveFails: ex.linearConsecutiveFailures ?? 0
  };
}

export function weekWasFailed(entry: Entry): boolean {
  const target = entry.prescribed.reps;
  return entry.actualSets.some(
    (s) => s.status === 'fail' || (s.status === 'ok' && (s.reps || 0) < target)
  );
}

export function entryStatus(entry: Entry): EntryStatus {
  const target = entry.prescribed.reps;
  const ok = entry.actualSets.filter((s) => s.status === 'ok' && (s.reps || 0) >= target).length;
  const total = entry.prescribed.sets;
  if (ok === total) return { kind: 'ok', text: 'Conclusa' };
  if (ok === 0) return { kind: 'fail', text: 'Fallita' };
  return { kind: 'partial', text: `Parziale ${ok}/${total}` };
}

export function applyEntryResult(
  ex: Exercise,
  entry: Entry,
  userAction: UserAction,
  settings: Settings
): { updatedExercise: Exercise; info: ProgressionResult } {
  const updated: Exercise = { ...ex };
  const anyAttempt = entry.actualSets.some((s) => s.status !== null);
  if (!anyAttempt) return { updatedExercise: updated, info: { kind: 'noop' } };

  if (ex.scheme === 'linear') {
    const outcome = resolveLinearOutcome(ex, entry, settings);
    updated.linearCurrentLoad = outcome.newLoad;
    updated.linearConsecutiveFailures =
      outcome.kind === 'repeat' ? (ex.linearConsecutiveFailures ?? 0) + 1 : 0;
    const info: ProgressionResult =
      outcome.kind === 'advance'
        ? { kind: 'linear-advance', newLoad: outcome.newLoad }
        : outcome.kind === 'downshift'
          ? { kind: 'linear-downshift', newLoad: outcome.newLoad }
          : outcome.kind === 'upshift'
            ? { kind: 'linear-upshift', newLoad: outcome.newLoad }
            : outcome.kind === 'deload'
              ? { kind: 'linear-deload', newLoad: outcome.newLoad }
              : { kind: 'linear-repeat' };
    return { updatedExercise: updated, info };
  }

  // wave
  if (entry.prescribed.isDeload || entry.isDeloadSession) {
    updated.pendingDeload = false;
    return { updatedExercise: updated, info: { kind: 'deload-completed' } };
  }

  const failed = weekWasFailed(entry);
  if (failed) {
    updated.cycleFailures = (ex.cycleFailures ?? 0) + 1;
    if (userAction === 'repeat') {
      return {
        updatedExercise: updated,
        info: { kind: 'wave-repeat-week', cycleFailures: updated.cycleFailures }
      };
    }
  }

  const nextWeek = (ex.waveCurrentWeek ?? 1) + 1;
  if (nextWeek > 5) {
    const fails = updated.cycleFailures ?? 0;
    const oldBase = ex.waveBaseLoad ?? 0;
    const completedCycle = ex.waveCurrentCycle ?? 1;
    let adjustmentKind: 'normal' | 'hold' | 'reset' = 'normal';
    let newBase = oldBase;
    if (fails >= settings.cycleResetThreshold) {
      newBase = roundTo(oldBase * (1 - settings.cycleResetPct / 100), effectiveRounding(ex, settings));
      adjustmentKind = 'reset';
    } else if (fails >= settings.cycleHoldThreshold) {
      adjustmentKind = 'hold';
    }
    updated.waveBaseLoad = newBase;
    updated.waveCurrentWeek = 1;
    updated.waveCurrentCycle = adjustmentKind === 'hold' ? completedCycle : completedCycle + 1;
    updated.cycleFailures = 0;
    const N = settings.deloadEveryNCycles;
    const nextCycle = updated.waveCurrentCycle;
    if (N > 0 && adjustmentKind !== 'hold' && nextCycle - 1 > 0 && (nextCycle - 1) % N === 0) {
      updated.pendingDeload = true;
    }
    return {
      updatedExercise: updated,
      info: {
        kind: 'wave-cycle-end',
        adjustmentKind,
        fails,
        completedCycle,
        oldBase,
        newBase,
        pendingDeload: !!updated.pendingDeload,
        nextCycle
      }
    };
  }

  updated.waveCurrentWeek = nextWeek;
  return {
    updatedExercise: updated,
    info: {
      kind: 'wave-advance-week',
      failed,
      week: nextWeek,
      cycleFailures: updated.cycleFailures ?? 0
    }
  };
}
