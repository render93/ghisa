import { supabase } from '$lib/supabase';

export type Scheda = {
  id: string;
  name: string;
  position: number;
  days: SchedaDay[];
};

export type SchedaDay = {
  id: string;
  schedaId: string;
  name: string;
  position: number;
  exerciseIds: string[];
};

function createSchedeStore() {
  const state = $state<{ items: Scheda[]; loaded: boolean }>({ items: [], loaded: false });

  async function load() {
    const [{ data: schede, error: e1 }, { data: days, error: e2 }] = await Promise.all([
      supabase.from('schede').select('*').order('position'),
      supabase.from('scheda_days').select('*').order('position')
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const daysByScheda = new Map<string, SchedaDay[]>();
    for (const d of days || []) {
      const day: SchedaDay = {
        id: d.id as string,
        schedaId: d.scheda_id as string,
        name: d.name as string,
        position: d.position as number,
        exerciseIds: (d.exercise_ids as string[]) || []
      };
      if (!daysByScheda.has(day.schedaId)) daysByScheda.set(day.schedaId, []);
      daysByScheda.get(day.schedaId)!.push(day);
    }

    state.items = (schede || []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      position: s.position as number,
      days: daysByScheda.get(s.id as string) || []
    }));
    state.loaded = true;
  }

  async function createScheda(name: string): Promise<Scheda> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const pos = state.items.length;
    const { data, error } = await supabase
      .from('schede')
      .insert({ user_id: user.id, name, position: pos })
      .select()
      .single();
    if (error) throw error;
    const scheda: Scheda = {
      id: data.id as string,
      name: data.name as string,
      position: data.position as number,
      days: []
    };
    state.items = [...state.items, scheda];
    return scheda;
  }

  async function renameScheda(id: string, name: string) {
    const idx = state.items.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const prev = state.items[idx].name;
    state.items[idx].name = name;
    const { error } = await supabase.from('schede').update({ name }).eq('id', id);
    if (error) {
      state.items[idx].name = prev;
      throw error;
    }
  }

  async function deleteScheda(id: string) {
    const prev = state.items;
    state.items = state.items.filter((s) => s.id !== id);
    const { error } = await supabase.from('schede').delete().eq('id', id);
    if (error) {
      state.items = prev;
      throw error;
    }
  }

  async function addDay(schedaId: string, name: string): Promise<SchedaDay> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const scheda = state.items.find((s) => s.id === schedaId);
    if (!scheda) throw new Error('Scheda not found');
    const pos = scheda.days.length;
    const { data, error } = await supabase
      .from('scheda_days')
      .insert({ user_id: user.id, scheda_id: schedaId, name, position: pos, exercise_ids: [] })
      .select()
      .single();
    if (error) throw error;
    const day: SchedaDay = {
      id: data.id as string,
      schedaId,
      name: data.name as string,
      position: data.position as number,
      exerciseIds: []
    };
    scheda.days = [...scheda.days, day];
    return day;
  }

  async function renameDay(schedaId: string, dayId: string, name: string) {
    const scheda = state.items.find((s) => s.id === schedaId);
    if (!scheda) return;
    const dayIdx = scheda.days.findIndex((d) => d.id === dayId);
    if (dayIdx < 0) return;
    const prev = scheda.days[dayIdx].name;
    scheda.days[dayIdx].name = name;
    const { error } = await supabase.from('scheda_days').update({ name }).eq('id', dayId);
    if (error) {
      scheda.days[dayIdx].name = prev;
      throw error;
    }
  }

  async function deleteDay(schedaId: string, dayId: string) {
    const scheda = state.items.find((s) => s.id === schedaId);
    if (!scheda) return;
    const prev = scheda.days;
    scheda.days = scheda.days.filter((d) => d.id !== dayId);
    const { error } = await supabase.from('scheda_days').delete().eq('id', dayId);
    if (error) {
      scheda.days = prev;
      throw error;
    }
  }

  async function setDayExercises(schedaId: string, dayId: string, exerciseIds: string[]) {
    const scheda = state.items.find((s) => s.id === schedaId);
    if (!scheda) return;
    const dayIdx = scheda.days.findIndex((d) => d.id === dayId);
    if (dayIdx < 0) return;
    const prev = scheda.days[dayIdx].exerciseIds;
    scheda.days[dayIdx].exerciseIds = exerciseIds;
    const { error } = await supabase
      .from('scheda_days')
      .update({ exercise_ids: exerciseIds })
      .eq('id', dayId);
    if (error) {
      scheda.days[dayIdx].exerciseIds = prev;
      throw error;
    }
  }

  function getById(id: string): Scheda | undefined {
    return state.items.find((s) => s.id === id);
  }

  function getDay(schedaId: string, dayId: string): SchedaDay | undefined {
    return getById(schedaId)?.days.find((d) => d.id === dayId);
  }

  return {
    get items() { return state.items; },
    get loaded() { return state.loaded; },
    load,
    createScheda,
    renameScheda,
    deleteScheda,
    addDay,
    renameDay,
    deleteDay,
    setDayExercises,
    getById,
    getDay
  };
}

export const schedeStore = createSchedeStore();
