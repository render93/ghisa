<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { DEFAULT_SETTINGS } from '$lib/domain/types';

  const HELP: Record<string, string> = {
    weightUnit: 'Unità per visualizzare e inserire i carichi.',
    defaultRestSec: 'Tempo di riposo suggerito tra una serie e l\'altra, usato dal timer.',
    plateRoundingWave: 'Passo di arrotondamento per gli esercizi wave (es. 2.5 = dischi da 1.25 kg per lato).',
    plateRoundingLinear: 'Passo di arrotondamento per gli esercizi linear (es. 2 = manubri con step da 2 kg).',
    waveCycleIncrementPct: 'Aumento percentuale del carico base alla fine di ogni ciclo di 5 settimane.',
    cycleHoldThreshold: 'Numero di settimane fallite oltre cui il ciclo successivo mantiene il carico (nessun aumento).',
    cycleResetThreshold: 'Numero di settimane fallite oltre cui il carico base viene ridotto al ciclo successivo.',
    cycleResetPct: 'Quanto ridurre il carico base quando scatta il reset.',
    deloadEveryNCycles: 'Frequenza dei cicli di scarico (es. 3 = ogni 3 cicli completati).',
    deloadLoadPct: 'Carico durante un deload, in % del prescritto.',
    deloadSetsMult: 'Moltiplicatore serie durante un deload (es. 0.5 = metà serie).',
    deloadRepsMult: 'Moltiplicatore reps durante un deload (es. 0.8 = -20%).',
    linearIncrementSteps: 'Di quanti passi di arrotondamento sale il carico dopo una sessione completata pienamente (1 = un passo). Lo "step" è l\'arrotondamento dischi, globale o per-esercizio.',
    linearResetPct: 'Quanto ridurre il carico dopo due fallimenti consecutivi.'
  };

  let editing = $state({ ...settingsStore.data });
  let openHelp = $state<string | null>(null);

  function toggleHelp(key: string) {
    openHelp = openHelp === key ? null : key;
  }

  async function save() {
    try {
      await settingsStore.update(editing);
      alert('Impostazioni salvate');
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    }
  }

  function reset() {
    if (!confirm('Ripristinare i valori di default?')) return;
    editing = { ...DEFAULT_SETTINGS };
  }
</script>

