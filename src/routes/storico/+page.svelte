<script lang="ts">
  import { nav } from '$lib/ui/nav';
  import { workoutsStore } from '$lib/stores/workouts.svelte';
  import { schedeStore } from '$lib/stores/schede.svelte';
  import { fmtDate, fmtDuration } from '$lib/ui/utils';
</script>

<div class="view">
  <h2 class="view-title">Storico</h2>
  <p class="view-sub">{workoutsStore.items.length} sedute</p>

  {#if workoutsStore.items.length === 0}
    <div class="card"><p style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">Nessuna seduta registrata.</p></div>
  {/if}

  {#each workoutsStore.items as w (w.id)}
    {@const scheda = w.schedaId ? schedeStore.getById(w.schedaId) : null}
    {@const day = (scheda && w.dayId) ? scheda.days.find((d) => d.id === w.dayId) : null}
    <button class="card" onclick={() => nav(`/storico/${w.id}/`)} style="display: block; width: 100%; text-align: left;">
      <div class="card-head">
        <h3 class="card-name">{scheda?.name ?? 'Seduta'} {day ? `· ${day.name}` : ''}</h3>
      </div>
      {#if w.skipped}
        <div class="card-sub"><span class="badge skip">saltata</span> {fmtDate(w.performedAt)}{w.note ? ` · ${w.note}` : ''}</div>
      {:else}
        <div class="card-sub">{fmtDate(w.performedAt)} · {w.entries.length} esercizi{w.durationSec != null ? ` · ${fmtDuration(w.durationSec)}` : ''}</div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .badge.skip {
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--bg-elev);
    color: var(--ink-2);
    margin-right: 6px;
  }
</style>
