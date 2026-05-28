<script lang="ts">
  import { page } from '$app/state';
  import { nav } from '$lib/ui/nav';
  import { schedeStore } from '$lib/stores/schede.svelte';

  const id = $derived(page.params.id ?? '');
  const scheda = $derived(schedeStore.getById(id));

  let newDayName = $state('');
  let adding = $state(false);

  async function addDay() {
    const name = newDayName.trim();
    if (!name || !scheda) return;
    adding = true;
    try {
      await schedeStore.addDay(scheda.id, name);
      newDayName = '';
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    } finally {
      adding = false;
    }
  }

  async function rename() {
    if (!scheda) return;
    const next = prompt('Nuovo nome scheda', scheda.name);
    if (!next || next.trim() === scheda.name) return;
    try {
      await schedeStore.renameScheda(scheda.id, next.trim());
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    }
  }

  async function remove() {
    if (!scheda) return;
    if (!confirm(`Eliminare scheda "${scheda.name}"? I giorni vengono eliminati a cascata. Lo storico delle sedute resta.`)) return;
    try {
      await schedeStore.deleteScheda(scheda.id);
      nav('/');
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    }
  }
</script>

<div class="view">
  <button class="back" onclick={() => nav('/')}>← Schede</button>
  {#if !scheda}
    <p>Scheda non trovata.</p>
  {:else}
    <div class="subhead">
      <h2 class="view-title" style="flex:1; margin: 0;">{scheda.name}</h2>
      <button class="card-menu" onclick={rename} title="Rinomina">✎</button>
    </div>
    <p class="view-sub">{scheda.days.length} giorni</p>

    <div class="day-chips">
      {#each scheda.days as d (d.id)}
        <button class="day-chip" class:has-ex={d.exerciseIds.length > 0} onclick={() => nav(`/schede/${scheda.id}/days/${d.id}/`)}>
          <span class="dot"></span>
          <span>{d.name}</span>
          <span class="meta">{d.exerciseIds.length}</span>
        </button>
      {/each}
    </div>

    <form class="card" style="margin-top: 16px;" onsubmit={(e) => { e.preventDefault(); addDay(); }}>
      <input type="text" placeholder="Es. Push, Pull, Gambe..." bind:value={newDayName} />
      <button type="submit" class="btn primary" disabled={adding || !newDayName.trim()}>Aggiungi giorno</button>
    </form>

    <button class="btn danger" onclick={remove} style="margin-top: 16px;">Elimina scheda</button>
  {/if}
</div>

<style>
  input { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; width: 100%; margin-bottom: 12px; }
  .btn { padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; }
  .btn.primary { background: var(--ink); color: white; width: 100%; }
  .btn.danger { width: 100%; background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
  .card-menu { font-size: 18px; padding: 6px; color: var(--ink-3); }
</style>
