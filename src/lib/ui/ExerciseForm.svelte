<script lang="ts">
  import { untrack } from 'svelte';
  import { WAVE_PATTERN, type Exercise, type Scheme } from '$lib/domain/types';
  import { buildWavePlan, ensureProgressionV2, nextWaveCyclePlan } from '$lib/domain/progression';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { fmtKg } from '$lib/ui/utils';

  let { exercise, onsave, oncancel }: {
    exercise: Partial<Exercise>;
    onsave: (ex: Omit<Exercise, 'id'>) => void;
    oncancel: () => void;
  } = $props();

  const setupLocked = untrack(() => !!exercise.id);
  let name = $state(exercise.name ?? '');
  let scheme = $state<Scheme>(exercise.scheme ?? 'wave');
  let restSeconds = $state(exercise.restSeconds ?? settingsStore.data.defaultRestSec);
  let waveBaseLoad = $state(exercise.waveBaseLoad ?? 0);
  let linearCurrentLoad = $state(exercise.linearCurrentLoad ?? 0);
  let linearTargetSets = $state(exercise.linearTargetSets ?? 3);
  let linearTargetReps = $state(exercise.linearTargetReps ?? 8);
  let plateRounding = $state<number | undefined>(exercise.plateRounding);
  let barWeight = $state<number | undefined>(exercise.barWeight);
  const initialWaveBaseLoad = untrack(() => exercise.waveBaseLoad ?? 0);
  const initialProgressionState = untrack(() =>
    ensureProgressionV2(
      {
        id: exercise.id ?? '',
        name: exercise.name ?? '',
        restSeconds: exercise.restSeconds ?? settingsStore.data.defaultRestSec,
        ...exercise,
        scheme: exercise.scheme ?? 'wave'
      },
      settingsStore.data
    )
  );
  const stepValue = $derived(
    plateRounding && plateRounding > 0
      ? plateRounding
      : scheme === 'wave'
        ? settingsStore.data.plateRoundingWave
        : settingsStore.data.plateRoundingLinear
  );
  const effectiveBarWeight = $derived(barWeight && barWeight > 0 ? barWeight : 0);
  const currentWavePlan = $derived.by(() => {
    const storedPlan = initialProgressionState.waveCycleLoads;
    if (
      storedPlan?.length === WAVE_PATTERN.length &&
      waveBaseLoad === initialWaveBaseLoad
    ) {
      return [...storedPlan];
    }
    return buildWavePlan(waveBaseLoad, 1, stepValue);
  });
  const nextWavePlan = $derived(
    nextWaveCyclePlan(
      currentWavePlan,
      effectiveBarWeight,
      stepValue,
      settingsStore.data.waveCycleIncrementPct
    )
  );

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const base: Omit<Exercise, 'id'> = {
      name: name.trim(),
      scheme,
      restSeconds,
      plateRounding: plateRounding && plateRounding > 0 ? plateRounding : undefined,
      barWeight: barWeight && barWeight > 0 ? barWeight : undefined
    };
    if (scheme === 'wave') {
      onsave({
        ...base,
        waveBaseLoad,
        progressionVersion: 2,
        waveCycleLoads: [...currentWavePlan],
        waveCurrentWeek: initialProgressionState.waveCurrentWeek ?? 1,
        waveCurrentCycle: initialProgressionState.waveCurrentCycle ?? 1,
        cycleFailures: initialProgressionState.cycleFailures ?? 0,
        pendingDeload: initialProgressionState.pendingDeload ?? false
      });
    } else {
      onsave({
        ...base,
        progressionVersion: 2,
        linearCurrentLoad,
        linearTargetSets,
        linearTargetReps,
        linearConsecutiveFailures: initialProgressionState.linearConsecutiveFailures ?? 0,
        linearIncrementSteps: exercise.linearIncrementSteps
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
    <select bind:value={scheme} disabled={setupLocked}>
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
      <input type="number" bind:value={waveBaseLoad} min="0" step={stepValue} readonly={setupLocked} />
    </label>
  {:else}
    <label>
      Carico iniziale ({settingsStore.data.weightUnit})
      <input type="number" bind:value={linearCurrentLoad} min="0" step={stepValue} readonly={setupLocked} />
    </label>
    <label>
      Serie target
      <input type="number" bind:value={linearTargetSets} min="1" />
    </label>
    <label>
      Reps target
      <input type="number" bind:value={linearTargetReps} min="1" />
    </label>
  {/if}

  <label>
    Step minimo caricabile (vuoto = default schema)
    <input type="number" min="0" step="0.25" placeholder={String(stepValue)} bind:value={plateRounding} readonly={setupLocked} />
  </label>
  <p class="effective-step">Step effettivo: {fmtKg(stepValue)} {settingsStore.data.weightUnit}</p>
  {#if setupLocked}
    <p class="setup-lock-note">Schema, carico iniziale e step vengono definiti alla creazione e non sono modificabili.</p>
  {/if}

  <label>
    Peso bilanciere {settingsStore.data.weightUnit} (vuoto = nessuno)
    <input type="number" min="0" step="0.5" placeholder="0" bind:value={barWeight} />
  </label>

  {#if scheme === 'wave'}
    <div class="plan-preview">
      <div>
        <strong>Piano corrente</strong>
        <ul>
          {#each currentWavePlan as load, i}
            <li>W{i + 1} · {WAVE_PATTERN[i].sets}×{WAVE_PATTERN[i].reps} @ {fmtKg(load + effectiveBarWeight)} {settingsStore.data.weightUnit}</li>
          {/each}
        </ul>
      </div>
      <div>
        <strong>Ciclo successivo (+{fmtKg(settingsStore.data.waveCycleIncrementPct)}%)</strong>
        <ul>
          {#each nextWavePlan as load, i}
            <li>W{i + 1} · {fmtKg(load + effectiveBarWeight)} {settingsStore.data.weightUnit}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  <div class="actions">
    <button type="button" class="btn secondary" onclick={oncancel}>Annulla</button>
    <button type="submit" class="btn primary">Salva</button>
  </div>
</form>

<style>
  .ex-form { display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
  input, select { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; }
  input:read-only, select:disabled { background: var(--bg-elev); color: var(--ink-2); cursor: not-allowed; opacity: 1; }
  .effective-step { margin: -8px 0 0; color: var(--ink-3); font-family: var(--mono); font-size: 11px; }
  .setup-lock-note { margin: -4px 0 0; color: var(--ink-3); font-size: 11px; line-height: 1.4; }
  .plan-preview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-elev); color: var(--ink-2); }
  .plan-preview strong { display: block; margin-bottom: 6px; color: var(--ink); font-size: 12px; }
  .plan-preview ul { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; font-family: var(--mono); font-size: 10px; line-height: 1.4; }
  @media (max-width: 420px) { .plan-preview { grid-template-columns: 1fr; } }
  .actions { display: flex; gap: 8px; margin-top: 16px; }
  .actions .btn { flex: 1; }
  .btn { padding: 14px; border-radius: 12px; font-weight: 600; font-size: 14px; }
  .btn.primary { background: var(--ink); color: white; }
  .btn.secondary { background: var(--bg-elev); color: var(--ink); }
</style>
