<script lang="ts">
  import { page } from '$app/state';
  import { nav } from '$lib/ui/nav';
  import { workoutsStore } from '$lib/stores/workouts.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { fmtDate, fmtKg, fmtDuration } from '$lib/ui/utils';

  const id = $derived(page.params.id);
  const workout = $derived(id ? workoutsStore.getById(id) : undefined);
</script>

<div class="view">
  <button class="back" onclick={() => nav('/storico/')}>← Storico</button>
  {#if !workout}
    <p>Seduta non trovata.</p>
  {:else}
    <h2 class="view-title">{fmtDate(workout.performedAt)}</h2>
    <p class="view-sub">{workout.skipped ? 'seduta saltata' : `${workout.entries.length} esercizi${workout.durationSec != null ? ` · ${fmtDuration(workout.durationSec)}` : ''}`}</p>

    {#if workout.skipped}
      <div class="card">
        <span class="badge skip">saltata</span>
        {#if workout.note}<p style="margin: 12px 0 0; font-size: 14px; color: var(--ink-2);">{workout.note}</p>{/if}
      </div>
    {:else}
      {#each workout.entries as entry (entry.id)}
        {@const ex = exercisesStore.getById(entry.exerciseId)}
        {@const bar = entry.prescribed.barWeight ?? 0}
        <div class="card">
          <h3 class="card-name">{ex?.name ?? 'Esercizio eliminato'}</h3>
          <div class="card-sub">
            {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load + bar)} {settingsStore.data.weightUnit}{#if bar > 0} · {fmtKg(entry.prescribed.load)} dischi{/if}
            {#if entry.isDeloadSession}<span class="badge deload">DELOAD</span>{/if}
            {#if entry.skipped}<span class="badge skip">saltato</span>{/if}
          </div>
          {#if !entry.skipped}
            <div style="margin-top: 12px;">
              {#each entry.actualSets as s, i (i)}
                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line); font-family: var(--mono); font-size: 13px;">
                  <span>{i + 1}.</span>
                  <span>{s.reps} × {fmtKg(s.load + bar)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
  .badge.deload { background: var(--warn); color: white; padding: 2px 8px; font-size: 9px; border-radius: 6px; margin-left: 8px; }
  .badge.skip {
    background: var(--bg-elev);
    color: var(--ink-2);
    padding: 2px 8px;
    font-size: 9px;
    border-radius: 6px;
    font-family: var(--mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-left: 8px;
  }
</style>
