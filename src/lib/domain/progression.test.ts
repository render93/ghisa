import { describe, it, expect } from 'vitest';
import { nextPrescription } from './progression';
import { DEFAULT_SETTINGS, type Exercise } from './types';

const baseWave = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'ex1',
  name: 'Test',
  scheme: 'wave',
  restSeconds: 180,
  waveBaseLoad: 100,
  waveCurrentWeek: 1,
  waveCurrentCycle: 1,
  cycleFailures: 0,
  pendingDeload: false,
  ...overrides
});

const baseLinear = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'exL',
  name: 'Test Linear',
  scheme: 'linear',
  restSeconds: 120,
  linearCurrentLoad: 60,
  linearTargetSets: 3,
  linearTargetReps: 8,
  linearConsecutiveFailures: 0,
  ...overrides
});

describe('nextPrescription — wave', () => {
  it('week 1 cycle 1 returns base prescription', () => {
    const p = nextPrescription(baseWave(), DEFAULT_SETTINGS);
    expect(p).toMatchObject({ sets: 3, reps: 8, load: 100, week: 1, cycle: 1, isDeload: false });
  });

  it('week 5 cycle 1 uses pattern multiplier 1.20', () => {
    const p = nextPrescription(baseWave({ waveCurrentWeek: 5 }), DEFAULT_SETTINGS);
    // base 100 * 1.20 = 120, rounded to plateRounding 2.5 = 120
    expect(p).toMatchObject({ sets: 8, reps: 3, load: 120, week: 5 });
  });

  it('cycle 2 applies cycle increment 2.5%', () => {
    const p = nextPrescription(baseWave({ waveCurrentCycle: 2 }), DEFAULT_SETTINGS);
    // base 100 * 1.025 (cycle) * 1.00 (week 1) = 102.5
    expect(p.load).toBe(102.5);
  });

  it('cycle 3 applies cycle increment compounded', () => {
    const p = nextPrescription(baseWave({ waveCurrentCycle: 3 }), DEFAULT_SETTINGS);
    // base 100 * (1.025^2) = 105.0625 → rounded to 2.5 → 105
    expect(p.load).toBe(105);
  });

  it('pendingDeload scales load, sets, reps down', () => {
    const p = nextPrescription(baseWave({ pendingDeload: true }), DEFAULT_SETTINGS);
    // load: 100 * 1.00 (week 1 mult) * 0.90 (deloadLoadPct) = 90
    // sets: round(3 * 0.5) = 2 (min 1)
    // reps: round(8 * 0.8) = 6 (min 1)
    expect(p).toMatchObject({ load: 90, sets: 2, reps: 6, isDeload: true });
  });
});

describe('nextPrescription — linear', () => {
  it('returns target sets/reps and current load', () => {
    const p = nextPrescription(baseLinear(), DEFAULT_SETTINGS);
    expect(p).toMatchObject({ sets: 3, reps: 8, load: 60, consecutiveFails: 0 });
  });

  it('passes consecutiveFails through', () => {
    const p = nextPrescription(baseLinear({ linearConsecutiveFailures: 1 }), DEFAULT_SETTINGS);
    expect(p.consecutiveFails).toBe(1);
  });
});

import { weekWasFailed, entryStatus } from './progression';
import type { Entry } from './types';

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  prescribed: { sets: 3, reps: 8, load: 100 },
  actualSets: [],
  ...overrides
});

describe('weekWasFailed', () => {
  it('returns false when all sets ok and reps >= target', () => {
    const e = entry({
      actualSets: [
        { status: 'ok', reps: 8, load: 100 },
        { status: 'ok', reps: 8, load: 100 },
        { status: 'ok', reps: 9, load: 100 }
      ]
    });
    expect(weekWasFailed(e)).toBe(false);
  });

  it('returns true when any set has status fail', () => {
    const e = entry({
      actualSets: [
        { status: 'ok', reps: 8, load: 100 },
        { status: 'fail', reps: 6, load: 100 }
      ]
    });
    expect(weekWasFailed(e)).toBe(true);
  });

  it('returns true when ok set has reps below target', () => {
    const e = entry({
      actualSets: [
        { status: 'ok', reps: 8, load: 100 },
        { status: 'ok', reps: 5, load: 100 }
      ]
    });
    expect(weekWasFailed(e)).toBe(true);
  });
});

