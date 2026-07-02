import { supabase } from '$lib/supabase';
import { domainToDb } from '$lib/stores/exercises.svelte';
import type { Entry, Exercise, ProgressionResult } from '$lib/domain/types';
import type { Json } from '$lib/database.types';

export type WorkoutEntryRecord = {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  prescribed: Entry['prescribed'];
  actualSets: Entry['actualSets'];
  userAction: 'repeat' | null;
  resultInfo: ProgressionResult | null;
  isDeloadSession: boolean;
  skipped: boolean;
};

export type Workout = {
  id: string;
  schedaId: string | null;
  dayId: string | null;
  performedAt: string;
  durationSec: number | null;
  skipped: boolean;
  note: string | null;
  entries: WorkoutEntryRecord[];
};

function dbRowToEntry(e: Record<string, unknown>): WorkoutEntryRecord {
  return {
    id: e.id as string,
    workoutId: e.workout_id as string,
    exerciseId: e.exercise_id as string,
    position: e.position as number,
    prescribed: e.prescribed as Entry['prescribed'],
    actualSets: e.actual_sets as Entry['actualSets'],
    userAction: e.user_action as 'repeat' | null,
    resultInfo: e.result_info as ProgressionResult | null,
    isDeloadSession: e.is_deload_session as boolean,
    skipped: e.skipped as boolean
  };
}

function createWorkoutsStore() {
  const state = $state<{ items: Workout[]; loaded: boolean }>({ items: [], loaded: false });

  async function load() {
    const [{ data: workouts, error: e1 }, { data: entries, error: e2 }] = await Promise.all([
      supabase.from('workouts').select('*').order('performed_at', { ascending: false }),
      supabase.from('workout_entries').select('*').order('position')
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const entriesByWorkout = new Map<string, WorkoutEntryRecord[]>();
    for (const e of entries || []) {
      const rec = dbRowToEntry(e as Record<string, unknown>);
      if (!entriesByWorkout.has(rec.workoutId)) entriesByWorkout.set(rec.workoutId, []);
      entriesByWorkout.get(rec.workoutId)!.push(rec);
    }

    state.items = (workouts || []).map((w) => ({
      id: w.id as string,
      schedaId: w.scheda_id as string | null,
      dayId: w.day_id as string | null,
      performedAt: w.performed_at as string,
      durationSec: (w.duration_sec as number | null) ?? null,
      skipped: w.skipped as boolean,
      note: w.note as string | null,
      entries: entriesByWorkout.get(w.id as string) || []
    }));
    state.loaded = true;
  }

  async function commit(
    schedaId: string | null,
    dayId: string | null,
    performedAt: string,
    durationSec: number,
    entries: Omit<WorkoutEntryRecord, 'id' | 'workoutId'>[],
    exerciseUpdates: Exercise[]
  ): Promise<Workout> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const p_entries = entries.map((e, i) => ({
      exercise_id: e.exerciseId,
      position: i,
      prescribed: e.prescribed,
      actual_sets: e.actualSets,
      user_action: e.userAction,
      result_info: e.resultInfo,
      is_deload_session: e.isDeloadSession,
      skipped: e.skipped
    }));
    const p_exercise_updates = exerciseUpdates.map((ex) => domainToDb(ex, user.id));

    const { data, error } = await supabase.rpc('commit_workout', {
      // schedaId/dayId are legitimately nullable (uuid columns accept NULL);
      // the generated RPC Args type can't express param nullability, so
      // narrow here — this is a type-only cast, Postgres accepts NULL as-is.
      p_scheda_id: schedaId as string,
      p_day_id: dayId as string,
      p_performed_at: performedAt,
      p_duration_sec: durationSec,
      p_entries: p_entries as unknown as Json,
      p_exercise_updates: p_exercise_updates as unknown as Json
    });
    if (error) throw error;

    const payload = data as { workout: Record<string, unknown>; entries: Record<string, unknown>[] };
    const w = payload.workout;
    const newWorkout: Workout = {
      id: w.id as string,
      schedaId,
      dayId,
      performedAt,
      durationSec,
      skipped: (w.skipped as boolean) ?? false,
      note: (w.note as string | null) ?? null,
      entries: (payload.entries || []).map(dbRowToEntry)
    };
    state.items = [newWorkout, ...state.items];
    return newWorkout;
  }

  async function commitSkip(
    schedaId: string | null,
    dayId: string | null,
    performedAt: string,
    note: string | null
  ): Promise<Workout> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        scheda_id: schedaId,
        day_id: dayId,
        performed_at: performedAt,
        skipped: true,
        note
      })
      .select()
      .single();
    if (error) throw error;

    const newWorkout: Workout = {
      id: workout.id as string,
      schedaId,
      dayId,
      performedAt,
      durationSec: null,
      skipped: true,
      note,
      entries: []
    };
    state.items = [newWorkout, ...state.items];
    return newWorkout;
  }

  function getById(id: string): Workout | undefined {
    return state.items.find((w) => w.id === id);
  }

  return {
    get items() { return state.items; },
    get loaded() { return state.loaded; },
    load,
    commit,
    commitSkip,
    getById
  };
}

export const workoutsStore = createWorkoutsStore();
