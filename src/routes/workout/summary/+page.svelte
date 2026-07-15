<script lang="ts">
  import { nav } from '$lib/ui/nav';
  import { workoutDraftStore } from '$lib/stores/workout-draft.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { workoutsStore } from '$lib/stores/workouts.svelte';
  import { entryStatus, tryApplyEntryResult, tryNextPrescription } from '$lib/domain/progression';
  import { fmtKg } from '$lib/ui/utils';
  import type { Entry, Exercise, ProgressionResult } from '$lib/domain/types';

  const draft = $derived(workoutDraftStore.draft);
  let saving = $state(false);

  function entryFromDraft(de: NonNullable<typeof draft>['exercises'][number]): Entry {
    return {
      prescribed: de.prescribed,
      actualSets: de.sets,
      isDeloadSession: !!de.prescribed.isDeload
    };
  }

  function progressionPreview(ex: Exercise | undefined, entry: Entry, skipped: boolean) {
    if (!ex || skipped || !entry.actualSets.some((set) => set.status !== null)) return null;
    return tryApplyEntryResult(ex, entry, null, settingsStore.data);
  }

  async function commit() {
    if (!draft || saving) return;
    saving = true;
    try {
      const entries: Parameters<typeof workoutsStore.commit>[4] = [];
      const exerciseUpdates: Exercise[] = [];
      for (const de of draft.exercises) {
        const ex = exercisesStore.getById(de.exerciseId);
        const entry = entryFromDraft(de);
        const anyLogged = entry.actualSets.some((s) => s.status !== null);

        let resultInfo: ProgressionResult | null = null;
        if (!de.skipped && anyLogged && ex) {
          const attempt = tryApplyEntryResult(ex, entry, null, settingsStore.data);
          if (!attempt.ok) throw new Error(`${ex.name}: ${attempt.error}`);
          resultInfo = attempt.value.info;
          exerciseUpdates.push(attempt.value.updatedExercise);
        }

        entries.push({
          exerciseId: de.exerciseId,
          position: 0,
          prescribed: entry.prescribed,
          actualSets: entry.actualSets,
          userAction: null,
          resultInfo,
          isDeloadSession: !!entry.isDeloadSession,
          skipped: de.skipped
        });
      }

      const durationSec = Math.max(
        0,
        Math.round((Date.now() - new Date(draft.date).getTime()) / 1000)
      );

      await workoutsStore.commit(draft.schedaId, draft.dayId, draft.date, durationSec, entries, exerciseUpdates);
      exercisesStore.applyLocal(exerciseUpdates);
      workoutDraftStore.cancel();
      nav('/storico/');
    } catch (err) {
      alert('Errore salvataggio: ' + (err instanceof Error ? err.message : ''));
    } finally {
      saving = false;
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
      {@const bar = entry.prescribed.barWeight ?? 0}
      {@const status = entryStatus(entry)}
      {@const preview = progressionPreview(ex, entry, de.skipped)}
      {@const result = preview?.ok ? preview.value : null}
      {@const info = result?.info}
      {@const nextAttempt = result ? tryNextPrescription(result.updatedExercise, settingsStore.data) : null}
      {@const next = nextAttempt?.ok ? nextAttempt.value : null}
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
          {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load + bar)}
          {settingsStore.data.weightUnit}{#if bar > 0} · {fmtKg(entry.prescribed.load)} dischi{/if}
        </div>
        {#if preview && !preview.ok}
          <div class="outcome error">
            <strong>Progressione non calcolabile</strong>
            <p>{preview.error}. Il draft è ancora disponibile: correggi l’esercizio prima di salvare.</p>
          </div>
        {:else if nextAttempt && !nextAttempt.ok}
          <div class="outcome error">
            <strong>Prossima prescrizione non calcolabile</strong>
            <p>{nextAttempt.error}. Il draft è ancora disponibile.</p>
          </div>
        {:else if info?.kind === 'wave-v2-advance'}
          <div class="outcome">
            <p>Prescritto {fmtKg(info.prescribedLoad + bar)} {settingsStore.data.weightUnit} · consolidato {fmtKg(info.consolidatedLoad + bar)} {settingsStore.data.weightUnit}</p>
            <p>{info.validSets} serie valide · minimo richiesto {info.requiredSets}</p>
            {#if next}<strong>Prossima: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'wave-v2-rebase-advance'}
          <div class="outcome">
            <p>Prescritto {fmtKg(info.prescribedLoad + bar)} {settingsStore.data.weightUnit} · consolidato {fmtKg(info.consolidatedLoad + bar)} {settingsStore.data.weightUnit}</p>
            {#if next}<strong>Prossima: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'wave-v2-repeat-reduced'}
          <div class="outcome warning">
            <p>Settimana non consolidata · {info.validSets} serie valide, minimo richiesto {info.requiredSets}</p>
            {#if next}<strong>Ripeti {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'wave-v2-cycle-end'}
          <div class="outcome">
            <p>Ciclo {info.completedCycle} consolidato · {info.validSets} serie valide, minimo richiesto {info.requiredSets}</p>
            {#if info.adjustmentKind === 'rebase'}
              <p>Prescritto {fmtKg(info.prescribedLoad + bar)} {settingsStore.data.weightUnit} · consolidato {fmtKg(info.consolidatedLoad + bar)} {settingsStore.data.weightUnit}</p>
            {/if}
            {#if next}<strong>Prossimo ciclo: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'linear-v2-complete'}
          <div class="outcome">
            <p>Successo completo · {info.validSets}/{entry.prescribed.sets} serie valide</p>
            {#if next}<strong>Prossima: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'linear-v2-tolerated'}
          <div class="outcome">
            <p>Successo tollerato · {info.validSets}/{entry.prescribed.sets} serie valide</p>
            {#if next}<strong>Prossima: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'linear-v2-repeat'}
          <div class="outcome warning">
            <p>Prima seduta non consolidata · {info.validSets} serie valide, minimo richiesto {info.requiredSets}</p>
            {#if next}<strong>Ripeti: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'linear-v2-deload'}
          <div class="outcome warning">
            <p>Seconda seduta consecutiva non consolidata · riduzione del 5% quantizzata allo step</p>
            {#if next}<strong>Prossima: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {:else if info?.kind === 'deload-completed'}
          <div class="outcome">
            <p>Deload completato</p>
            {#if next}<strong>Prossima: {next.sets}×{next.reps} @ {fmtKg(next.load + (next.barWeight ?? 0))} {settingsStore.data.weightUnit}</strong>{/if}
          </div>
        {/if}
      </div>
    {/each}

    <button class="btn primary" onclick={commit} disabled={saving} style="margin-top: 24px;">
      {saving ? 'Salvataggio…' : 'Conferma e salva'}
    </button>
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
  .btn:disabled {
    opacity: 0.6;
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
  .outcome {
    display: grid;
    gap: 4px;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--success-soft);
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.4;
  }
  .outcome p {
    margin: 0;
  }
  .outcome strong {
    color: var(--ink);
  }
  .outcome.warning {
    background: var(--accent-soft);
  }
  .outcome.error {
    background: var(--danger-soft, #fee2e2);
    color: var(--danger, #991b1b);
  }
</style>
