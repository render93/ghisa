-- Ghisa — progressione v2: piano wave persistito e commit atomico
-- 2026-07-15

alter table exercises
  add column if not exists progression_version integer not null default 1;

alter table exercises
  add column if not exists wave_cycle_loads numeric[];

-- L'incremento v2 e' il 2% anche per gli utenti che avevano gia' salvato
-- esplicitamente il precedente default. jsonb_set preserva tutte le altre chiavi.
update user_settings
set data = jsonb_set(data, '{waveCycleIncrementPct}', '2'::jsonb, true),
    updated_at = now();

-- Mantiene in un'unica transazione seduta, entries e stato di progressione.
-- SECURITY INVOKER e' il default: le policy RLS dell'utente restano applicate.
create or replace function commit_workout(
  p_scheda_id uuid,
  p_day_id uuid,
  p_performed_at timestamptz,
  p_duration_sec int,
  p_entries jsonb,
  p_exercise_updates jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_workout workouts;
  v_entries jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into workouts (user_id, scheda_id, day_id, performed_at, duration_sec)
  values (v_uid, p_scheda_id, p_day_id, p_performed_at, p_duration_sec)
  returning * into v_workout;

  with ins as (
    insert into workout_entries (
      workout_id, user_id, exercise_id, position,
      prescribed, actual_sets, user_action, result_info,
      is_deload_session, skipped
    )
    select
      v_workout.id,
      v_uid,
      (e->>'exercise_id')::uuid,
      (e->>'position')::int,
      e->'prescribed',
      e->'actual_sets',
      e->>'user_action',
      e->'result_info',
      coalesce((e->>'is_deload_session')::boolean, false),
      coalesce((e->>'skipped')::boolean, false)
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_entries from ins;

  update exercises ex set
    progression_version = coalesce(u.progression_version, ex.progression_version),
    wave_cycle_loads = coalesce(u.wave_cycle_loads, ex.wave_cycle_loads),
    wave_base_load = u.wave_base_load,
    wave_current_week = u.wave_current_week,
    wave_current_cycle = u.wave_current_cycle,
    cycle_failures = u.cycle_failures,
    pending_deload = u.pending_deload,
    linear_current_load = u.linear_current_load,
    linear_target_sets = u.linear_target_sets,
    linear_target_reps = u.linear_target_reps,
    linear_consecutive_failures = u.linear_consecutive_failures,
    updated_at = now()
  from jsonb_populate_recordset(null::exercises, coalesce(p_exercise_updates, '[]'::jsonb)) as u
  where ex.id = u.id and ex.user_id = v_uid;

  return jsonb_build_object('workout', to_jsonb(v_workout), 'entries', v_entries);
end;
$$;
