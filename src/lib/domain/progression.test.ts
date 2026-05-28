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
