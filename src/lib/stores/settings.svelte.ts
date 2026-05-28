import { supabase } from '$lib/supabase';
import { DEFAULT_SETTINGS, type Settings } from '$lib/domain/types';

function createSettingsStore() {
  const state = $state<{ data: Settings; loaded: boolean }>({
    data: { ...DEFAULT_SETTINGS },
    loaded: false
  });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('user_settings')
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      state.data = { ...DEFAULT_SETTINGS, ...((data.data || {}) as Partial<Settings>) };
    } else {
      // crea riga vuota al primo login
      await supabase.from('user_settings').insert({ user_id: user.id, data: {} });
      state.data = { ...DEFAULT_SETTINGS };
    }
    state.loaded = true;
  }

  async function update(partial: Partial<Settings>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const prev = { ...state.data };
    state.data = { ...state.data, ...partial };
    const { error } = await supabase
      .from('user_settings')
      .update({ data: state.data, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) {
      state.data = prev;
      throw error;
    }
  }

  return {
    get data() { return state.data; },
    get loaded() { return state.loaded; },
    load,
    update
  };
}

export const settingsStore = createSettingsStore();
