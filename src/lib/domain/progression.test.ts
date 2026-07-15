import { describe, it, expect } from 'vitest';
import {
  applyEntryResult,
  buildWavePlan,
  ceilToStep,
  entryStatus,
  ensureProgressionV2,
  floorToStep,
  nextPrescription,
  nextWaveCyclePlan,
  requiredValidSets,
  resolveLinearV2Outcome,
  resolveWaveV2Outcome,
  tryApplyEntryResult,
  tryNextPrescription
} from './progression';
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

  it('keeps the legacy nearest-step rounding for a scheduled v2 deload', () => {
    const p = nextPrescription(baseWave({
      progressionVersion: 2,
      waveCycleLoads: [102.5, 105, 107.5, 110, 112.5],
      plateRounding: 2.5,
      pendingDeload: true
    }), DEFAULT_SETTINGS);
    // 102.5 × 90% = 92.25 → nearest 2.5 kg = 92.5 (not floor 90).
    expect(p.load).toBe(92.5);
  });

  it('rejects invalid wave positions and exposes a recoverable preview error', () => {
    const invalid = baseWave({
      progressionVersion: 2,
      waveCycleLoads: [100, 105, 110, 115, 120],
      waveCurrentWeek: 6,
      waveCurrentCycle: 0
    });
    expect(() => nextPrescription(invalid, DEFAULT_SETTINGS)).toThrow(/waveCurrentWeek/);
    expect(tryNextPrescription(invalid, DEFAULT_SETTINGS)).toMatchObject({
      ok: false,
      error: expect.stringContaining('waveCurrentWeek')
    });
  });

  it('does not silently interpret a corrupted v2 plan as legacy', () => {
    const invalid = baseWave({
      progressionVersion: 2,
      waveCycleLoads: [100, 105]
    });
    expect(tryNextPrescription(invalid, DEFAULT_SETTINGS)).toMatchObject({
      ok: false,
      error: expect.stringContaining('valid five-load plan')
    });
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

import type { Entry } from './types';

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  prescribed: { sets: 3, reps: 8, load: 100 },
  actualSets: [],
  ...overrides
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

describe('applyEntryResult — linear', () => {
  it('all sets ok → successo completo, +2 step', () => {
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
    expect(result.info.kind).toBe('linear-v2-complete');
    expect(result.updatedExercise.linearCurrentLoad).toBe(64);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
  });

  it('regressione bug: load 40, step 5 (override) → 50', () => {
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
    expect(result.info.kind).toBe('linear-v2-complete');
    expect(result.updatedExercise.linearCurrentLoad).toBe(50);
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

  it('incrementa dalla prescrizione anche quando il carico iniziale è fuori griglia', () => {
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
    expect(result.updatedExercise.linearCurrentLoad).toBe(52);
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
    expect(result.info.kind).toBe('linear-v2-repeat');
    expect(result.updatedExercise.linearCurrentLoad).toBe(60);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(1);
  });

  it('two consecutive fails → linear-v2-deload, reset counter', () => {
    const ex = baseLinear({ progressionVersion: 2, linearCurrentLoad: 60, linearConsecutiveFailures: 1 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 60 },
      actualSets: [{ status: 'fail', reps: 5, load: 60 }]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-v2-deload');
    expect(result.updatedExercise.linearCurrentLoad).toBe(56);
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

  it('week 1 ok → wave-v2-advance to week 2', () => {
    const ex = baseWave({ waveCurrentWeek: 1, cycleFailures: 0 });
    const e = allOk({ sets: 3, reps: 8, load: 100 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-advance');
    expect(result.updatedExercise.waveCurrentWeek).toBe(2);
    expect(result.updatedExercise.cycleFailures).toBe(0);
  });

  it('failed week repeats reduced automatically and ignores userAction=repeat', () => {
    const ex = baseWave({ waveCurrentWeek: 2, cycleFailures: 0 });
    const e = failedEntry({ sets: 4, reps: 6, load: 105 });
    const result = applyEntryResult(ex, e, 'repeat', DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-repeat-reduced');
    expect(result.updatedExercise.waveCurrentWeek).toBe(2);
    expect(result.updatedExercise.cycleFailures).toBe(0);
  });

  it('failed week + userAction=null repeats reduced automatically', () => {
    const ex = baseWave({ waveCurrentWeek: 2, cycleFailures: 0 });
    const e = failedEntry({ sets: 4, reps: 6, load: 105 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-repeat-reduced');
    expect(result.updatedExercise.waveCurrentWeek).toBe(2);
    expect(result.updatedExercise.cycleFailures).toBe(0);
  });

  it('end of cycle → wave-v2-cycle-end and increment cycle', () => {
    const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 0 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-cycle-end');
    expect(result.updatedExercise.waveCurrentWeek).toBe(1);
    expect(result.updatedExercise.waveCurrentCycle).toBe(2);
  });

  it('v2 ignores the legacy hold threshold', () => {
    const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 2 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-cycle-end');
    expect(result.updatedExercise.waveCurrentCycle).toBe(2);
  });

  it('v2 ignores the legacy reset threshold and keeps waveBaseLoad inert', () => {
    const ex = baseWave({ waveBaseLoad: 100, waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 3 });
    const e = allOk({ sets: 8, reps: 3, load: 120 });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-cycle-end');
    expect(result.updatedExercise.waveBaseLoad).toBe(100);
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
    expect(result.updatedExercise).toMatchObject({
      progressionVersion: 2,
      waveCycleLoads: [100, 102.5, 105, 107.5, 110]
    });
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

describe('nextPrescription — barWeight pass-through', () => {
  it('wave: barWeight passa intatto e non cambia il carico dischi', () => {
    const noBar = nextPrescription(baseWave(), DEFAULT_SETTINGS);
    const withBar = nextPrescription(baseWave({ barWeight: 20 }), DEFAULT_SETTINGS);
    expect(withBar.load).toBe(noBar.load);
    expect(withBar.barWeight).toBe(20);
  });

  it('linear: barWeight passa intatto e non cambia il carico dischi', () => {
    const noBar = nextPrescription(baseLinear(), DEFAULT_SETTINGS);
    const withBar = nextPrescription(baseLinear({ barWeight: 20 }), DEFAULT_SETTINGS);
    expect(withBar.load).toBe(noBar.load);
    expect(withBar.barWeight).toBe(20);
  });

  it('barWeight default 0 quando l esercizio non lo ha', () => {
    expect(nextPrescription(baseWave(), DEFAULT_SETTINGS).barWeight).toBe(0);
    expect(nextPrescription(baseLinear(), DEFAULT_SETTINGS).barWeight).toBe(0);
  });
});

describe('applyEntryResult — legacy reset settings inert in v2', () => {
  const allOkB1 = (p: { sets: number; reps: number; load: number }): Entry => ({
    prescribed: p,
    actualSets: Array.from({ length: p.sets }, () => ({ status: 'ok' as const, reps: p.reps, load: p.load }))
  });

  it('non modifica waveBaseLoad anche oltre la vecchia soglia', () => {
    const ex = baseWave({ waveBaseLoad: 100, waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 3, plateRounding: 4 });
    const result = applyEntryResult(ex, allOkB1({ sets: 8, reps: 3, load: 120 }), null, DEFAULT_SETTINGS);
    expect(result.updatedExercise.waveBaseLoad).toBe(100);
  });
});

describe('DEFAULT_SETTINGS — nuove soglie lineari', () => {
  it('espone linearLoadShiftPct=25 e linearFailThreshold=2', () => {
    expect(DEFAULT_SETTINGS.linearLoadShiftPct).toBe(25);
    expect(DEFAULT_SETTINGS.linearFailThreshold).toBe(2);
  });
});

describe('applyEntryResult — linear v2 non consolida carichi sotto prescrizione', () => {
  const exL = (o = {}) => baseLinear({ linearCurrentLoad: 10, linearTargetReps: 12, linearTargetSets: 4, ...o });

  it('serie sotto carico non sono valide e producono hold', () => {
    const e = entry({ prescribed: { sets: 4, reps: 12, load: 10 }, actualSets: [
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 8 }, { status: 'ok', reps: 12, load: 8 }
    ]});
    const r = applyEntryResult(exL(), e, null, DEFAULT_SETTINGS);
    expect(r.info.kind).toBe('linear-v2-repeat');
    expect(r.updatedExercise.linearCurrentLoad).toBe(10);
    expect(r.updatedExercise.linearConsecutiveFailures).toBe(1);
  });

  it('carichi sopra prescrizione validi non cambiano la base dell incremento', () => {
    const e = entry({ prescribed: { sets: 4, reps: 12, load: 10 }, actualSets: [
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 12 }, { status: 'ok', reps: 12, load: 12 }
    ]});
    const r = applyEntryResult(exL(), e, null, DEFAULT_SETTINGS);
    expect(r.info.kind).toBe('linear-v2-complete');
    expect(r.updatedExercise.linearCurrentLoad).toBe(14);
  });

});

describe('progression v2 — contracts and bootstrap', () => {
  it('uses the 2% wave default without adding a configurable failure threshold', () => {
    expect(DEFAULT_SETTINGS.waveCycleIncrementPct).toBe(2);
    expect('progressionFailurePct' in DEFAULT_SETTINGS).toBe(false);
  });

  it('bootstraps a legacy wave around its unchanged current prescription', () => {
    const legacy = baseWave({
      waveBaseLoad: 60,
      waveCurrentWeek: 4,
      plateRounding: 2.5,
      progressionVersion: undefined,
      waveCycleLoads: undefined
    });
    const before = nextPrescription(legacy, DEFAULT_SETTINGS);
    const bootstrapped = ensureProgressionV2(legacy, DEFAULT_SETTINGS);

    expect(bootstrapped.progressionVersion).toBe(2);
    expect(bootstrapped.waveCycleLoads).toEqual([62.5, 65, 67.5, 70, 72.5]);
    expect(nextPrescription(bootstrapped, DEFAULT_SETTINGS).load).toBe(before.load);
    expect(ensureProgressionV2(bootstrapped, DEFAULT_SETTINGS)).toEqual(bootstrapped);
  });

  it('cuts linear over to v2 without changing load/targets and resets legacy failures', () => {
    const legacy = baseLinear({ linearConsecutiveFailures: 1 });
    const converted = ensureProgressionV2(legacy, DEFAULT_SETTINGS);
    expect(converted).toMatchObject({
      progressionVersion: 2,
      linearCurrentLoad: 60,
      linearTargetSets: 3,
      linearTargetReps: 8,
      linearConsecutiveFailures: 0
    });
    expect(ensureProgressionV2(converted, DEFAULT_SETTINGS)).toEqual(converted);
  });

  it('preserves the next legacy deload prescription during bootstrap', () => {
    const legacy = baseWave({ waveCurrentWeek: 1, pendingDeload: true });
    const before = nextPrescription(legacy, DEFAULT_SETTINGS);
    const converted = ensureProgressionV2(legacy, DEFAULT_SETTINGS);
    expect(nextPrescription(converted, DEFAULT_SETTINGS).load).toBe(before.load);
    expect(converted.waveCycleLoads).toEqual([100, 102.5, 105, 107.5, 110]);
  });
});

describe('progression v2 — wave plan math', () => {
  it.each([
    [61.2, 2, 62, 60],
    [63.75, 2.5, 65, 62.5],
    [30.75, 5, 35, 30],
    [62.5, 2.5, 62.5, 62.5]
  ])('quantizes %s to step %s', (value, step, ceil, floor) => {
    expect(ceilToStep(value, step)).toBe(ceil);
    expect(floorToStep(value, step)).toBe(floor);
  });

  it('rejects a non-positive step', () => {
    expect(() => ceilToStep(10, 0)).toThrow();
    expect(() => floorToStep(10, -2)).toThrow();
  });

  it.each([
    [30, 1, 5, [30, 35, 40, 45, 50]],
    [45, 4, 5, [30, 35, 40, 45, 50]],
    [45, 4, 2.5, [37.5, 40, 42.5, 45, 47.5]]
  ])('builds an anchored plan', (anchor, week, step, expected) => {
    expect(buildWavePlan(anchor, week, step)).toEqual(expected);
  });

  it.each([
    [[60, 62.5, 65, 67.5, 70], 20, 2.5, [62.5, 65, 67.5, 70, 72.5]],
    [[14, 16, 18, 20, 22], 0, 2, [16, 18, 20, 22, 24]],
    [[50, 55, 60, 65, 70], 20, 5, [55, 60, 65, 70, 75]],
    [[60, 65, 70, 75, 80], 20, 5, [65, 70, 75, 80, 85]]
  ])('generates a strictly loadable next cycle', (plan, bar, step, expected) => {
    const original = [...plan];
    expect(nextWaveCyclePlan(plan, bar, step, 2)).toEqual(expected);
    expect(plan).toEqual(original);
  });

  it('still advances a zero-based plan when the percentage increment is positive', () => {
    expect(nextWaveCyclePlan([0, 2, 4, 6, 8], 0, 2, 2)).toEqual([2, 4, 6, 8, 10]);
  });

  it.each([
    ['Rematore T-bar', 40, 20, 2.5, [60, 62.5, 65, 67.5, 70], [62.5, 65, 67.5, 70, 72.5]],
    ['Spinte manubri', 14, 0, 2, [14, 16, 18, 20, 22], [16, 18, 20, 22, 24]],
    ['Squat bilanciere', 30, 20, 5, [50, 55, 60, 65, 70], [55, 60, 65, 70, 75]],
    ['Stacco rumeno', 40, 20, 5, [60, 65, 70, 75, 80], [65, 70, 75, 80, 85]]
  ])('produce piani caricabili sui dati reali: %s', (_name, baseLoad, bar, step, currentTotals, nextTotals) => {
    const currentPlateLoads = buildWavePlan(baseLoad as number, 1, step as number);
    const nextPlateLoads = nextWaveCyclePlan(currentPlateLoads, bar as number, step as number, 2);

    expect(currentPlateLoads.map((load) => load + (bar as number))).toEqual(currentTotals);
    expect(nextPlateLoads.map((load) => load + (bar as number))).toEqual(nextTotals);
  });
});

describe('progression v2 — wave outcomes', () => {
  const wave = (overrides: Partial<Exercise> = {}) => baseWave({
    progressionVersion: 2,
    waveCurrentWeek: 3,
    waveCurrentCycle: 1,
    waveCycleLoads: [60, 65, 70, 75, 80],
    plateRounding: 5,
    ...overrides
  });
  const waveEntry = (actualSets: Entry['actualSets'], overrides: Partial<Entry['prescribed']> = {}): Entry => ({
    prescribed: { sets: 5, reps: 5, load: 70, week: 3, cycle: 1, algorithmVersion: 2, ...overrides },
    actualSets
  });
  const ok = (load: number, reps = 5) => ({ status: 'ok' as const, reps, load });

  it.each([[3, 3], [4, 3], [5, 4], [6, 5], [8, 6]])(
    'requires ceil(75%%) for %s sets', (sets, required) => {
      expect(requiredValidSets(sets)).toBe(required);
    }
  );

  it('advances unchanged at the prescribed consolidated load', () => {
    const outcome = resolveWaveV2Outcome(wave(), waveEntry([ok(70), ok(70), ok(70), ok(70), ok(65)]), DEFAULT_SETTINGS);
    expect(outcome).toEqual({
      kind: 'advance', consolidatedLoad: 70, requiredSets: 4, validSets: 5,
      newPlan: [60, 65, 70, 75, 80]
    });
  });

  it('rebases current and future weeks to the supported consolidated load', () => {
    const outcome = resolveWaveV2Outcome(wave(), waveEntry([ok(70), ok(70), ok(70), ok(65), ok(65)]), DEFAULT_SETTINGS);
    expect(outcome).toEqual({
      kind: 'rebase-advance', consolidatedLoad: 65, requiredSets: 4, validSets: 5,
      newPlan: [60, 65, 65, 70, 75]
    });
  });

  it('excludes low-rep and failed sets, then repeats reduced at the predominant lower load', () => {
    const outcome = resolveWaveV2Outcome(wave(), waveEntry([
      ok(70), ok(65), ok(65), ok(70, 4), { status: 'fail', reps: 8, load: 70 }
    ]), DEFAULT_SETTINGS);
    expect(outcome).toEqual({
      kind: 'repeat-reduced', reducedLoad: 65, requiredSets: 4, validSets: 3,
      newPlan: [60, 65, 65, 70, 75]
    });
  });

  it('uses the lower load to break a predominant-load tie and floors off-grid loads', () => {
    const outcome = resolveWaveV2Outcome(wave(), waveEntry([
      ok(68), ok(68), { status: 'fail', reps: 3, load: 63 }, { status: 'fail', reps: 3, load: 63 }
    ]), DEFAULT_SETTINGS);
    expect(outcome.kind).toBe('repeat-reduced');
    if (outcome.kind === 'repeat-reduced') expect(outcome.reducedLoad).toBe(60);
  });

  it('reduces by at least one step when every attempted load equals the prescription', () => {
    const outcome = resolveWaveV2Outcome(wave(), waveEntry([
      ok(70), ok(70), { status: 'fail', reps: 4, load: 70 },
      { status: 'fail', reps: 4, load: 70 }, { status: 'fail', reps: 4, load: 70 }
    ]), DEFAULT_SETTINGS);
    expect(outcome).toMatchObject({ kind: 'repeat-reduced', reducedLoad: 65 });
  });

  it('rebases upward without rewriting completed weeks', () => {
    const outcome = resolveWaveV2Outcome(wave(), waveEntry([
      ok(75), ok(75), ok(75), ok(75), ok(70)
    ]), DEFAULT_SETTINGS);
    expect(outcome).toMatchObject({
      kind: 'rebase-advance', consolidatedLoad: 75,
      newPlan: [60, 65, 75, 80, 85]
    });
  });

  it('ignores extra sets even when they would change the predominant attempted load', () => {
    const outcome = resolveWaveV2Outcome(
      wave({ waveCurrentWeek: 2 }),
      waveEntry([
        ok(65, 6), ok(65, 6),
        { status: 'fail', reps: 4, load: 65 }, { status: 'fail', reps: 4, load: 60 },
        ok(50, 6), ok(50, 6), ok(50, 6), ok(50, 6)
      ], {
        sets: 4, reps: 6, load: 65, week: 2
      }),
      DEFAULT_SETTINGS
    );
    expect(outcome).toMatchObject({
      kind: 'repeat-reduced', validSets: 2, reducedLoad: 60
    });
  });
});

describe('progression v2 — prescriptions and apply', () => {
  it('prescribes from the authoritative wave plan and deloads that value', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 2, waveCurrentCycle: 4,
      waveCycleLoads: [50, 55, 60, 65, 70], pendingDeload: true, plateRounding: 5
    });
    expect(nextPrescription(ex, DEFAULT_SETTINGS)).toMatchObject({
      sets: 2, reps: 5, load: 50, week: 2, cycle: 4, algorithmVersion: 2, isDeload: true
    });
  });

  it('automatically rebases and advances, ignoring the legacy user action', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 3, waveCurrentCycle: 1,
      waveCycleLoads: [60, 65, 70, 75, 80], plateRounding: 5
    });
    const e: Entry = {
      prescribed: { sets: 5, reps: 5, load: 70, week: 3, cycle: 1, algorithmVersion: 2 },
      actualSets: [65, 65, 65, 65, 65].map((load) => ({ status: 'ok', reps: 5, load }))
    };
    const result = applyEntryResult(ex, e, 'repeat', DEFAULT_SETTINGS);
    expect(result.updatedExercise).toMatchObject({ waveCurrentWeek: 4, waveCycleLoads: [60, 65, 65, 70, 75] });
    expect(result.info).toMatchObject({
      kind: 'wave-v2-rebase-advance', algorithmVersion: 2,
      completedWeek: 3, prescribedLoad: 70, consolidatedLoad: 65
    });
  });

  it('ends W5 with a +2% next plan and increments the cycle', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 5, waveCurrentCycle: 1,
      waveCycleLoads: [60, 65, 70, 75, 80], plateRounding: 5, barWeight: 20
    });
    const e: Entry = {
      prescribed: { sets: 8, reps: 3, load: 80, barWeight: 20, week: 5, cycle: 1, algorithmVersion: 2 },
      actualSets: Array.from({ length: 8 }, () => ({ status: 'ok', reps: 3, load: 80 }))
    };
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.updatedExercise).toMatchObject({
      waveCurrentWeek: 1, waveCurrentCycle: 2, waveCycleLoads: [65, 70, 75, 80, 85]
    });
    expect(result.info).toMatchObject({
      kind: 'wave-v2-cycle-end', algorithmVersion: 2, completedCycle: 1,
      adjustmentKind: 'advance', prescribedLoad: 80, consolidatedLoad: 80,
      requiredSets: 6, validSets: 8,
      oldPlan: [60, 65, 70, 75, 80], completedPlan: [60, 65, 70, 75, 80],
      nextPlan: [65, 70, 75, 80, 85]
    });
  });

  it('stores the completed rebased W5 plan before generating the next cycle', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 5, waveCurrentCycle: 1,
      waveCycleLoads: [60, 65, 70, 75, 80], plateRounding: 5, barWeight: 20
    });
    const e: Entry = {
      prescribed: { sets: 8, reps: 3, load: 80, barWeight: 20, week: 5, cycle: 1, algorithmVersion: 2 },
      actualSets: [80, 80, 75, 75, 75, 75, 75, 75].map((load) => ({ status: 'ok', reps: 3, load }))
    };
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info).toMatchObject({
      kind: 'wave-v2-cycle-end', adjustmentKind: 'rebase',
      prescribedLoad: 80, consolidatedLoad: 75, requiredSets: 6, validSets: 8,
      oldPlan: [60, 65, 70, 75, 80], completedPlan: [60, 65, 70, 75, 75],
      nextPlan: [65, 70, 75, 80, 85]
    });
  });

  it('fails closed when the saved prescription does not match the current wave position', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 3, waveCurrentCycle: 2,
      waveCycleLoads: [60, 65, 70, 75, 80], plateRounding: 5
    });
    const e: Entry = {
      prescribed: { sets: 5, reps: 5, load: 70, week: 2, cycle: 1, algorithmVersion: 2 },
      actualSets: [{ status: 'ok', reps: 5, load: 70 }]
    };
    expect(tryApplyEntryResult(ex, e, null, DEFAULT_SETTINGS)).toMatchObject({
      ok: false,
      error: expect.stringContaining('prescribed week')
    });
  });

  it('also rejects a cycle mismatch independently of the week', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 3, waveCurrentCycle: 2,
      waveCycleLoads: [60, 65, 70, 75, 80], plateRounding: 5
    });
    const e: Entry = {
      prescribed: { sets: 5, reps: 5, load: 70, week: 3, cycle: 1, algorithmVersion: 2 },
      actualSets: [{ status: 'ok', reps: 5, load: 70 }]
    };
    expect(tryApplyEntryResult(ex, e, null, DEFAULT_SETTINGS)).toMatchObject({
      ok: false,
      error: expect.stringContaining('prescribed cycle')
    });
  });

  it('does not end the cycle when W5 fails', () => {
    const ex = baseWave({
      progressionVersion: 2, waveCurrentWeek: 5, waveCurrentCycle: 2,
      waveCycleLoads: [60, 65, 70, 75, 80], plateRounding: 5
    });
    const e: Entry = {
      prescribed: { sets: 8, reps: 3, load: 80, week: 5, cycle: 2, algorithmVersion: 2 },
      actualSets: Array.from({ length: 5 }, () => ({ status: 'ok', reps: 3, load: 80 }))
    };
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('wave-v2-repeat-reduced');
    expect(result.updatedExercise).toMatchObject({ waveCurrentWeek: 5, waveCurrentCycle: 2 });
  });
});

