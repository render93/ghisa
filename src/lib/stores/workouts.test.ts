import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('$lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    rpc: (...a: unknown[]) => rpc(...a)
  }
}));

import { workoutsStore } from '$lib/stores/workouts.svelte';
import type { Exercise } from '$lib/domain/types';

const entry = {
  exerciseId: 'e1',
  position: 0,
  prescribed: { sets: 3, reps: 5, load: 100, barWeight: 20, isDeload: false },
  actualSets: [{ status: 'ok' as const, reps: 5, load: 100 }],
  userAction: null,
  resultInfo: null,
  isDeloadSession: false,
  skipped: false
};

const exUpdate = { id: 'e1', name: 'Panca', scheme: 'linear', restSeconds: 180,
  cycleFailures: 0, pendingDeload: false, linearConsecutiveFailures: 0,
  linearCurrentLoad: 102.5, linearTargetSets: 3, linearTargetReps: 5,
  progressionVersion: 2, waveCycleLoads: [60, 62.5, 65, 67.5, 70] } as Exercise;

beforeEach(() => {
  rpc.mockReset();
  getUser.mockClear();
});

describe('workoutsStore.commit', () => {
  it('invia una sola rpc(commit_workout) con payload corretto e aggiorna lo stato', async () => {
    rpc.mockResolvedValue({
      data: {
        workout: { id: 'w1', skipped: false, note: null },
        entries: [{ id: 'we1', workout_id: 'w1', exercise_id: 'e1', position: 0,
          prescribed: entry.prescribed, actual_sets: entry.actualSets, user_action: null,
          result_info: null, is_deload_session: false, skipped: false }]
      },
      error: null
    });

    const w = await workoutsStore.commit('s1', 'd1', '2026-07-02T10:00:00Z', 3600, [entry], [exUpdate]);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('commit_workout');
    expect(args.p_scheda_id).toBe('s1');
    expect(args.p_entries[0].exercise_id).toBe('e1');
    expect(args.p_entries[0].actual_sets).toEqual(entry.actualSets);
    expect(args.p_exercise_updates[0].linear_current_load).toBe(102.5);
    expect(args.p_exercise_updates[0].progression_version).toBe(2);
    expect(args.p_exercise_updates[0].wave_cycle_loads).toEqual([60, 62.5, 65, 67.5, 70]);
    expect(args.p_exercise_updates[0].user_id).toBe('u1');

    expect(w.id).toBe('w1');
    expect(w.entries[0].id).toBe('we1');
    expect(workoutsStore.items[0]?.id).toBe('w1');
  });

  it('su errore rpc lancia e non modifica lo stato', async () => {
    const before = workoutsStore.items.length;
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      workoutsStore.commit('s1', 'd1', '2026-07-02T10:00:00Z', 3600, [entry], [exUpdate])
    ).rejects.toBeTruthy();

    expect(workoutsStore.items.length).toBe(before);
  });
});
