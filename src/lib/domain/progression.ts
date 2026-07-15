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

const QUANTIZE_EPSILON = 1e-9;

function stableNumber(value: number): number {
  return Object.is(value, -0) ? 0 : Number(value.toFixed(10));
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

function assertStep(step: number): void {
  assertFinite(step, 'step');
  if (step <= 0) throw new RangeError('step must be greater than zero');
}

function roundTo(value: number, step: number): number {
  assertFinite(value, 'value');
  assertStep(step);
  return stableNumber(Math.round(value / step) * step);
}

export function ceilToStep(value: number, step: number): number {
  assertFinite(value, 'value');
  assertStep(step);
  return stableNumber(Math.ceil(value / step - QUANTIZE_EPSILON) * step);
}

export function floorToStep(value: number, step: number): number {
  assertFinite(value, 'value');
  assertStep(step);
  return stableNumber(Math.floor(value / step + QUANTIZE_EPSILON) * step);
}

export function effectiveRounding(ex: Exercise, settings: Settings): number {
  return (
    ex.plateRounding ??
    (ex.scheme === 'wave' ? settings.plateRoundingWave : settings.plateRoundingLinear)
  );
}

export function requiredValidSets(totalSets: number): number {
  if (!Number.isInteger(totalSets) || totalSets < 0) {
    throw new RangeError('totalSets must be a non-negative integer');
  }
  return Math.ceil(totalSets * 0.75);
}

export function buildWavePlan(anchorLoad: number, anchorWeek: number, step: number): number[] {
  assertFinite(anchorLoad, 'anchorLoad');
  assertStep(step);
  if (anchorLoad < 0) throw new RangeError('anchorLoad must be non-negative');
  if (!Number.isInteger(anchorWeek) || anchorWeek < 1 || anchorWeek > WAVE_PATTERN.length) {
    throw new RangeError(`anchorWeek must be between 1 and ${WAVE_PATTERN.length}`);
  }

  return WAVE_PATTERN.map((_, index) =>
    stableNumber(Math.max(0, anchorLoad + (index - (anchorWeek - 1)) * step))
  );
}

function isWavePlan(plan: number[] | undefined): plan is number[] {
  return (
    Array.isArray(plan) &&
    plan.length === WAVE_PATTERN.length &&
    plan.every((load) => Number.isFinite(load) && load >= 0)
  );
}

function storedWaveV2Plan(ex: Exercise): number[] {
  if (!isWavePlan(ex.waveCycleLoads)) {
    throw new RangeError('wave v2 requires a valid five-load plan');
  }
  return ex.waveCycleLoads;
}

export function nextWaveCyclePlan(
  currentPlan: number[],
  barWeight: number,
  step: number,
  incrementPct: number
): number[] {
  if (!isWavePlan(currentPlan)) throw new RangeError('currentPlan must contain five non-negative loads');
  assertFinite(barWeight, 'barWeight');
  assertFinite(incrementPct, 'incrementPct');
  assertStep(step);

  const next: number[] = [];
  for (let index = 0; index < currentPlan.length; index += 1) {
    const rawTotal = (currentPlan[index] + barWeight) * (1 + incrementPct / 100);
    let candidate = Math.max(0, ceilToStep(rawTotal - barWeight, step));
    if (incrementPct > 0) candidate = Math.max(candidate, currentPlan[index] + step);
    const monotonic = index === 0 ? candidate : Math.max(candidate, next[index - 1] + step);
    next.push(stableNumber(monotonic));
  }
  return next;
}


export type LinearV2Outcome = {
  kind: 'complete-success' | 'tolerated-success' | 'failure-hold' | 'failure-deload';
  requiredSets: number;
  validSets: number;
  oldLoad: number;
  newLoad: number;
  incrementApplied: number;
  newConsecutiveFailures: number;
};

export function resolveLinearV2Outcome(
  ex: Exercise,
  entry: Entry,
  settings: Settings
): LinearV2Outcome {
  const prescribedLoad = entry.prescribed.load;
  const prescribedSets = entry.prescribed.sets;
  const requiredSets = requiredValidSets(prescribedSets);
  const validSets = entry.actualSets
    .slice(0, prescribedSets)
    .filter(
      (set) =>
        set.status === 'ok' &&
        set.reps >= entry.prescribed.reps &&
        set.load >= prescribedLoad
    ).length;
  const step = effectiveRounding(ex, settings);
  assertStep(step);

  if (prescribedSets > 0 && validSets === prescribedSets) {
    const newLoad = stableNumber(prescribedLoad + 2 * step);
    return {
      kind: 'complete-success',
      requiredSets,
      validSets,
      oldLoad: prescribedLoad,
      newLoad,
      incrementApplied: stableNumber(newLoad - prescribedLoad),
      newConsecutiveFailures: 0
    };
  }

  if (prescribedSets > 0 && validSets >= requiredSets) {
    const newLoad = stableNumber(prescribedLoad + step);
    return {
      kind: 'tolerated-success',
      requiredSets,
      validSets,
      oldLoad: prescribedLoad,
      newLoad,
      incrementApplied: stableNumber(newLoad - prescribedLoad),
      newConsecutiveFailures: 0
    };
  }

  if ((ex.linearConsecutiveFailures ?? 0) < 1) {
    return {
      kind: 'failure-hold',
      requiredSets,
      validSets,
      oldLoad: prescribedLoad,
      newLoad: prescribedLoad,
      incrementApplied: 0,
      newConsecutiveFailures: 1
    };
  }

  const barWeight = entry.prescribed.barWeight ?? ex.barWeight ?? 0;
  const rawReducedTotal = (prescribedLoad + barWeight) * 0.95;
  const percentageCandidate = floorToStep(rawReducedTotal - barWeight, step);
  const newLoad = Math.max(
    0,
    floorToStep(Math.min(prescribedLoad - step, percentageCandidate), step)
  );
  return {
    kind: 'failure-deload',
    requiredSets,
    validSets,
    oldLoad: prescribedLoad,
    newLoad,
    incrementApplied: stableNumber(newLoad - prescribedLoad),
    newConsecutiveFailures: 0
  };
}

function wavePosition(ex: Exercise): { week: number; cycle: number } {
  const week = ex.waveCurrentWeek ?? 1;
  const cycle = ex.waveCurrentCycle ?? 1;
  if (!Number.isInteger(week) || week < 1 || week > WAVE_PATTERN.length) {
    throw new RangeError(`waveCurrentWeek must be between 1 and ${WAVE_PATTERN.length}`);
  }
  if (!Number.isInteger(cycle) || cycle < 1) {
    throw new RangeError('waveCurrentCycle must be a positive integer');
  }
  return { week, cycle };
}

function assertWavePrescriptionPosition(ex: Exercise, entry: Entry): { week: number; cycle: number } {
  const position = wavePosition(ex);
  if (entry.prescribed.week !== undefined && entry.prescribed.week !== position.week) {
    throw new RangeError('prescribed week does not match exercise state');
  }
  if (entry.prescribed.cycle !== undefined && entry.prescribed.cycle !== position.cycle) {
    throw new RangeError('prescribed cycle does not match exercise state');
  }
  return position;
}

function legacyWavePrescription(ex: Exercise, settings: Settings): Prescription {
  const { week, cycle } = wavePosition(ex);
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

export function ensureProgressionV2(ex: Exercise, settings: Settings): Exercise {
  if (ex.progressionVersion === 2) {
    if (ex.scheme !== 'wave' || isWavePlan(ex.waveCycleLoads)) return { ...ex };
  }

  if (ex.scheme === 'linear') {
    return { ...ex, progressionVersion: 2, linearConsecutiveFailures: 0 };
  }

  const legacyPrescription = legacyWavePrescription(
    ex.pendingDeload ? { ...ex, pendingDeload: false } : ex,
    settings
  );
  const step = effectiveRounding(ex, settings);
  return {
    ...ex,
    progressionVersion: 2,
    waveCycleLoads: buildWavePlan(
      legacyPrescription.load,
      ex.waveCurrentWeek ?? 1,
      step
    )
  };
}

export function nextPrescription(ex: Exercise, settings: Settings): Prescription {
  if (ex.scheme === 'wave') {
    if (ex.progressionVersion !== 2) {
      return legacyWavePrescription(ex, settings);
    }
    const plan = storedWaveV2Plan(ex);

    const { week, cycle } = wavePosition(ex);
    const pattern = WAVE_PATTERN[week - 1];
    const plannedLoad = plan[week - 1];
    if (ex.pendingDeload) {
      return {
        sets: Math.max(1, Math.round(pattern.sets * settings.deloadSetsMult)),
        reps: Math.max(1, Math.round(pattern.reps * settings.deloadRepsMult)),
        load: Math.max(0, roundTo(plannedLoad * (settings.deloadLoadPct / 100), effectiveRounding(ex, settings))),
        barWeight: ex.barWeight ?? 0,
        week,
        cycle,
        isDeload: true,
        algorithmVersion: 2
      };
    }
    return {
      sets: pattern.sets,
      reps: pattern.reps,
      load: plannedLoad,
      barWeight: ex.barWeight ?? 0,
      week,
      cycle,
      isDeload: false,
      algorithmVersion: 2
    };
  }

  return {
    sets: ex.linearTargetSets ?? 0,
    reps: ex.linearTargetReps ?? 0,
    load: ex.linearCurrentLoad ?? 0,
    barWeight: ex.barWeight ?? 0,
    consecutiveFails: ex.linearConsecutiveFailures ?? 0,
    ...(ex.progressionVersion === 2 ? { algorithmVersion: 2 } : {})
  };
}

export type ProgressionAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function progressionError(error: unknown): string {
  return error instanceof Error ? error.message : 'errore di progressione sconosciuto';
}

export function tryNextPrescription(
  ex: Exercise,
  settings: Settings
): ProgressionAttempt<Prescription> {
  try {
    return { ok: true, value: nextPrescription(ex, settings) };
  } catch (error) {
    return { ok: false, error: progressionError(error) };
  }
}

export type WaveV2Outcome =
  | { kind: 'advance'; consolidatedLoad: number; requiredSets: number; validSets: number; newPlan: number[] }
  | { kind: 'rebase-advance'; consolidatedLoad: number; requiredSets: number; validSets: number; newPlan: number[] }
  | { kind: 'repeat-reduced'; reducedLoad: number; requiredSets: number; validSets: number; newPlan: number[] };

function rebaseWavePlan(plan: number[], weekIndex: number, resolvedLoad: number, prescribedLoad: number, step: number): number[] {
  const delta = resolvedLoad - prescribedLoad;
  return plan.map((load, index) =>
    index < weekIndex ? load : Math.max(0, roundTo(load + delta, step))
  );
}

function predominantAttemptedLoad(entry: Entry): number | undefined {
  const counts = new Map<number, number>();
  for (const set of entry.actualSets.slice(0, entry.prescribed.sets)) {
    if (set.status === null || !Number.isFinite(set.load)) continue;
    counts.set(set.load, (counts.get(set.load) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([loadA, countA], [loadB, countB]) => countB - countA || loadA - loadB)[0]?.[0];
}

export function resolveWaveV2Outcome(
  ex: Exercise,
  entry: Entry,
  settings: Settings
): WaveV2Outcome {
  if (ex.progressionVersion === 2) storedWaveV2Plan(ex);
  const current = ensureProgressionV2(ex, settings);
  const plan = current.waveCycleLoads;
  if (!isWavePlan(plan)) throw new RangeError('wave v2 requires a valid five-load plan');

  const { week } = assertWavePrescriptionPosition(current, entry);
  const weekIndex = week - 1;
  const prescribedLoad = entry.prescribed.load;
  const requiredSets = requiredValidSets(entry.prescribed.sets);
  const validLoads = entry.actualSets
    .slice(0, entry.prescribed.sets)
    .filter(
      (set) =>
        set.status === 'ok' &&
        set.reps >= entry.prescribed.reps &&
        Number.isFinite(set.load) &&
        set.load >= 0
    )
    .map((set) => set.load)
    .sort((a, b) => b - a);
  const validSets = validLoads.length;
  const step = effectiveRounding(current, settings);

  if (validSets >= requiredSets && requiredSets > 0) {
    const consolidatedLoad = validLoads[requiredSets - 1];
    if (consolidatedLoad === prescribedLoad) {
      return { kind: 'advance', consolidatedLoad, requiredSets, validSets, newPlan: [...plan] };
    }
    return {
      kind: 'rebase-advance',
      consolidatedLoad,
      requiredSets,
      validSets,
      newPlan: rebaseWavePlan(plan, weekIndex, consolidatedLoad, prescribedLoad, step)
    };
  }

  const predominantLoad = predominantAttemptedLoad(entry) ?? prescribedLoad;
  const reducedLoad = Math.max(
    0,
    floorToStep(Math.min(prescribedLoad - step, predominantLoad), step)
  );
  return {
    kind: 'repeat-reduced',
    reducedLoad,
    requiredSets,
    validSets,
    newPlan: rebaseWavePlan(plan, weekIndex, reducedLoad, prescribedLoad, step)
  };
}

export function entryStatus(entry: Entry): EntryStatus {
  const target = entry.prescribed.reps;
  const ok = entry.actualSets.filter((s) => s.status === 'ok' && (s.reps || 0) >= target).length;
  const total = entry.prescribed.sets;
  if (ok === total) return { kind: 'ok', text: 'Conclusa' };
  if (ok === 0) return { kind: 'fail', text: 'Fallita' };
  return { kind: 'partial', text: `Parziale ${ok}/${total}` };
}

function linearV2Info(outcome: LinearV2Outcome): ProgressionResult {
  const kind =
    outcome.kind === 'complete-success'
      ? 'linear-v2-complete'
      : outcome.kind === 'tolerated-success'
        ? 'linear-v2-tolerated'
        : outcome.kind === 'failure-deload'
          ? 'linear-v2-deload'
          : 'linear-v2-repeat';
  return {
    kind,
    algorithmVersion: 2,
    requiredSets: outcome.requiredSets,
    validSets: outcome.validSets,
    oldLoad: outcome.oldLoad,
    newLoad: outcome.newLoad,
    incrementApplied: outcome.incrementApplied,
    consecutiveFailures: outcome.newConsecutiveFailures
  };
}

export function applyEntryResult(
  ex: Exercise,
  entry: Entry,
  _userAction: UserAction,
  settings: Settings
): { updatedExercise: Exercise; info: ProgressionResult } {
  const anyAttempt = entry.actualSets.some((s) => s.status !== null);
  if (!anyAttempt) return { updatedExercise: { ...ex }, info: { kind: 'noop' } };

  if (ex.scheme === 'wave' && ex.progressionVersion === 2) storedWaveV2Plan(ex);
  const current = ensureProgressionV2(ex, settings);
  const updated: Exercise = { ...current };

  if (current.scheme === 'linear') {
    const outcome = resolveLinearV2Outcome(current, entry, settings);
    updated.linearCurrentLoad = outcome.newLoad;
    updated.linearConsecutiveFailures = outcome.newConsecutiveFailures;
    return { updatedExercise: updated, info: linearV2Info(outcome) };
  }

  assertWavePrescriptionPosition(current, entry);

  if (entry.prescribed.isDeload || entry.isDeloadSession) {
    updated.pendingDeload = false;
    return { updatedExercise: updated, info: { kind: 'deload-completed' } };
  }

  const oldPlan = [...(current.waveCycleLoads ?? [])];
  const outcome = resolveWaveV2Outcome(current, entry, settings);
  const completedWeek = current.waveCurrentWeek ?? 1;
  const completedCycle = current.waveCurrentCycle ?? 1;
  updated.waveCycleLoads = outcome.newPlan;

  if (outcome.kind === 'repeat-reduced') {
    return {
      updatedExercise: updated,
      info: {
        kind: 'wave-v2-repeat-reduced',
        algorithmVersion: 2,
        week: completedWeek,
        prescribedLoad: entry.prescribed.load,
        reducedLoad: outcome.reducedLoad,
        requiredSets: outcome.requiredSets,
        validSets: outcome.validSets,
        oldPlan,
        newPlan: [...outcome.newPlan]
      }
    };
  }

  if (completedWeek === WAVE_PATTERN.length) {
    const nextPlan = nextWaveCyclePlan(
      outcome.newPlan,
      current.barWeight ?? 0,
      effectiveRounding(current, settings),
      settings.waveCycleIncrementPct
    );
    updated.waveCycleLoads = nextPlan;
    updated.waveCurrentWeek = 1;
    updated.waveCurrentCycle = completedCycle + 1;
    updated.cycleFailures = 0;
    const interval = settings.deloadEveryNCycles;
    if (interval > 0 && completedCycle % interval === 0) updated.pendingDeload = true;
    return {
      updatedExercise: updated,
      info: {
        kind: 'wave-v2-cycle-end',
        algorithmVersion: 2,
        completedCycle,
        adjustmentKind: outcome.kind === 'rebase-advance' ? 'rebase' : 'advance',
        prescribedLoad: entry.prescribed.load,
        consolidatedLoad: outcome.consolidatedLoad,
        requiredSets: outcome.requiredSets,
        validSets: outcome.validSets,
        oldPlan,
        completedPlan: [...outcome.newPlan],
        nextPlan: [...nextPlan],
        pendingDeload: !!updated.pendingDeload
      }
    };
  }

  const nextWeek = completedWeek + 1;
  updated.waveCurrentWeek = nextWeek;
  if (outcome.kind === 'rebase-advance') {
    return {
      updatedExercise: updated,
      info: {
        kind: 'wave-v2-rebase-advance',
        algorithmVersion: 2,
        completedWeek,
        prescribedLoad: entry.prescribed.load,
        consolidatedLoad: outcome.consolidatedLoad,
        oldPlan,
        newPlan: [...outcome.newPlan]
      }
    };
  }

  return {
    updatedExercise: updated,
    info: {
      kind: 'wave-v2-advance',
      algorithmVersion: 2,
      completedWeek,
      nextWeek,
      prescribedLoad: entry.prescribed.load,
      consolidatedLoad: outcome.consolidatedLoad,
      requiredSets: outcome.requiredSets,
      validSets: outcome.validSets,
      nextLoad: outcome.newPlan[nextWeek - 1]
    }
  };
}

export function tryApplyEntryResult(
  ex: Exercise,
  entry: Entry,
  userAction: UserAction,
  settings: Settings
): ProgressionAttempt<ReturnType<typeof applyEntryResult>> {
  try {
    return { ok: true, value: applyEntryResult(ex, entry, userAction, settings) };
  } catch (error) {
    return { ok: false, error: progressionError(error) };
  }
}
