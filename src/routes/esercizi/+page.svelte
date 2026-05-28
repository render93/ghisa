<script lang="ts">
  import { nav } from '$lib/ui/nav';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { nextPrescription } from '$lib/domain/progression';
  import { fmtKg } from '$lib/ui/utils';
</script>

<div class="view">
  <h2 class="view-title">Esercizi</h2>
  <p class="view-sub">{exercisesStore.items.length} esercizi</p>

  {#if exercisesStore.items.length === 0}
    <div class="card">
      <p style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">
        Nessun esercizio. Aggiungi il primo con il bottone in basso.
      </p>
    </div>
  {/if}

  {#each exercisesStore.items as ex (ex.id)}
    {@const p = nextPrescription(ex, settingsStore.data)}
    <button class="ex-card" onclick={() => nav(`/esercizi/${ex.id}/`)} style="text-align: left; width: 100%; cursor: pointer;">
      <div class="scheme-tag {ex.scheme}">{ex.scheme}</div>
      <h3 class="name">{ex.name}</h3>
      <div class="prescription">
        <span class="sets-x-reps">{p.sets}×{p.reps}</span>
        <span class="at">@</span>
        <span class="load">{fmtKg(p.load)}<span class="unit">{settingsStore.data.weightUnit}</span></span>
      </div>
      {#if ex.scheme === 'wave'}
        <div class="meta">
          <span>Settimana {ex.waveCurrentWeek ?? 1}</span>
          <span class="dot"></span>
          <span>Ciclo {ex.waveCurrentCycle ?? 1}</span>
          {#if ex.pendingDeload}<span class="dot"></span><span>Deload</span>{/if}
        </div>
      {/if}
    </button>
  {/each}
</div>

<button class="fab" aria-label="Nuovo esercizio" onclick={() => nav('/esercizi/new/')}>
  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
</button>
