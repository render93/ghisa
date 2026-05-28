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
  it('all sets ok at target reps → advance load by linearIncrementKg', () => {
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
    expect(result.updatedExercise.linearCurrentLoad).toBe(62.5);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
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
    // 60 * (1 - 10/100) = 54, rounded to 2.5 → 55
    expect(result.updatedExercise.linearCurrentLoad).toBe(55);
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