describe('entryStatus', () => {
  it('ok when all prescribed sets completed at target reps', () => {
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 100 },
      actualSets: [
        { status: 'ok', reps: 8, load: 100 },
        { status: 'ok', reps: 8, load: 100 },
        { status: 'ok', reps: 8, load: 100 }
      ]
    });
    expect(entryStatus(e).kind).toBe('ok');
  });

  it('fail when zero sets completed', () => {
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 100 },
      actualSets: [
        { status: 'fail', reps: 5, load: 100 },
        { status: 'fail', reps: 4, load: 100 }
      ]
    });
    expect(entryStatus(e).kind).toBe('fail');
  });

  it('partial when some sets completed', () => {
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 100 },
      actualSets: [
        { status: 'ok', reps: 8, load: 100 },
        { status: 'fail', reps: 4, load: 100 }
      ]
    });
    const s = entryStatus(e);
    expect(s.kind).toBe('partial');
    expect(s.text).toContain('1/3');
  });
});

import { applyEntryResult } from './progression';

describe('applyEntryResult — linear', () => {
  it('all sets ok → advance di N×step (default N=1, step 2 → +2)', () => {
    const ex = baseLinear({ linearCurrentLoad: 60 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 60 },
      actualSets: [
        { status: 'ok', reps: 8, load: 60 },
        { status: 'ok', reps: 8, load: 60 },
        { status: 'ok', reps: 8, load: 60 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-advance');
    // 60 + 1×2 = 62
    expect(result.updatedExercise.linearCurrentLoad).toBe(62);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
  });

  it('regressione bug: load 40, step 5 (override), N=1 globale → 45', () => {
    const ex = baseLinear({ linearCurrentLoad: 40, plateRounding: 5 });
    const e = entry({
      prescribed: { sets: 4, reps: 8, load: 40 },
      actualSets: [
        { status: 'ok', reps: 8, load: 40 },
        { status: 'ok', reps: 8, load: 40 },
        { status: 'ok', reps: 8, load: 40 },
        { status: 'ok', reps: 8, load: 40 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-advance');
    expect(result.updatedExercise.linearCurrentLoad).toBe(45);
  });

  it('override per-esercizio: N=2, step 2.5 → +5', () => {
    const ex = baseLinear({ linearCurrentLoad: 50, plateRounding: 2.5, linearIncrementSteps: 2 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 50 },
      actualSets: [
        { status: 'ok', reps: 8, load: 50 },
        { status: 'ok', reps: 8, load: 50 },
        { status: 'ok', reps: 8, load: 50 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.updatedExercise.linearCurrentLoad).toBe(55);
  });

  it('auto-correzione fuori griglia: load 42, step 5, N=1 → 45', () => {
    const ex = baseLinear({ linearCurrentLoad: 42, plateRounding: 5 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 42 },
      actualSets: [
        { status: 'ok', reps: 8, load: 42 },
        { status: 'ok', reps: 8, load: 42 },
        { status: 'ok', reps: 8, load: 42 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.updatedExercise.linearCurrentLoad).toBe(45);
  });

  it('one fail → linear-repeat, increment counter', () => {
    const ex = baseLinear({ linearCurrentLoad: 60, linearConsecutiveFailures: 0 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 60 },
      actualSets: [
        { status: 'ok', reps: 8, load: 60 },
        { status: 'fail', reps: 5, load: 60 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-repeat');
    expect(result.updatedExercise.linearCurrentLoad).toBe(60);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(1);
  });

  it('two consecutive fails → linear-deload, reset counter', () => {
    const ex = baseLinear({ linearCurrentLoad: 60, linearConsecutiveFailures: 1 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 60 },
      actualSets: [{ status: 'fail', reps: 5, load: 60 }]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-deload');
    // 60 * (1 - 10/100) = 54, arrotondato a step 2 → 54
    expect(result.updatedExercise.linearCurrentLoad).toBe(54);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
  });

  it('no attempts (all status null) → noop', () => {
    const ex = baseLinear();
    const e = entry({
      actualSets: [{ status: null, reps: 0, load: 0 }]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('noop');
    expect(result.updatedExercise).toEqual(ex);
  });
});

describe('applyEntryResult — wave', () => {
  const allOk = (prescribed: { sets: number; reps: number; load: number }): Entry => ({
    prescribed,
    actualSets: Array.from({ length: prescribed.sets }, () => ({
      status: 'ok' as const,
      reps: prescribed.reps,
      load: prescribed.load
    }))
  });

  const failedEntry = (prescribed: { sets: number; reps: number; load: number }): Entry => ({
    prescribed,
    actualSets: [
      { status: 'ok', reps: prescribed.reps, load: prescribed.load },
      { status: 'fail', reps: prescribed.reps - 2, load: prescribed.load }
    ]
  });

  it('week 1 ok → wave-advance-week to week 2', () => {
    const ex = baseWave({ waveCurrentWeek: 1, cycleFailures: 0 });
    const e = allOk({ sets: 3, reps: 8, load: 100 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-advance-week');
    expect(result.updatedExercise.waveCurrentWeek).toBe(2);
    expect(result.updatedExercise.cycleFailures).toBe(0);
  });

  it('failed week + userAction=repeat → wave-repeat-week, increment cycleFailures', () => {
    const ex = baseWave({ waveCurrentWeek: 2, cycleFailures: 0 });
    const e = failedEntry({ sets: 4, reps: 6, load: 105 });
    const result = applyEntryResult(ex, e, 'repeat', DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-repeat-week');
    expect(result.updatedExercise.waveCurrentWeek).toBe(2);
    expect(result.updatedExercise.cycleFailures).toBe(1);
  });

  it('failed week + userAction=null → wave-advance-week with failed=true', () => {
    const ex = baseWave({ waveCurrentWeek: 2, cycleFailures: 0 });
    const e = failedEntry({ sets: 4, reps: 6, load: 105 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-advance-week');
    if (result.info.kind === 'wave-advance-week') {
      expect(result.info.failed).toBe(true);
    }
    expect(result.updatedExercise.waveCurrentWeek).toBe(3);
    expect(result.updatedExercise.cycleFailures).toBe(1);
  });

  it('end of cycle with cycleFailures=0 → wave-cycle-end normal, increment cycle', () => {
    const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 0 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-cycle-end');
    if (result.info.kind === 'wave-cycle-end') {
      expect(result.info.adjustmentKind).toBe('normal');
      expect(result.info.nextCycle).toBe(2);
      expect(result.info.oldBase).toBe(100);
      expect(result.info.newBase).toBe(100);
    }
    expect(result.updatedExercise.waveCurrentWeek).toBe(1);
    expect(result.updatedExercise.waveCurrentCycle).toBe(2);
  });

  it('end of cycle with cycleFailures=2 (hold threshold) → adjustmentKind=hold, cycle NOT incremented', () => {
    const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 2 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    if (result.info.kind === 'wave-cycle-end') {
      expect(result.info.adjustmentKind).toBe('hold');
    }
    expect(result.updatedExercise.waveCurrentCycle).toBe(1);
  });

  it('end of cycle with cycleFailures=3 (reset threshold) → adjustmentKind=reset, baseLoad reduced', () => {
    const ex = baseWave({ waveBaseLoad: 100, waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 3 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    if (result.info.kind === 'wave-cycle-end') {
      expect(result.info.adjustmentKind).toBe('reset');
    }
    // 100 * (1 - 5/100) = 95
    expect(result.updatedExercise.waveBaseLoad).toBe(95);
  });

  it('end of cycle that triggers deload (cycle 3 with deloadEveryNCycles=3) → pendingDeload=true', () => {
    const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 3, cycleFailures: 0 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    // After increment, cycle becomes 4. (4-1) % 3 == 0 → pendingDeload
    expect(result.updatedExercise.pendingDeload).toBe(true);
    expect(result.updatedExercise.waveCurrentCycle).toBe(4);
  });

  it('completion of deload session → deload-completed, pendingDeload cleared', () => {
    const ex = baseWave({ pendingDeload: true });
    const e: Entry = {
      prescribed: { sets: 2, reps: 6, load: 90, isDeload: true },
      actualSets: [
        { status: 'ok', reps: 6, load: 90 },
        { status: 'ok', reps: 6, load: 90 }
      ]
    };
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('deload-completed');
    expect(result.updatedExercise.pendingDeload).toBe(false);
  });
});

import { effectiveRounding } from './progression';

describe('effectiveRounding', () => {
  it('esercizio wave senza override usa plateRoundingWave', () => {
    expect(effectiveRounding(baseWave(), DEFAULT_SETTINGS)).toBe(2.5);
  });

  it('esercizio linear senza override usa plateRoundingLinear', () => {
    expect(effectiveRounding(baseLinear(), DEFAULT_SETTINGS)).toBe(2);
  });

  it('override per-esercizio ha precedenza sul default dello schema', () => {
    expect(effectiveRounding(baseWave({ plateRounding: 1.25 }), DEFAULT_SETTINGS)).toBe(1.25);
    expect(effectiveRounding(baseLinear({ plateRounding: 5 }), DEFAULT_SETTINGS)).toBe(5);
  });
});

describe('applyEntryResult — arrotondamento override', () => {
  const allOkB1 = (p: { sets: number; reps: number; load: number }): Entry => ({
    prescribed: p,
    actualSets: Array.from({ length: p.sets }, () => ({ status: 'ok' as const, reps: p.reps, load: p.load }))
  });

  it('reset wave usa il rounding override dell esercizio', () => {
    const ex = baseWave({ waveBaseLoad: 100, waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 3, plateRounding: 4 });
    const result = applyEntryResult(ex, allOkB1({ sets: 8, reps: 3, load: 120 }), null, DEFAULT_SETTINGS);
    // 100 * 0.95 = 95, arrotondato a step 4 → 96
    expect(result.updatedExercise.waveBaseLoad).toBe(96);
  });
});
