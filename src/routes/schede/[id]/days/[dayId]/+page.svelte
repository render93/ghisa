<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { schedeStore } from '$lib/stores/schede.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { nextPrescription } from '$lib/domain/progression';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { fmtKg } from '$lib/ui/utils';

  const schedaId = $derived(page.params.id ?? '');
  const dayId = $derived(page.params.dayId ?? '');
  const day = $derived(schedeStore.getDay(schedaId, dayId));
  const scheda = $derived(schedeStore.getById(schedaId));

  let pickerOpen = $state(false);

  const exercisesInDay = $derived(
    (day?.exerciseIds || []).map((id) => exercisesStore.getById(id)).filter((e): e is NonNullable<typeof e> => !!e)
  );

  const availableExercises = $derived(
    exercisesStore.items.filter((e) => !(day?.exerciseIds || []).includes(e.id))
  );

  async function add(exId: string) {
    if (!day) return;
    try {
      await schedeStore.setDayExercises(schedaId, dayId, [...day.exerciseIds, exId]);
      pickerOpen = false;
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    }
  }

  async function removeFromDay(exId: string) {
    if (!day) return;
    try {
      await schedeStore.setDayExercises(schedaId, dayId, day.exerciseIds.filter((id) => id !== exId));
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    }
  }

  async function renameDay() {
    if (!day) return;
    const next = prompt('Nuovo nome giorno', day.name);
    if (!next || next.trim() === day.name) return;
    await schedeStore.renameDay(schedaId, dayId, next.trim());
  }

  async function deleteDay() {
    if (!day) return;
    if (!confirm(`Eliminare giorno "${day.name}"?`)) return;
    await schedeStore.deleteDay(schedaId, dayId);
    goto(`/schede/${schedaId}/`);
  }

  function startWorkout() {
    goto(`/workout/new/?scheda=${schedaId}&day=${dayId}`);
  }
</script>

<div class="view">
  <button class="back" onclick={() => goto(`/schede/${schedaId}/`)}>← {scheda?.name ?? 'Scheda'}</button>
  {#if !day}
    <p>Giorno non trovato.</p>
  {:else}
    <div class="subhead">
      <h2 class="view-title" style="flex:1; margin: 0;">{day.name}</h2>
      <button class="card-menu" onclick={renameDay} title="Rinomina">✎</button>
    </div>
    <p class="view-sub">{exercisesInDay.length} esercizi</p>

    {#each exercisesInDay as ex, idx (ex.id)}
      {@const p = nextPrescription(ex, settingsStore.data)}
      <div class="ex-card removable">
        <span class="order">{idx + 1}</span>
        <div class="info">
          <h3 class="name">{ex.name}</h3>
          <div class="prescription">
            <span class="sets-x-reps">{p.sets}×{p.reps}</span>
            <span class="at">@</span>
            <span class="load">{fmtKg(p.load)}<span class="unit">{settingsStore.data.weightUnit}</span></span>
          </div>
        </div>
        <button class="card-menu" onclick={() => removeFromDay(ex.id)}>✕</button>
      </div>
    {/each}

    {#if !pickerOpen}
      <button class="btn ghost" onclick={() => pickerOpen = true} style="margin-top: 12px;">+ Aggiungi esercizio</button>
    {:else}
      <div class="card">
        <p class="view-sub" style="margin: 0 0 12px;">Scegli esercizio</p>
        {#if availableExercises.length === 0}
          <p style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">Nessun esercizio disponibile.</p>
          <button class="btn primary" onclick={() => goto('/esercizi/new/')}>Crea esercizio</button>
        {:else}
          {#each availableExercises as ex (ex.id)}
            <button class="day-chip" onclick={() => add(ex.id)}>{ex.name}</button>
          {/each}
        {/if}
        <button class="btn ghost" onclick={() => pickerOpen = false} style="margin-top: 12px;">Annulla</button>
      </div>
    {/if}

    <button class="btn primary" onclick={startWorkout} disabled={exercisesInDay.length === 0} style="margin-top: 24px;">
      Inizia seduta
    </button>
    <button class="btn danger" onclick={deleteDay} style="margin-top: 12px;">Elimina giorno</button>
  {/if}
</div>

<style>
  .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
  .card-menu { padding: 6px; color: var(--ink-3); }
  .btn { padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; width: 100%; }
  .btn.primary { background: var(--ink); color: white; }
  .btn.ghost { background: var(--bg-elev); color: var(--ink); border: 1px dashed var(--line-strong); }
  .btn.danger { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
</style>
