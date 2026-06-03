<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { nav } from '$lib/ui/nav';
  import { schedeStore } from '$lib/stores/schede.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { workoutDraftStore } from '$lib/stores/workout-draft.svelte';
  import { nextPrescription, effectiveRounding } from '$lib/domain/progression';
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
      nav('/');
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

  function toggleSkip() {
    if (!draft || !currentEntry) return;
    workoutDraftStore.setSkipped(draft.currentExIdx, !currentEntry.skipped);
  }

  function finish() {
    nav('/workout/summary/');
  }

  function cancel() {
    if (!confirm('Annullare la seduta? I dati non vengono salvati.')) return;
    workoutDraftStore.cancel();
    nav('/');
  }
</script>

{#if !draft || !currentEntry || !currentExercise}
  <div class="view"><p>Caricamento…</p></div>
{:else}
  {@const isLast = draft.currentExIdx === draft.exercises.length - 1}
  {@const isFirst = draft.currentExIdx === 0}
  <div class="view">
    <p class="view-sub">Esercizio {draft.currentExIdx + 1} di {draft.exercises.length}</p>
    <h2 class="view-title">{currentExercise.name}</h2>

    <div class="card">
      <div class="prescription" style="font-size: 14px; color: var(--ink-2);">
        Target: <strong>{currentEntry.prescribed.sets}×{currentEntry.prescribed.reps}</strong>
        @ <strong>{fmtKg(currentEntry.prescribed.load)} {settingsStore.data.weightUnit}</strong>
        {#if currentEntry.prescribed.isDeload}<span class="card-badge deload">DELOAD</span>{/if}
      </div>
    </div>

    <button type="button" class="btn skip-toggle" class:on={currentEntry.skipped} onclick={toggleSkip}>
      {currentEntry.skipped ? 'Annulla salto' : 'Salta esercizio'}
    </button>

    {#if currentEntry.skipped}
      <div class="card skipped-note">Esercizio saltato — non inciderà sui pesi</div>
    {:else}
      {#each currentEntry.sets as set, i (i)}
        {@const closed = set.status !== null}
        <div class="set-row card" class:closed>
          <span class="order">{i + 1}</span>
          <label class="field">
            <span class="field-label">REPS</span>
            <input
              type="number"
              min="0"
              value={set.reps}
              disabled={closed}
              oninput={(e) => updateReps(i, +(e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span class="field-label">KG</span>
            <input
              type="number"
              min="0"
              step={effectiveRounding(currentExercise, settingsStore.data)}
              value={set.load}
              disabled={closed}
              oninput={(e) => updateLoad(i, +(e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <button
            type="button"
            class="mark-btn pass"
            class:active={set.status === 'ok'}
            disabled={closed}
            onclick={() => logSet(i, 'ok')}
            aria-label="Set riuscito"
          >✓</button>
          <button
            type="button"
            class="mark-btn miss"
            class:active={set.status === 'fail'}
            disabled={closed}
            onclick={() => logSet(i, 'fail')}
            aria-label="Set fallito"
          >✕</button>
        </div>
      {/each}
    {/if}

    <div class="nav-row">
      <button class="btn secondary" onclick={prev} disabled={isFirst}>← Prec</button>
      {#if isLast}
        <button class="btn primary" onclick={finish}>Concludi seduta →</button>
      {:else}
        <button class="btn primary" onclick={next}>Succ →</button>
      {/if}
    </div>

    <button class="btn cancel" onclick={cancel}>✕ Annulla seduta</button>
  </div>
{/if}

<style>
  .set-row {
    display: grid;
    grid-template-columns: 28px 1fr 1fr auto auto;
    gap: 10px;
    align-items: end;
  }
  .set-row .order {
    align-self: center;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field-label {
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .set-row input {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 16px;
    height: 44px;
    box-sizing: border-box;
  }
  .set-row input:disabled {
    opacity: 0.55;
  }
  .mark-btn {
    width: 44px;
    height: 44px;
    border: 1.5px solid var(--line-strong, var(--line));
    border-radius: 10px;
    background: var(--bg);
    color: var(--ink-2);
    font-weight: 700;
    font-size: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s,
      opacity 0.15s;
    box-sizing: border-box;
  }
  .mark-btn.pass.active {
    background: var(--success);
    color: white;
    border-color: var(--success);
  }
  .mark-btn.miss.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .mark-btn:disabled:not(.active) {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .mark-btn:disabled.active {
    cursor: default;
  }
  .set-row.closed {
    background: var(--bg-elev);
  }
  .nav-row {
    display: flex;
    gap: 8px;
    margin-top: 24px;
  }
  .btn {
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 14px;
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
  .btn.cancel {
    margin-top: 12px;
    width: 100%;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .btn.skip-toggle {
    width: 100%;
    margin: 8px 0 12px;
    background: var(--bg-elev);
    color: var(--ink-2);
    border: 1px solid var(--line);
  }
  .btn.skip-toggle.on {
    border-color: var(--warn, var(--accent));
    color: var(--warn, var(--accent));
  }
  .skipped-note {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-3);
    text-align: center;
  }
</style>
