<script lang="ts">
  import { nav } from '$lib/ui/nav';
  import { workoutDraftStore } from '$lib/stores/workout-draft.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { workoutsStore } from '$lib/stores/workouts.svelte';
  import { applyEntryResult, entryStatus, weekWasFailed } from '$lib/domain/progression';
  import { fmtKg } from '$lib/ui/utils';
  import type { Entry, ProgressionResult } from '$lib/domain/types';

  const draft = $derived(workoutDraftStore.draft);

  function entryFromDraft(de: NonNullable<typeof draft>['exercises'][number]): Entry {
    return {
      prescribed: de.prescribed,
      actualSets: de.sets,
      isDeloadSession: !!de.prescribed.isDeload
    };
  }

  async function commit() {
    if (!draft) return;
    const entries: Parameters<typeof workoutsStore.commit>[4] = [];
    for (const de of draft.exercises) {
      const ex = exercisesStore.getById(de.exerciseId);
      const entry = entryFromDraft(de);
      const anyLogged = entry.actualSets.some((s) => s.status !== null);

      let resultInfo: ProgressionResult | null = null;
      let userAction: 'repeat' | null = null;
      if (!de.skipped && anyLogged && ex) {
        userAction = workoutDraftStore.summaryChoices[de.exerciseId] ?? null;
        const r = applyEntryResult(ex, entry, userAction, settingsStore.data);
        resultInfo = r.info;
        await exercisesStore.update(r.updatedExercise);
      }

      entries.push({
        exerciseId: de.exerciseId,
        position: 0,
        prescribed: entry.prescribed,
        actualSets: entry.actualSets,
        userAction,
        resultInfo,
        isDeloadSession: !!entry.isDeloadSession,
        skipped: de.skipped
      });
    }

    const durationSec = Math.max(
      0,
      Math.round((Date.now() - new Date(draft.date).getTime()) / 1000)
    );

    try {
      await workoutsStore.commit(draft.schedaId, draft.dayId, draft.date, durationSec, entries);
      workoutDraftStore.cancel();
      nav('/storico/');
    } catch (err) {
      alert('Errore salvataggio: ' + (err instanceof Error ? err.message : ''));
    }
  }

  function back() {
    nav('/workout/new/');
  }
</script>

{#if !draft}
  <div class="view">
    <p>Nessuna seduta in corso.</p>
    <button onclick={() => nav('/')}>Home</button>
  </div>
{:else}
  <div class="view">
    <button class="back" onclick={back}>← Modifica</button>
    <h2 class="view-title">Riepilogo seduta</h2>

    {#each draft.exercises as de (de.exerciseId)}
      {@const ex = exercisesStore.getById(de.exerciseId)}
      {@const entry = entryFromDraft(de)}
      {@const status = entryStatus(entry)}
      {@const failed = weekWasFailed(entry)}
      <div class="card">
        <div class="card-head">
          <h3 class="card-name">{ex?.name ?? 'Esercizio'}</h3>
          {#if de.skipped}
            <span class="badge skip">saltato</span>
          {:else}
            <span class="badge {status.kind}">{status.text}</span>
          {/if}
        </div>
        <div class="card-sub">
          {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load)}
          {settingsStore.data.weightUnit}
        </div>
        {#if failed && ex?.scheme === 'wave' && !entry.prescribed.isDeload && !de.skipped}
          <div style="margin-top: 12px;">
            <p style="font-size: 12px; color: var(--ink-2);">Settimana fallita. Vuoi ripeterla?</p>
            <label style="display: inline-flex; gap: 6px; margin-right: 12px;">
              <input
                type="radio"
                name="action-{de.exerciseId}"
                value="repeat"
                checked={workoutDraftStore.summaryChoices[de.exerciseId] === 'repeat'}
                onchange={() => workoutDraftStore.setSummaryChoice(de.exerciseId, 'repeat')}
              />
              Ripeti settimana
            </label>
            <label style="display: inline-flex; gap: 6px;">
              <input
                type="radio"
                name="action-{de.exerciseId}"
                value="advance"
                checked={workoutDraftStore.summaryChoices[de.exerciseId] !== 'repeat'}
                onchange={() => workoutDraftStore.setSummaryChoice(de.exerciseId, null)}
              />
              Avanza
            </label>
          </div>
        {/if}
      </div>
    {/each}

    <button class="btn primary" onclick={commit} style="margin-top: 24px;">Conferma e salva</button>
  </div>
{/if}

<style>
  .back {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-2);
    padding: 6px 0;
  }
  .btn {
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    width: 100%;
  }
  .btn.primary {
    background: var(--ink);
    color: white;
  }
  .badge {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 8px;
  }
  .badge.ok {
    background: var(--success-soft);
    color: var(--success);
  }
  .badge.fail {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .badge.partial {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .badge.skip {
    background: var(--bg-elev);
    color: var(--ink-2);
  }
</style>
