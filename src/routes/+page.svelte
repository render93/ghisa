<script lang="ts">
  import { nav } from '$lib/ui/nav';
  import { schedeStore } from '$lib/stores/schede.svelte';

  let newName = $state('');
  let creating = $state(false);

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    creating = true;
    try {
      const scheda = await schedeStore.createScheda(name);
      newName = '';
      nav(`/schede/${scheda.id}/`);
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    } finally {
      creating = false;
    }
  }
</script>

<div class="view">
  <h2 class="view-title">Schede</h2>
  <p class="view-sub">{schedeStore.items.length} schede</p>

  {#each schedeStore.items as s (s.id)}
    {@const totalEx = s.days.reduce((acc, d) => acc + d.exerciseIds.length, 0)}
    <button class="card" onclick={() => nav(`/schede/${s.id}/`)} style="display: block; width: 100%; text-align: left;">
      <div class="card-head">
        <h3 class="card-name">{s.name}</h3>
      </div>
      <div class="card-sub">{s.days.length} giorni · {totalEx} esercizi</div>
    </button>
  {/each}

  <form class="card" onsubmit={(e) => { e.preventDefault(); createNew(); }}>
    <input type="text" placeholder="Nome nuova scheda" bind:value={newName} />
    <button type="submit" class="btn primary" disabled={creating || !newName.trim()}>Crea scheda</button>
  </form>
</div>

<style>
  input { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; width: 100%; margin-bottom: 12px; }
  .btn.primary { background: var(--ink); color: white; padding: 12px; border-radius: 12px; font-weight: 600; width: 100%; }
</style>