describe('progression v2 — linear outcomes', () => {
  const linear = (overrides: Partial<Exercise> = {}) => baseLinear({
    progressionVersion: 2, linearTargetSets: 4, linearTargetReps: 8,
    linearCurrentLoad: 60, plateRounding: 2, ...overrides
  });
  const linearEntry = (sets: Entry['actualSets'], overrides: Partial<Entry['prescribed']> = {}): Entry => ({
    prescribed: { sets: 4, reps: 8, load: 60, algorithmVersion: 2, ...overrides }, actualSets: sets
  });
  const ok = (load = 60, reps = 8) => ({ status: 'ok' as const, reps, load });
  const fail = (load = 60, reps = 7) => ({ status: 'fail' as const, reps, load });

  it('requires status, reps, and prescribed load for a valid set', () => {
    const outcome = resolveLinearV2Outcome(linear(), linearEntry([
      ok(), ok(62), ok(58), ok(60, 7)
    ]), DEFAULT_SETTINGS);
    expect(outcome).toMatchObject({ kind: 'failure-hold', requiredSets: 3, validSets: 2, newLoad: 60, newConsecutiveFailures: 1 });
  });

  it('adds two steps for a complete success', () => {
    expect(resolveLinearV2Outcome(linear(), linearEntry([ok(), ok(), ok(), ok()]), DEFAULT_SETTINGS)).toMatchObject({
      kind: 'complete-success', validSets: 4, newLoad: 64, incrementApplied: 4, newConsecutiveFailures: 0
    });
  });

  it('adds one step when exactly 25% of sets are invalid', () => {
    expect(resolveLinearV2Outcome(linear(), linearEntry([ok(), ok(), ok(), fail()]), DEFAULT_SETTINGS)).toMatchObject({
      kind: 'tolerated-success', validSets: 3, requiredSets: 3, newLoad: 62, incrementApplied: 2
    });
  });

  it('holds on first failure and applies total-load -5% on the second', () => {
    const failed = linearEntry([ok(), ok(), fail(), fail()]);
    expect(resolveLinearV2Outcome(linear(), failed, DEFAULT_SETTINGS)).toMatchObject({
      kind: 'failure-hold', newLoad: 60, newConsecutiveFailures: 1
    });
    expect(resolveLinearV2Outcome(linear({ linearConsecutiveFailures: 1, barWeight: 20 }), failed, DEFAULT_SETTINGS)).toMatchObject({
      kind: 'failure-deload', newLoad: 56, newConsecutiveFailures: 0
    });
  });

  it('guarantees at least one step of reduction and never goes below zero', () => {
    expect(resolveLinearV2Outcome(
      linear({ linearCurrentLoad: 2, plateRounding: 2, barWeight: 20, linearConsecutiveFailures: 1 }),
      linearEntry([fail(2), fail(2), fail(2), fail(2)], { load: 2, barWeight: 20 }),
      DEFAULT_SETTINGS
    )).toMatchObject({ kind: 'failure-deload', newLoad: 0 });
  });

  it('applyEntryResult persists the v2 outcome snapshot', () => {
    const result = applyEntryResult(linear(), linearEntry([ok(), ok(), ok(), fail()]), null, DEFAULT_SETTINGS);
    expect(result.updatedExercise).toMatchObject({ linearCurrentLoad: 62, linearConsecutiveFailures: 0 });
    expect(result.info).toMatchObject({
      kind: 'linear-v2-tolerated', algorithmVersion: 2,
      requiredSets: 3, validSets: 3, oldLoad: 60, newLoad: 62, incrementApplied: 2
    });
  });
});
