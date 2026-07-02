-- Ghisa — commit_workout: salvataggio atomico della seduta
-- 2026-07-02
--
-- Scrive in UN'UNICA transazione: riga workouts, righe workout_entries e
-- l'avanzamento di progressione degli exercises. O tutto, o niente.
-- SECURITY INVOKER (default): la RLS auth.uid()=user_id resta il confine di
-- sicurezza; nessuna service-role.
--
-- MANUTENZIONE: l'UPDATE su exercises enumera le colonne di progressione.
-- Aggiungendo in futuro una colonna a exercises da persistere al commit,
-- aggiornare anche il blocco SET qui sotto.

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
