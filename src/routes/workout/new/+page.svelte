<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { schedeStore } from '$lib/stores/schede.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { workoutDraftStore } from '$lib/stores/workout-draft.svelte';
  import { nextPrescription } from '$lib/domain/progression';
  import { fmtKg } from '$lib/ui/utils';
  import { startRest } from '$lib/ui/rest-timer-bus';
  import type { Exercise } from '$lib/domain/types';

  const schedaId = $derived(page.url.searchParams.get('scheda') ?? '');
  const dayId = $derived(page.url.searchParams.get('day') ?? '');

  onMount(() => {
    if (workoutDraftStore.draft) return;
    const day = schedeStore.getDay(schedaId, dayId);
    if (!day) {
      alert('Giorno non trovato.');
      goto('/');
      return;
    }
    const exs = day.exerciseIds
      .map((id) => exercisesStore.getById(id))
      .filter((e): e is Exercise => !!e);
    workoutDraftStore.start(schedaId, dayId, exs, (ex) =>
      nextPrescription(ex, settingsStore.data)
    );
  });

  const draft = $derived(workoutDraftStore.draft);
  const currentEntry = $derived(draft?.exercises[draft.currentExIdx]);
  const currentExercise = $derived(
    currentEntry ? exercisesStore.getById(currentEntry.exerciseId) : undefined
  );

  function logSet(idx: number, status: 'ok' | 'fail') {
    if (!draft) return;
    workoutDraftStore.setSet(draft.currentExIdx, idx, { status });
    if (status === 'ok' && currentExercise) {
      startRest(currentExercise.restSeconds, currentExercise.name);
    }
  }

  function updateReps(idx: number, value: number) {
    if (!draft) return;
    workoutDraftStore.setSet(draft.currentExIdx, idx, { reps: value });
  }

  function updateLoad(idx: number, value: number) {
    if (!draft) return;
    workoutDraftStore.setSet(draft.currentExIdx, idx, { load: value });
  }

  function next() {
    workoutDraftStore.nextExercise();
  }

  function prev() {
    workoutDraftStore.prevExercise();
  }

  function finish() {
    goto('/workout/summary/');
  }

  function cancel() {
    if (!confirm('Annullare la seduta? I dati non vengono salvati.')) return;
    workoutDraftStore.cancel();
    goto('/');
  }
</script>

{#if !draft || !currentEntry || !currentExercise}
  <div class="view"><p>Caricamento…</p></div>
{:else}
  {@const isLast = draft.currentExIdx === draft.exercises.length - 1}
  {@const isFirst = draft.currentExIdx === 0}
  <div class="view">
    <button class="back" onclick={cancel}>✕ Annulla seduta</button>
    <p class="view-sub">Esercizio {draft.currentExIdx + 1} di {draft.exercises.length}</p>
    <h2 class="view-title">{currentExercise.name}</h2>

    <div class="card">
      <div class="prescription" style="font-size: 14px; color: var(--ink-2);">
        Target: <strong>{currentEntry.prescribed.sets}×{currentEntry.prescribed.reps}</strong>
        @ <strong>{fmtKg(currentEntry.prescribed.load)} {settingsStore.data.weightUnit}</strong>
        {#if currentEntry.prescribed.isDeload}<span class="card-badge deload">DELOAD</span>{/if}
      </div>
    </div>

    {#each currentEntry.sets as set, i (i)}
      <div
        class="set-row card"
        style="display: grid; grid-template-columns: 28px 1fr 1fr auto auto; gap: 8px; align-items: center;"
      >
        <span class="order">{i + 1}</span>
        <label style="flex-direction: column; gap: 2px;">
          <span style="font-size: 9px; color: var(--ink-3);">REPS</span>
          <input
            type="number"
            min="0"
            value={set.reps}
            oninput={(e) => updateReps(i, +(e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label style="flex-direction: column; gap: 2px;">
          <span style="font-size: 9px; color: var(--ink-3);">KG</span>
          <input
            type="number"
            min="0"
            step={settingsStore.data.plateRounding}
            value={set.load}
            oninput={(e) => updateLoad(i, +(e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="set-btn ok" class:active={set.status === 'ok'} onclick={() => logSet(i, 'ok')}>✓</button>
        <button class="set-btn fail" class:active={set.status === 'fail'} onclick={() => logSet(i, 'fail')}>✕</button>
      </div>
    {/each}

    <div style="display: flex; gap: 8px; margin-top: 16px;">
      <button class="btn secondary" onclick={prev} disabled={isFirst}>← Prec</button>
      {#if isLast}
        <button class="btn primary" onclick={finish}>Concludi seduta →</button>
      {:else}
        <button class="btn primary" onclick={next}>Succ →</button>
      {/if}
    </div>
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
  .set-row input {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 16px;
  }
  .set-btn {
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-weight: 600;
  }
  .set-btn.ok.active {
    background: var(--success);
    color: white;
    border-color: var(--success);
  }
  .set-btn.fail.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .btn {
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    flex: 1;
  }
  .btn.primary {
    background: var(--ink);
    color: white;
  }
  .btn.secondary {
    background: var(--bg-elev);
    color: var(--ink);
  }
</style>
