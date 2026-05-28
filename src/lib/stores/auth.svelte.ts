import { supabase } from '$lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

function createAuthStore() {
  const state = $state<AuthState>({ session: null, user: null, loading: true });

  async function init() {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    state.user = data.session?.user ?? null;
    state.loading = false;

    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      state.user = session?.user ?? null;
    });
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return {
    get session() { return state.session; },
    get user() { return state.user; },
    get loading() { return state.loading; },
    get isAuthenticated() { return state.user !== null; },
    init,
    signInWithMagicLink,
    signOut
  };
}

export const authStore = createAuthStore();