{#snippet helpIcon(key: string)}
  <button
    type="button"
    class="help-btn"
    class:active={openHelp === key}
    onclick={() => toggleHelp(key)}
    aria-label="Spiega questo campo"
    aria-expanded={openHelp === key}
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  </button>
{/snippet}

{#snippet helpText(key: string)}
  {#if openHelp === key}
    <p class="help-text">{HELP[key]}</p>
  {/if}
{/snippet}

<div class="view">
  <h2 class="view-title">Impostazioni</h2>

  <div class="card">
    <h3 class="card-name" style="font-size: 18px;">Generale</h3>

    <div class="field">
      <div class="field-head">
        <label for="f-weightUnit">Unità di peso</label>
        {@render helpIcon('weightUnit')}
      </div>
      <select id="f-weightUnit" bind:value={editing.weightUnit}>
        <option value="kg">kg</option>
        <option value="lb">lb</option>
      </select>
      {@render helpText('weightUnit')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-defaultRestSec">Recupero default (secondi)</label>
        {@render helpIcon('defaultRestSec')}
      </div>
      <input id="f-defaultRestSec" type="number" bind:value={editing.defaultRestSec} min="30" step="15" />
      {@render helpText('defaultRestSec')}
    </div>

  </div>

  <div class="card">
    <h3 class="card-name" style="font-size: 18px;">Wave</h3>

    <div class="field">
      <div class="field-head">
        <label for="f-plateRoundingWave">Arrotondamento dischi</label>
        {@render helpIcon('plateRoundingWave')}
      </div>
      <input id="f-plateRoundingWave" type="number" bind:value={editing.plateRoundingWave} step="0.5" min="0.5" />
      {@render helpText('plateRoundingWave')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-waveCycleIncrementPct">Incremento ciclo (%)</label>
        {@render helpIcon('waveCycleIncrementPct')}
      </div>
      <input id="f-waveCycleIncrementPct" type="number" bind:value={editing.waveCycleIncrementPct} step="0.5" min="0" />
      {@render helpText('waveCycleIncrementPct')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-cycleHoldThreshold">Soglia hold (settimane fallite)</label>
        {@render helpIcon('cycleHoldThreshold')}
      </div>
      <input id="f-cycleHoldThreshold" type="number" bind:value={editing.cycleHoldThreshold} step="1" min="0" />
      {@render helpText('cycleHoldThreshold')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-cycleResetThreshold">Soglia reset</label>
        {@render helpIcon('cycleResetThreshold')}
      </div>
      <input id="f-cycleResetThreshold" type="number" bind:value={editing.cycleResetThreshold} step="1" min="0" />
      {@render helpText('cycleResetThreshold')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-cycleResetPct">Riduzione su reset (%)</label>
        {@render helpIcon('cycleResetPct')}
      </div>
      <input id="f-cycleResetPct" type="number" bind:value={editing.cycleResetPct} step="0.5" min="0" />
      {@render helpText('cycleResetPct')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-deloadEveryNCycles">Deload ogni N cicli</label>
        {@render helpIcon('deloadEveryNCycles')}
      </div>
      <input id="f-deloadEveryNCycles" type="number" bind:value={editing.deloadEveryNCycles} step="1" min="0" />
      {@render helpText('deloadEveryNCycles')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-deloadLoadPct">Deload: carico (% del prescritto)</label>
        {@render helpIcon('deloadLoadPct')}
      </div>
      <input id="f-deloadLoadPct" type="number" bind:value={editing.deloadLoadPct} step="1" min="0" max="100" />
      {@render helpText('deloadLoadPct')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-deloadSetsMult">Deload: moltiplicatore sets</label>
        {@render helpIcon('deloadSetsMult')}
      </div>
      <input id="f-deloadSetsMult" type="number" bind:value={editing.deloadSetsMult} step="0.1" min="0" max="1" />
      {@render helpText('deloadSetsMult')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-deloadRepsMult">Deload: moltiplicatore reps</label>
        {@render helpIcon('deloadRepsMult')}
      </div>
      <input id="f-deloadRepsMult" type="number" bind:value={editing.deloadRepsMult} step="0.1" min="0" max="1" />
      {@render helpText('deloadRepsMult')}
    </div>
  </div>

  <div class="card">
    <h3 class="card-name" style="font-size: 18px;">Linear</h3>

    <div class="field">
      <div class="field-head">
        <label for="f-plateRoundingLinear">Arrotondamento dischi</label>
        {@render helpIcon('plateRoundingLinear')}
      </div>
      <input id="f-plateRoundingLinear" type="number" bind:value={editing.plateRoundingLinear} step="0.5" min="0.5" />
      {@render helpText('plateRoundingLinear')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-linearIncrementSteps">Incremento per advance (passi)</label>
        {@render helpIcon('linearIncrementSteps')}
      </div>
      <input id="f-linearIncrementSteps" type="number" bind:value={editing.linearIncrementSteps} step="1" min="1" />
      {@render helpText('linearIncrementSteps')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-linearResetPct">Riduzione su deload (%)</label>
        {@render helpIcon('linearResetPct')}
      </div>
      <input id="f-linearResetPct" type="number" bind:value={editing.linearResetPct} step="0.5" min="0" />
      {@render helpText('linearResetPct')}
    </div>
  </div>

  <div class="card">
    <h3 class="card-name" style="font-size: 18px;">Account</h3>
    <p style="font-size: 13px; color: var(--ink-2);">Loggato come <strong>{authStore.user?.email}</strong></p>
    <button class="btn ghost" onclick={() => authStore.signOut()}>Logout</button>
  </div>

  <div style="display: flex; gap: 8px; margin-top: 24px;">
    <button class="btn secondary" onclick={reset}>Reset default</button>
    <button class="btn primary" onclick={save}>Salva</button>
  </div>
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  .field-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .field-head label {
    font-size: 12px; letter-spacing: .04em; color: var(--ink-2);
    margin: 0; flex: 1; min-width: 0;
  }
  .help-btn {
    width: 28px; height: 28px; padding: 0;
    border-radius: 50%;
    background: transparent; border: none;
    color: var(--ink-2);
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition: color 120ms ease, background 120ms ease;
  }
  .help-btn:active,
  .help-btn.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .help-text {
    font-size: 12px; line-height: 1.4;
    color: var(--ink-2);
    background: var(--bg-elev);
    padding: 8px 10px;
    border-radius: 8px;
    border-left: 3px solid var(--accent);
    margin: 6px 0 0;
  }
  input, select { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; }
  .btn { padding: 14px; border-radius: 12px; font-weight: 600; flex: 1; }
  .btn.primary { background: var(--ink); color: white; }
  .btn.secondary { background: var(--bg-elev); color: var(--ink); }
  .btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); width: 100%; }
</style>
