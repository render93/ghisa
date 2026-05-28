import { supabase } from '$lib/supabase';
import type { Exercise } from '$lib/domain/types';
import { DEFAULT_SETTINGS } from '$lib/domain/types';

type DbExercise = {
  id: string;
  user_id: string;
  name: string;
  scheme: 'wave' | 'linear';
  rest_seconds: number;
  wave_base_load: number | null;
  wave_current_week: number | null;
  wave_current_cycle: number | null;
  cycle_failures: number;
  pending_deload: boolean;
  linear_current_load: number | null;
  linear_target_sets: number | null;
  linear_target_reps: number | null;
  linear_consecutive_failures: number;
};

function dbToDomain(row: DbExercise): Exercise {
  return {
    id: row.id,
    name: row.name,
    scheme: row.scheme,
    restSeconds: row.rest_seconds,
    waveBaseLoad: row.wave_base_load ?? undefined,
    waveCurrentWeek: row.wave_current_week ?? undefined,
    waveCurrentCycle: row.wave_current_cycle ?? undefined,
    cycleFailures: row.cycle_failures,
    pendingDeload: row.pending_deload,
    linearCurrentLoad: row.linear_current_load ?? undefined,
    linearTargetSets: row.linear_target_sets ?? undefined,
    linearTargetReps: row.linear_target_reps ?? undefined,
    linearConsecutiveFailures: row.linear_consecutive_failures
  };
}

function domainToDb(ex: Exercise, userId: string): Omit<DbExercise, 'id'> & { id?: string } {
  return {
    ...(ex.id ? { id: ex.id } : {}),
    user_id: userId,
    name: ex.name,
    scheme: ex.scheme,
    rest_seconds: ex.restSeconds,
    wave_base_load: ex.waveBaseLoad ?? null,
    wave_current_week: ex.waveCurrentWeek ?? null,
    wave_current_cycle: ex.waveCurrentCycle ?? null,
    cycle_failures: ex.cycleFailures ?? 0,
    pending_deload: ex.pendingDeload ?? false,
    linear_current_load: ex.linearCurrentLoad ?? null,
    linear_target_sets: ex.linearTargetSets ?? null,
    linear_target_reps: ex.linearTargetReps ?? null,
    linear_consecutive_failures: ex.linearConsecutiveFailures ?? 0
  };
}

function createExercisesStore() {
  const state = $state<{ items: Exercise[]; loaded: boolean }>({ items: [], loaded: false });

  async function load() {
    const { data, error } = await supabase.from('exercises').select('*').order('name');
    if (error) throw error;
    state.items = (data as DbExercise[]).map(dbToDomain);
    state.loaded = true;
  }

  async function create(ex: Omit<Exercise, 'id'>): Promise<Exercise> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const payload = domainToDb(ex as Exercise, user.id);
    delete (payload as { id?: string }).id;
    const { data, error } = await supabase.from('exercises').insert(payload).select().single();
    if (error) throw error;
    const created = dbToDomain(data as DbExercise);
    state.items = [...state.items, created];
    return created;
  }

  async function update(ex: Exercise) {
    // optimistic
    const idx = state.items.findIndex((e) => e.id === ex.id);
    const prev = idx >= 0 ? state.items[idx] : null;
    if (idx >= 0) state.items[idx] = ex;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const payload = domainToDb(ex, user.id);
    const { error } = await supabase.from('exercises').update(payload).eq('id', ex.id);
    if (error) {
      if (prev && idx >= 0) state.items[idx] = prev; // rollback
      throw error;
    }
  }

  async function remove(id: string) {
    const prev = state.items;
    state.items = state.items.filter((e) => e.id !== id);
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) {
      state.items = prev;
      // FK violation: 23503
      if ((error as { code?: string }).code === '23503') {
        throw new Error('Esercizio con sedute storiche associate — non può essere eliminato.');
      }
      throw error;
    }
  }

  function getById(id: string): Exercise | undefined {
    return state.items.find((e) => e.id === id);
  }

  return {
    get items() { return state.items; },
    get loaded() { return state.loaded; },
    load,
    create,
    update,
    remove,
    getById
  };
}

export const exercisesStore = createExercisesStore();
