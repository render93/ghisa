<script lang="ts">
  import type { Exercise, Scheme } from '$lib/domain/types';
  import { settingsStore } from '$lib/stores/settings.svelte';

  let { exercise, onsave, oncancel }: {
    exercise: Partial<Exercise>;
    onsave: (ex: Omit<Exercise, 'id'>) => void;
    oncancel: () => void;
  } = $props();

  let name = $state(exercise.name ?? '');
  let scheme = $state<Scheme>(exercise.scheme ?? 'wave');
  let restSeconds = $state(exercise.restSeconds ?? settingsStore.data.defaultRestSec);
  let waveBaseLoad = $state(exercise.waveBaseLoad ?? 0);
  let linearCurrentLoad = $state(exercise.linearCurrentLoad ?? 0);
  let linearTargetSets = $state(exercise.linearTargetSets ?? 3);
  let linearTargetReps = $state(exercise.linearTargetReps ?? 8);
  let plateRounding = $state<number | undefined>(exercise.plateRounding);
  let linearIncrementSteps = $state<number | undefined>(exercise.linearIncrementSteps);
  const stepValue = $derived(
    plateRounding && plateRounding > 0
      ? plateRounding
      : scheme === 'wave'
        ? settingsStore.data.plateRoundingWave
        : settingsStore.data.plateRoundingLinear
  );

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const base: Omit<Exercise, 'id'> = {
      name: name.trim(),
      scheme,
      restSeconds,
      plateRounding: plateRounding && plateRounding > 0 ? plateRounding : undefined
    };
    if (scheme === 'wave') {
      onsave({
        ...base,
        waveBaseLoad,
        waveCurrentWeek: exercise.waveCurrentWeek ?? 1,
        waveCurrentCycle: exercise.waveCurrentCycle ?? 1,
        cycleFailures: exercise.cycleFailures ?? 0,
        pendingDeload: exercise.pendingDeload ?? false
      });
    } else {
      onsave({
        ...base,
        linearCurrentLoad,
        linearTargetSets,
        linearTargetReps,
        linearConsecutiveFailures: exercise.linearConsecutiveFailures ?? 0,
        linearIncrementSteps: linearIncrementSteps && linearIncrementSteps > 0 ? linearIncrementSteps : undefined
      });
    }
  }
</script>

<form onsubmit={submit} class="ex-form">
  <label>
    Nome
    <input type="text" bind:value={name} required />
  </label>

  <label>
    Schema di progressione
    <select bind:value={scheme}>
      <option value="wave">Wave (5 settimane)</option>
      <option value="linear">Linear (carico fisso, +kg quando completi)</option>
    </select>
  </label>

  <label>
    Recupero tra serie (secondi)
    <input type="number" bind:value={restSeconds} min="30" step="15" />
  </label>

  {#if scheme === 'wave'}
    <label>
      Carico base ({settingsStore.data.weightUnit})
      <input type="number" bind:value={waveBaseLoad} min="0" step={stepValue} />
    </label>
  {:else}
    <label>
      Carico iniziale ({settingsStore.data.weightUnit})
      <input type="number" bind:value={linearCurrentLoad} min="0" step={stepValue} />
    </label>
    <label>
      Serie target
      <input type="number" bind:value={linearTargetSets} min="1" />
    </label>
    <label>
      Reps target
      <input type="number" bind:value={linearTargetReps} min="1" />
    </label>
    <label>
      Passi per advance (vuoto = default impostazioni)
      <input type="number" min="1" step="1" placeholder={String(settingsStore.data.linearIncrementSteps)} bind:value={linearIncrementSteps} />
    </label>
  {/if}

  <label>
    Arrotondamento dischi (vuoto = default schema)
    <input type="number" min="0" step="0.25" placeholder={String(stepValue)} bind:value={plateRounding} />
  </label>

  <div class="actions">
    <button type="button" class="btn secondary" onclick={oncancel}>Annulla</button>
    <button type="submit" class="btn primary">Salva</button>
  </div>
</form>

<style>
  .ex-form { display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
  input, select { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; }
  .actions { display: flex; gap: 8px; margin-top: 16px; }
  .actions .btn { flex: 1; }
  .btn { padding: 14px; border-radius: 12px; font-weight: 600; font-size: 14px; }
  .btn.primary { background: var(--ink); color: white; }
  .btn.secondary { background: var(--bg-elev); color: var(--ink); }
</style>
