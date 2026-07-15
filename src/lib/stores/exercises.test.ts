import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbRow = {
  id: 'e1',
  user_id: 'u1',
  name: 'Panca',
  scheme: 'linear',
  rest_seconds: 180,
  plate_rounding: null,
  bar_weight: null,
  linear_increment_steps: null,
  progression_version: 2,
  wave_base_load: null,
  wave_cycle_loads: [60, 62.5, 65, 67.5, 70],
  wave_current_week: null,
  wave_current_cycle: null,
  cycle_failures: 0,
  pending_deload: false,
  linear_current_load: 100,
  linear_target_sets: 3,
  linear_target_reps: 5,
  linear_consecutive_failures: 0
};

vi.mock('$lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [dbRow], error: null }))
      }))
    }))
  }
}));

import { exercisesStore, domainToDb } from '$lib/stores/exercises.svelte';
import type { Exercise } from '$lib/domain/types';

describe('exercisesStore.applyLocal', () => {
  beforeEach(async () => {
    await exercisesStore.load();
  });

  it('aggiorna in memoria senza round-trip DB', () => {
    expect(exercisesStore.getById('e1')?.linearCurrentLoad).toBe(100);
    const updated: Exercise = { ...exercisesStore.getById('e1')!, linearCurrentLoad: 102.5 };
    exercisesStore.applyLocal([updated]);
    expect(exercisesStore.getById('e1')?.linearCurrentLoad).toBe(102.5);
  });

  it('ignora esercizi non presenti in memoria', () => {
    const ghost: Exercise = { ...exercisesStore.getById('e1')!, id: 'nope' };
    expect(() => exercisesStore.applyLocal([ghost])).not.toThrow();
    expect(exercisesStore.getById('nope')).toBeUndefined();
  });
});

describe('domainToDb', () => {
  beforeEach(async () => {
    await exercisesStore.load();
  });

  it('mappa camelCase → snake_case includendo id e user_id', () => {
    const row = domainToDb(exercisesStore.getById('e1')!, 'u1');
    expect(row.user_id).toBe('u1');
    expect(row.id).toBe('e1');
    expect(row.linear_current_load).toBe(100);
    expect(row.progression_version).toBe(2);
    expect(row.wave_cycle_loads).toEqual([60, 62.5, 65, 67.5, 70]);
  });

  it('copia il piano wave senza condividere l’array col dominio', () => {
    const ex = exercisesStore.getById('e1')!;
    const row = domainToDb(ex, 'u1');

    row.wave_cycle_loads![0] = 999;

    expect(ex.waveCycleLoads).toEqual([60, 62.5, 65, 67.5, 70]);
  });
});

describe('dbToDomain', () => {
  beforeEach(async () => {
    await exercisesStore.load();
  });

  it('mappa versione e piano v2 copiando l’array del record DB', () => {
    const ex = exercisesStore.getById('e1')!;
    expect(ex.progressionVersion).toBe(2);
    expect(ex.waveCycleLoads).toEqual([60, 62.5, 65, 67.5, 70]);

    ex.waveCycleLoads![0] = 999;

    expect(dbRow.wave_cycle_loads).toEqual([60, 62.5, 65, 67.5, 70]);
  });
});
