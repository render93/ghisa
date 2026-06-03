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
        week,
        cycle,
        isDeload: true
      };
    }
    return {
      sets: pattern.sets,
      reps: pattern.reps,
      load: roundTo(baseLoad * pattern.mult, effectiveRounding(ex, settings)),
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
    const target = entry.prescribed.reps;
    const allCompleted = entry.actualSets.every(
      (s) => s.status === 'ok' && (s.reps || 0) >= target
    );
    if (allCompleted) {
      updated.linearCurrentLoad = roundTo(
        (ex.linearCurrentLoad ?? 0) + settings.linearIncrementKg,
        effectiveRounding(ex, settings)
      );
      updated.linearConsecutiveFailures = 0;
      return {
        updatedExercise: updated,
        info: { kind: 'linear-advance', newLoad: updated.linearCurrentLoad! }
      };
    }
    const fails = (ex.linearConsecutiveFailures ?? 0) + 1;
    if (fails >= 2) {
      updated.linearCurrentLoad = roundTo(
        (ex.linearCurrentLoad ?? 0) * (1 - settings.linearResetPct / 100),
        effectiveRounding(ex, settings)
      );
      updated.linearConsecutiveFailures = 0;
      return {
        updatedExercise: updated,
        info: { kind: 'linear-deload', newLoad: updated.linearCurrentLoad! }
      };
    }
    updated.linearConsecutiveFailures = fails;
    return { updatedExercise: updated, info: { kind: 'linear-repeat' } };
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
