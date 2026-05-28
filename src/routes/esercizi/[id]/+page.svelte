<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import ExerciseForm from '$lib/ui/ExerciseForm.svelte';
  import type { Exercise } from '$lib/domain/types';

  const id = $derived(page.params.id ?? '');
  const isNew = $derived(id === 'new');
  const existing = $derived(isNew ? undefined : exercisesStore.getById(id));

  async function save(ex: Omit<Exercise, 'id'>) {
    try {
      if (isNew) {
        await exercisesStore.create(ex);
      } else if (existing) {
        await exercisesStore.update({ ...existing, ...ex });
      }
      goto('/esercizi/');
    } catch (err) {
      alert('Errore salvataggio: ' + (err instanceof Error ? err.message : 'sconosciuto'));
    }
  }

  function cancel() {
    goto('/esercizi/');
  }

  async function remove() {
    if (!existing) return;
    if (!confirm(`Eliminare "${existing.name}"?`)) return;
    try {
      await exercisesStore.remove(existing.id);
      goto('/esercizi/');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore eliminazione');
    }
  }
</script>

<div class="view">
  <button class="back" onclick={cancel}>← Esercizi</button>
  <h2 class="view-title">{isNew ? 'Nuovo esercizio' : 'Modifica esercizio'}</h2>

  {#if isNew}
    <ExerciseForm exercise={{}} onsave={save} oncancel={cancel} />
  {:else if existing}
    <ExerciseForm exercise={existing} onsave={save} oncancel={cancel} />
    <button class="btn danger" onclick={remove}>Elimina esercizio</button>
  {:else}
    <p>Esercizio non trovato.</p>
  {/if}
</div>

<style>
  .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); margin: 0 0 8px; padding: 6px 0; }
  .btn.danger { width: 100%; margin-top: 16px; padding: 14px; background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 12px; font-weight: 600; }
</style>
