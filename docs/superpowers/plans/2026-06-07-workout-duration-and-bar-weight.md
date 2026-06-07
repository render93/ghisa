# Workout Duration + Bar Weight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Salvare/mostrare la durata totale di ogni seduta, e supportare per-esercizio un peso del bilanciere che concorre al totale ma è esente dall'arrotondamento dischi.

**Architecture:** Due milestone indipendenti. M1 aggiunge `workouts.duration_sec` e calcola la durata wall-clock alla conferma. M2 tiene il motore di progressione interamente in "spazio dischi" (nessuna modifica matematica) e somma il bilanciere solo a video; il bilanciere viene snapshottato nel JSON `prescribed` di ogni entry (via campo `Prescription.barWeight`) per uno storico immutabile.

**Tech Stack:** SvelteKit 2 · Svelte 5 runes · TypeScript · Vitest · `@supabase/supabase-js` (client tipizzato con `Database`).

**Branch:** tutto su `feature/workout-duration-and-bar-weight`. Aggiungi il trailer `Co-Authored-By` ai commit come da istruzioni del repo. **Mai committare su `main`.**

**Nota migration:** le migration SQL si applicano a mano nell'SQL Editor di Supabase (il repo non le applica in automatico). Il comando canonico per i tipi è
`npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts`,
ma qui il piano edita `database.types.ts` a mano (stesso risultato del regen) così è eseguibile senza accesso al DB. **Il codice compila e i test passano anche prima di applicare la SQL; il runtime corretto richiede però che la SQL sia stata applicata.**

---

## MILESTONE 1 — Durata totale della seduta

### Task 1.1: Migration + tipi DB per `workouts.duration_sec`

**Files:**
- Create: `supabase/migrations/20260607000000_add_duration_sec_to_workouts.sql`
- Modify: `src/lib/database.types.ts` (blocco `workouts`)

- [ ] **Step 1: Crea il file di migration**

```sql
-- Durata totale della seduta in secondi (wall-clock dall'avvio alla conferma).
-- NULL per le sedute saltate (commitSkip) e per quelle pre-feature.
alter table workouts add column duration_sec integer;
```

- [ ] **Step 2: Aggiungi `duration_sec` al `Row` di `workouts` in `database.types.ts`**

Sostituisci (dentro `workouts: { Row: {`):

```ts
          created_at: string
          day_id: string | null
          id: string
```

con:

```ts
          created_at: string
          day_id: string | null
          duration_sec: number | null
          id: string
```

- [ ] **Step 3: Aggiungi `duration_sec` all'`Insert` di `workouts`**

Sostituisci (dentro `workouts: { ... Insert: {`):

```ts
          created_at?: string
          day_id?: string | null
          id?: string
          note?: string | null
          performed_at: string
```

con:

```ts
          created_at?: string
          day_id?: string | null
          duration_sec?: number | null
          id?: string
          note?: string | null
          performed_at: string
```

- [ ] **Step 4: Aggiungi `duration_sec` all'`Update` di `workouts`**

Sostituisci (dentro `workouts: { ... Update: {`):

```ts
          created_at?: string
          day_id?: string | null
          id?: string
          note?: string | null
          performed_at?: string
```

con:

```ts
          created_at?: string
          day_id?: string | null
          duration_sec?: number | null
          id?: string
          note?: string | null
          performed_at?: string
```

- [ ] **Step 5: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260607000000_add_duration_sec_to_workouts.sql src/lib/database.types.ts
git commit -m "feat(db): colonna duration_sec su workouts + tipi"
```

---

### Task 1.2: Helper `fmtDuration` (TDD)

**Files:**
- Create: `src/lib/ui/utils.test.ts`
- Modify: `src/lib/ui/utils.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/lib/ui/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fmtDuration } from './utils';

describe('fmtDuration', () => {
  it('durate sotto l ora come minuti', () => {
    expect(fmtDuration(0)).toBe('0 min');
    expect(fmtDuration(45 * 60)).toBe('45 min');
    expect(fmtDuration(59 * 60 + 29)).toBe('59 min');
  });

  it('durate da un ora in su come Hh Mm', () => {
    expect(fmtDuration(60 * 60)).toBe('1h 0m');
    expect(fmtDuration(83 * 60)).toBe('1h 23m');
    expect(fmtDuration(125 * 60)).toBe('2h 5m');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm test -- src/lib/ui/utils.test.ts`
Expected: FAIL — `fmtDuration` non esportata (`No "fmtDuration" export is defined`).

- [ ] **Step 3: Implementa `fmtDuration`**

In `src/lib/ui/utils.ts`, in fondo al file aggiungi:

```ts
export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npm test -- src/lib/ui/utils.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/utils.ts src/lib/ui/utils.test.ts
git commit -m "feat(ui): helper fmtDuration"
```

---

### Task 1.3: Propaga la durata nello store `workouts`

**Files:**
- Modify: `src/lib/stores/workouts.svelte.ts`

- [ ] **Step 1: Aggiungi `durationSec` al tipo `Workout`**

Sostituisci:

```ts
export type Workout = {
  id: string;
  schedaId: string | null;
  dayId: string | null;
  performedAt: string;
  skipped: boolean;
  note: string | null;
  entries: WorkoutEntryRecord[];
};
```

con:

```ts
export type Workout = {
  id: string;
  schedaId: string | null;
  dayId: string | null;
  performedAt: string;
  durationSec: number | null;
  skipped: boolean;
  note: string | null;
  entries: WorkoutEntryRecord[];
};
```

- [ ] **Step 2: Mappa `duration_sec` in `load()`**

Sostituisci (nel `.map` dentro `load()`):

```ts
      performedAt: w.performed_at as string,
      skipped: w.skipped as boolean,
      note: w.note as string | null,
```

con:

```ts
      performedAt: w.performed_at as string,
      durationSec: (w.duration_sec as number | null) ?? null,
      skipped: w.skipped as boolean,
      note: w.note as string | null,
```

- [ ] **Step 3: Aggiungi il parametro `durationSec` a `commit(...)`**

Sostituisci la firma:

```ts
  async function commit(
    schedaId: string | null,
    dayId: string | null,
    performedAt: string,
    entries: Omit<WorkoutEntryRecord, 'id' | 'workoutId'>[]
  ): Promise<Workout> {
```

con:

```ts
  async function commit(
    schedaId: string | null,
    dayId: string | null,
    performedAt: string,
    durationSec: number,
    entries: Omit<WorkoutEntryRecord, 'id' | 'workoutId'>[]
  ): Promise<Workout> {
```

- [ ] **Step 4: Scrivi `duration_sec` nell'insert di `commit`**

Sostituisci:

```ts
      .insert({
        user_id: user.id,
        scheda_id: schedaId,
        day_id: dayId,
        performed_at: performedAt
      })
```

con:

```ts
      .insert({
        user_id: user.id,
        scheda_id: schedaId,
        day_id: dayId,
        performed_at: performedAt,
        duration_sec: durationSec
      })
```

- [ ] **Step 5: Aggiungi `durationSec` al `newWorkout` di ritorno in `commit`**

Sostituisci:

```ts
    const newWorkout: Workout = {
      id: workoutId,
      schedaId,
      dayId,
      performedAt,
      skipped: (workout.skipped as boolean) ?? false,
```

con:

```ts
    const newWorkout: Workout = {
      id: workoutId,
      schedaId,
      dayId,
      performedAt,
      durationSec,
      skipped: (workout.skipped as boolean) ?? false,
```

- [ ] **Step 6: Aggiungi `durationSec: null` al `newWorkout` di `commitSkip`**

Sostituisci (dentro `commitSkip`):

```ts
    const newWorkout: Workout = {
      id: workout.id as string,
      schedaId,
      dayId,
      performedAt,
      skipped: true,
      note,
      entries: []
    };
```

con:

```ts
    const newWorkout: Workout = {
      id: workout.id as string,
      schedaId,
      dayId,
      performedAt,
      durationSec: null,
      skipped: true,
      note,
      entries: []
    };
```

- [ ] **Step 7: Verifica typecheck**

Run: `npm run check`
Expected: **errori attesi solo in `src/routes/workout/summary/+page.svelte`** (il tipo `Parameters<...>[3]` ora risolve a `durationSec: number` e `commit` richiede 5 argomenti) — verranno risolti nel Task 1.4. **Nessun errore in altri file**; se compaiono errori altrove, correggili prima di proseguire.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/workouts.svelte.ts
git commit -m "feat(workouts): durationSec nello store (commit/load/skip)"
```

---

### Task 1.4: Calcola la durata alla conferma seduta

**Files:**
- Modify: `src/routes/workout/summary/+page.svelte`

- [ ] **Step 1: Aggiorna l'indice del tipo `entries` (commit ha un parametro in più)**

Sostituisci:

```ts
    const entries: Parameters<typeof workoutsStore.commit>[3] = [];
```

con:

```ts
    const entries: Parameters<typeof workoutsStore.commit>[4] = [];
```

- [ ] **Step 2: Calcola `durationSec` e passalo a `commit`**

Sostituisci:

```ts
    try {
      await workoutsStore.commit(draft.schedaId, draft.dayId, draft.date, entries);
      workoutDraftStore.cancel();
      nav('/storico/');
```

con:

```ts
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - new Date(draft.date).getTime()) / 1000)
    );

    try {
      await workoutsStore.commit(draft.schedaId, draft.dayId, draft.date, durationSec, entries);
      workoutDraftStore.cancel();
      nav('/storico/');
```

- [ ] **Step 3: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 4: Commit**

```bash
git add src/routes/workout/summary/+page.svelte
git commit -m "feat(workout): calcola durata wall-clock alla conferma"
```

---

### Task 1.5: Mostra la durata nello storico

**Files:**
- Modify: `src/routes/storico/[id]/+page.svelte`
- Modify: `src/routes/storico/+page.svelte`

- [ ] **Step 1: Importa `fmtDuration` nel dettaglio storico**

In `src/routes/storico/[id]/+page.svelte` sostituisci:

```ts
  import { fmtDate, fmtKg } from '$lib/ui/utils';
```

con:

```ts
  import { fmtDate, fmtKg, fmtDuration } from '$lib/ui/utils';
```

- [ ] **Step 2: Aggiungi la durata al sottotitolo del dettaglio**

Sostituisci:

```svelte
    <p class="view-sub">{workout.skipped ? 'seduta saltata' : `${workout.entries.length} esercizi`}</p>
```

con:

```svelte
    <p class="view-sub">{workout.skipped ? 'seduta saltata' : `${workout.entries.length} esercizi${workout.durationSec != null ? ` · ${fmtDuration(workout.durationSec)}` : ''}`}</p>
```

- [ ] **Step 3: Importa `fmtDuration` nella lista storico**

In `src/routes/storico/+page.svelte` sostituisci:

```ts
  import { fmtDate } from '$lib/ui/utils';
```

con:

```ts
  import { fmtDate, fmtDuration } from '$lib/ui/utils';
```

- [ ] **Step 4: Aggiungi la durata alla riga della lista (ramo non saltato)**

Sostituisci:

```svelte
        <div class="card-sub">{fmtDate(w.performedAt)} · {w.entries.length} esercizi</div>
```

con:

```svelte
        <div class="card-sub">{fmtDate(w.performedAt)} · {w.entries.length} esercizi{w.durationSec != null ? ` · ${fmtDuration(w.durationSec)}` : ''}</div>
```

- [ ] **Step 5: Verifica typecheck + test**

Run: `npm run check && npm test`
Expected: 0 errori, tutti i test verdi.

- [ ] **Step 6: Commit**

```bash
git add src/routes/storico/[id]/+page.svelte src/routes/storico/+page.svelte
git commit -m "feat(storico): mostra durata seduta in dettaglio e lista"
```

---

> ## ✅ FINE MILESTONE 1 — COMPLETATA (2026-06-07)
> Tutti i 5 task implementati via subagent-driven development (implementer + review spec + review qualità per task, più review finale olistica). Commit: `c23b70c` → `e09f5c9`. `npm run check` 0 errori, `npm test` 34/34 verdi.
> **⚠️ Gate runtime:** la migration `supabase/migrations/20260607000000_add_duration_sec_to_workouts.sql` va applicata a mano nell'SQL Editor di Supabase prima che il salvataggio della durata funzioni a runtime (il codice compila e gira anche senza, ma `duration_sec` resterebbe assente sul DB).
> **Verifica runtime suggerita** (dopo aver applicato la SQL): apri l'app, completa una seduta, controlla che durata e storico siano corretti.
> **STOP:** fermarsi per l'ok prima di iniziare la M2.

---

## MILESTONE 2 — Peso bilanciere (esente da arrotondamento)

### Task 2.1: Migration + tipi DB per `exercises.bar_weight`

**Files:**
- Create: `supabase/migrations/20260607000001_add_bar_weight_to_exercises.sql`
- Modify: `src/lib/database.types.ts` (blocco `exercises`)

- [ ] **Step 1: Crea il file di migration**

```sql
-- Peso del bilanciere (kg) per esercizi con bilanciere/base fissa.
-- Concorre al peso totale ma è esente dall'arrotondamento dischi.
-- NULL = nessun bilanciere (trattato come 0).
alter table exercises add column bar_weight numeric;
```

- [ ] **Step 2: Aggiungi `bar_weight` al `Row` di `exercises`**

Sostituisci (prima riga del `Row` di `exercises`):

```ts
        Row: {
          created_at: string
          cycle_failures: number
```

con:

```ts
        Row: {
          bar_weight: number | null
          created_at: string
          cycle_failures: number
```

- [ ] **Step 3: Aggiungi `bar_weight` all'`Insert` di `exercises`**

Sostituisci:

```ts
        Insert: {
          created_at?: string
          cycle_failures?: number
```

con:

```ts
        Insert: {
          bar_weight?: number | null
          created_at?: string
          cycle_failures?: number
```

- [ ] **Step 4: Aggiungi `bar_weight` all'`Update` di `exercises`**

Sostituisci:

```ts
        Update: {
          created_at?: string
          cycle_failures?: number
```

con:

```ts
        Update: {
          bar_weight?: number | null
          created_at?: string
          cycle_failures?: number
```

- [ ] **Step 5: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260607000001_add_bar_weight_to_exercises.sql src/lib/database.types.ts
git commit -m "feat(db): colonna bar_weight su exercises + tipi"
```

---

### Task 2.2: `barWeight` nei tipi dominio + pass-through in `nextPrescription` (TDD)

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/domain/progression.ts`
- Test: `src/lib/domain/progression.test.ts`

- [ ] **Step 1: Aggiungi `barWeight` al tipo `Exercise`**

In `src/lib/domain/types.ts` sostituisci:

```ts
  plateRounding?: number; // override del passo di arrotondamento; assente = default dello schema
```

con:

```ts
  plateRounding?: number; // override del passo di arrotondamento; assente = default dello schema
  barWeight?: number; // peso bilanciere (kg): concorre al totale ma esente da arrotondamento; assente = 0
```

- [ ] **Step 2: Aggiungi `barWeight` al tipo `Prescription`**

Sostituisci:

```ts
export type Prescription = {
  sets: number;
  reps: number;
  load: number;
  week?: number;
  cycle?: number;
  isDeload?: boolean;
  consecutiveFails?: number;
};
```

con:

```ts
export type Prescription = {
  sets: number;
  reps: number;
  load: number; // peso dischi (lo step di arrotondamento si applica qui)
  barWeight?: number; // snapshot del peso bilanciere al momento della prescrizione; totale = load + barWeight
  week?: number;
  cycle?: number;
  isDeload?: boolean;
  consecutiveFails?: number;
};
```

- [ ] **Step 3: Scrivi i test che falliscono**

In fondo a `src/lib/domain/progression.test.ts` aggiungi:

```ts
describe('nextPrescription — barWeight pass-through', () => {
  it('wave: barWeight passa intatto e non cambia il carico dischi', () => {
    const noBar = nextPrescription(baseWave(), DEFAULT_SETTINGS);
    const withBar = nextPrescription(baseWave({ barWeight: 20 }), DEFAULT_SETTINGS);
    expect(withBar.load).toBe(noBar.load);
    expect(withBar.barWeight).toBe(20);
  });

  it('linear: barWeight passa intatto e non cambia il carico dischi', () => {
    const noBar = nextPrescription(baseLinear(), DEFAULT_SETTINGS);
    const withBar = nextPrescription(baseLinear({ barWeight: 20 }), DEFAULT_SETTINGS);
    expect(withBar.load).toBe(noBar.load);
    expect(withBar.barWeight).toBe(20);
  });

  it('barWeight default 0 quando l esercizio non lo ha', () => {
    expect(nextPrescription(baseWave(), DEFAULT_SETTINGS).barWeight).toBe(0);
    expect(nextPrescription(baseLinear(), DEFAULT_SETTINGS).barWeight).toBe(0);
  });
});
```

- [ ] **Step 4: Esegui i test e verifica che falliscano**

Run: `npm test -- src/lib/domain/progression.test.ts -t "barWeight pass-through"`
Expected: FAIL — `withBar.barWeight` è `undefined`, atteso `20`/`0`.

- [ ] **Step 5: Aggiungi il pass-through nei tre `return` di `nextPrescription`**

In `src/lib/domain/progression.ts`:

(a) ramo wave deload — sostituisci:

```ts
        load: roundTo(baseLoad * pattern.mult * (settings.deloadLoadPct / 100), effectiveRounding(ex, settings)),
        week,
        cycle,
        isDeload: true
```

con:

```ts
        load: roundTo(baseLoad * pattern.mult * (settings.deloadLoadPct / 100), effectiveRounding(ex, settings)),
        barWeight: ex.barWeight ?? 0,
        week,
        cycle,
        isDeload: true
```

(b) ramo wave normale — sostituisci:

```ts
    return {
      sets: pattern.sets,
      reps: pattern.reps,
      load: roundTo(baseLoad * pattern.mult, effectiveRounding(ex, settings)),
      week,
      cycle,
      isDeload: false
    };
```

con:

```ts
    return {
      sets: pattern.sets,
      reps: pattern.reps,
      load: roundTo(baseLoad * pattern.mult, effectiveRounding(ex, settings)),
      barWeight: ex.barWeight ?? 0,
      week,
      cycle,
      isDeload: false
    };
```

(c) ramo linear — sostituisci:

```ts
  // linear
  return {
    sets: ex.linearTargetSets ?? 0,
    reps: ex.linearTargetReps ?? 0,
    load: ex.linearCurrentLoad ?? 0,
    consecutiveFails: ex.linearConsecutiveFailures ?? 0
  };
```

con:

```ts
  // linear
  return {
    sets: ex.linearTargetSets ?? 0,
    reps: ex.linearTargetReps ?? 0,
    load: ex.linearCurrentLoad ?? 0,
    barWeight: ex.barWeight ?? 0,
    consecutiveFails: ex.linearConsecutiveFailures ?? 0
  };
```

- [ ] **Step 6: Esegui l'intera suite e verifica che passi**

Run: `npm test -- src/lib/domain/progression.test.ts`
Expected: PASS — i nuovi test verdi e **tutti gli esistenti ancora verdi** (usano `toMatchObject`, quindi il campo extra non li rompe).

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(progression): barWeight pass-through in nextPrescription"
```

---

### Task 2.3: Mapping `bar_weight` nello store `exercises`

**Files:**
- Modify: `src/lib/stores/exercises.svelte.ts`

- [ ] **Step 1: Aggiungi `bar_weight` al tipo `DbExercise`**

Sostituisci:

```ts
  rest_seconds: number;
  plate_rounding: number | null;
  linear_increment_steps: number | null;
```

con:

```ts
  rest_seconds: number;
  plate_rounding: number | null;
  bar_weight: number | null;
  linear_increment_steps: number | null;
```

- [ ] **Step 2: Mappa `bar_weight` → `barWeight` in `dbToDomain`**

Sostituisci:

```ts
    plateRounding: row.plate_rounding ?? undefined,
    linearIncrementSteps: row.linear_increment_steps ?? undefined,
```

con:

```ts
    plateRounding: row.plate_rounding ?? undefined,
    barWeight: row.bar_weight ?? undefined,
    linearIncrementSteps: row.linear_increment_steps ?? undefined,
```

- [ ] **Step 3: Mappa `barWeight` → `bar_weight` in `domainToDb`**

Sostituisci:

```ts
    plate_rounding: ex.plateRounding ?? null,
    linear_increment_steps: ex.linearIncrementSteps ?? null,
```

con:

```ts
    plate_rounding: ex.plateRounding ?? null,
    bar_weight: ex.barWeight ?? null,
    linear_increment_steps: ex.linearIncrementSteps ?? null,
```

- [ ] **Step 4: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/exercises.svelte.ts
git commit -m "feat(exercises): mapping bar_weight nello store"
```

---

### Task 2.4: Campo "Peso bilanciere" nel form esercizio

**Files:**
- Modify: `src/lib/ui/ExerciseForm.svelte`

- [ ] **Step 1: Aggiungi lo state `barWeight`**

Sostituisci:

```ts
  let plateRounding = $state<number | undefined>(exercise.plateRounding);
  let linearIncrementSteps = $state<number | undefined>(exercise.linearIncrementSteps);
```

con:

```ts
  let plateRounding = $state<number | undefined>(exercise.plateRounding);
  let barWeight = $state<number | undefined>(exercise.barWeight);
  let linearIncrementSteps = $state<number | undefined>(exercise.linearIncrementSteps);
```

- [ ] **Step 2: Includi `barWeight` nell'oggetto `base` di `submit`**

Sostituisci:

```ts
    const base: Omit<Exercise, 'id'> = {
      name: name.trim(),
      scheme,
      restSeconds,
      plateRounding: plateRounding && plateRounding > 0 ? plateRounding : undefined
    };
```

con:

```ts
    const base: Omit<Exercise, 'id'> = {
      name: name.trim(),
      scheme,
      restSeconds,
      plateRounding: plateRounding && plateRounding > 0 ? plateRounding : undefined,
      barWeight: barWeight && barWeight > 0 ? barWeight : undefined
    };
```

- [ ] **Step 3: Aggiungi il campo nel form (dopo "Arrotondamento dischi")**

Sostituisci:

```svelte
  <label>
    Arrotondamento dischi (vuoto = default schema)
    <input type="number" min="0" step="0.25" placeholder={String(stepValue)} bind:value={plateRounding} />
  </label>
```

con:

```svelte
  <label>
    Arrotondamento dischi (vuoto = default schema)
    <input type="number" min="0" step="0.25" placeholder={String(stepValue)} bind:value={plateRounding} />
  </label>

  <label>
    Peso bilanciere {settingsStore.data.weightUnit} (vuoto = nessuno)
    <input type="number" min="0" step="0.5" placeholder="0" bind:value={barWeight} />
  </label>
```

- [ ] **Step 4: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/ExerciseForm.svelte
git commit -m "feat(esercizi): campo peso bilanciere nel form"
```

---

### Task 2.5: Totale (dischi + bar) nella schermata seduta

**Files:**
- Modify: `src/routes/workout/new/+page.svelte`

- [ ] **Step 1: Aggiungi un derived `bar` nello script**

Sostituisci:

```ts
  const currentExercise = $derived(
    currentEntry ? exercisesStore.getById(currentEntry.exerciseId) : undefined
  );
```

con:

```ts
  const currentExercise = $derived(
    currentEntry ? exercisesStore.getById(currentEntry.exerciseId) : undefined
  );
  const bar = $derived(currentEntry?.prescribed.barWeight ?? 0);
```

- [ ] **Step 2: Mostra il totale come numero primario nel target**

Sostituisci:

```svelte
      <div class="prescription" style="font-size: 14px; color: var(--ink-2);">
        Target: <strong>{currentEntry.prescribed.sets}×{currentEntry.prescribed.reps}</strong>
        @ <strong>{fmtKg(currentEntry.prescribed.load)} {settingsStore.data.weightUnit}</strong>
        {#if currentEntry.prescribed.isDeload}<span class="card-badge deload">DELOAD</span>{/if}
      </div>
```

con:

```svelte
      <div class="prescription" style="font-size: 14px; color: var(--ink-2);">
        Target: <strong>{currentEntry.prescribed.sets}×{currentEntry.prescribed.reps}</strong>
        @ <strong>{fmtKg(currentEntry.prescribed.load + bar)} {settingsStore.data.weightUnit}</strong>
        {#if currentEntry.prescribed.isDeload}<span class="card-badge deload">DELOAD</span>{/if}
        {#if bar > 0}<span class="bar-note">{fmtKg(currentEntry.prescribed.load)} dischi + {fmtKg(bar)} bar</span>{/if}
      </div>
```

- [ ] **Step 3: Mostra/edita il totale nell'input KG (salva i dischi)**

Sostituisci:

```svelte
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
```

con:

```svelte
          <label class="field">
            <span class="field-label">KG{#if bar > 0} (tot){/if}</span>
            <input
              type="number"
              min="0"
              step={effectiveRounding(currentExercise, settingsStore.data)}
              value={set.load + bar}
              disabled={closed}
              oninput={(e) => updateLoad(i, Math.max(0, +(e.currentTarget as HTMLInputElement).value - bar))}
            />
          </label>
```

- [ ] **Step 4: Aggiungi lo stile `.bar-note`**

Sostituisci (dentro il blocco `<style>`, in cima):

```svelte
<style>
  .set-row {
```

con:

```svelte
<style>
  .bar-note {
    display: block;
    margin-top: 4px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
  }
  .set-row {
```

- [ ] **Step 5: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add src/routes/workout/new/+page.svelte
git commit -m "feat(workout): totale dischi+bar in target e log seduta"
```

---

### Task 2.6: Totale nel riepilogo seduta

**Files:**
- Modify: `src/routes/workout/summary/+page.svelte`

- [ ] **Step 1: Aggiungi un `@const bar` nel loop esercizi**

Sostituisci:

```svelte
    {#each draft.exercises as de (de.exerciseId)}
      {@const ex = exercisesStore.getById(de.exerciseId)}
      {@const entry = entryFromDraft(de)}
```

con:

```svelte
    {#each draft.exercises as de (de.exerciseId)}
      {@const ex = exercisesStore.getById(de.exerciseId)}
      {@const entry = entryFromDraft(de)}
      {@const bar = entry.prescribed.barWeight ?? 0}
```

- [ ] **Step 2: Mostra il totale nel `card-sub`**

Sostituisci:

```svelte
        <div class="card-sub">
          {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load)}
          {settingsStore.data.weightUnit}
        </div>
```

con:

```svelte
        <div class="card-sub">
          {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load + bar)}
          {settingsStore.data.weightUnit}{#if bar > 0} · {fmtKg(entry.prescribed.load)} dischi{/if}
        </div>
```

- [ ] **Step 3: Verifica typecheck**

Run: `npm run check`
Expected: 0 errori.

- [ ] **Step 4: Commit**

```bash
git add src/routes/workout/summary/+page.svelte
git commit -m "feat(workout): totale dischi+bar nel riepilogo"
```

---

### Task 2.7: Totale nel dettaglio storico

**Files:**
- Modify: `src/routes/storico/[id]/+page.svelte`

- [ ] **Step 1: Aggiungi un `@const bar` nel loop entries**

Sostituisci:

```svelte
      {#each workout.entries as entry (entry.id)}
        {@const ex = exercisesStore.getById(entry.exerciseId)}
        <div class="card">
```

con:

```svelte
      {#each workout.entries as entry (entry.id)}
        {@const ex = exercisesStore.getById(entry.exerciseId)}
        {@const bar = entry.prescribed.barWeight ?? 0}
        <div class="card">
```

- [ ] **Step 2: Mostra il totale nel `card-sub`**

Sostituisci:

```svelte
          <div class="card-sub">
            {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load)} {settingsStore.data.weightUnit}
            {#if entry.isDeloadSession}<span class="badge deload">DELOAD</span>{/if}
            {#if entry.skipped}<span class="badge skip">saltato</span>{/if}
          </div>
```

con:

```svelte
          <div class="card-sub">
            {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load + bar)} {settingsStore.data.weightUnit}{#if bar > 0} · {fmtKg(entry.prescribed.load)} dischi{/if}
            {#if entry.isDeloadSession}<span class="badge deload">DELOAD</span>{/if}
            {#if entry.skipped}<span class="badge skip">saltato</span>{/if}
          </div>
```

- [ ] **Step 3: Mostra il totale nelle righe per-set**

Sostituisci:

```svelte
                  <span>{s.reps} × {fmtKg(s.load)}</span>
```

con:

```svelte
                  <span>{s.reps} × {fmtKg(s.load + bar)}</span>
```

- [ ] **Step 4: Verifica typecheck + intera suite test**

Run: `npm run check && npm test`
Expected: 0 errori, tutti i test verdi.

- [ ] **Step 5: Commit**

```bash
git add src/routes/storico/[id]/+page.svelte
git commit -m "feat(storico): totale dischi+bar nel dettaglio seduta"
```

---

> ## ✅ FINE MILESTONE 2 — COMPLETATA (2026-06-07)
> Tutti i 7 task implementati via subagent-driven development (implementer + review spec + review qualità per task, più review finale olistica). Commit: `9031a1e` → `6b859db`. `npm run check` 0 errori, `npm test` 38/38 verdi. Invarianti verificati: integrità "plate-space" (i carichi salvati restano peso dischi; il bilanciere è solo sommato a video e sottratto in input), nessuna modifica alla matematica di progressione, snapshot del bilanciere in `prescribed` per storico immutabile, round-trip DB↔dominio↔form.
> **⚠️ Gate runtime:** la migration `supabase/migrations/20260607000001_add_bar_weight_to_exercises.sql` va applicata a mano nell'SQL Editor di Supabase (oltre a quella di M1).
> **Verifica runtime** (richiede entrambe le SQL applicate): crea un esercizio con peso bilanciere, esegui una seduta, controlla che target/log/riepilogo/storico mostrino il totale corretto e che i dischi avanzino come prima.
>
> **🔎 Gap emerso in review (fuori scope del piano) — RISOLTO 2026-06-07:** `src/routes/esercizi/+page.svelte` mostrava `fmtKg(p.load)` (solo dischi) dalla `nextPrescription`. Per esercizi con bilanciere la lista esercizi (riferimento principale del "prossimo target") mostrava il solo peso dischi mentre seduta/riepilogo/storico mostrano il totale → incoerenza. Risolto con `fmtKg(p.load + (p.barWeight ?? 0))` (totale, coerente con le altre schermate; scelta utente: totale senza breakdown).

---

## Riepilogo file toccati

**Milestone 1:**
- `supabase/migrations/20260607000000_add_duration_sec_to_workouts.sql` (create)
- `src/lib/database.types.ts` (workouts)
- `src/lib/ui/utils.ts` + `src/lib/ui/utils.test.ts`
- `src/lib/stores/workouts.svelte.ts`
- `src/routes/workout/summary/+page.svelte`
- `src/routes/storico/[id]/+page.svelte`, `src/routes/storico/+page.svelte`

**Milestone 2:**
- `supabase/migrations/20260607000001_add_bar_weight_to_exercises.sql` (create)
- `src/lib/database.types.ts` (exercises)
- `src/lib/domain/types.ts`, `src/lib/domain/progression.ts`, `src/lib/domain/progression.test.ts`
- `src/lib/stores/exercises.svelte.ts`
- `src/lib/ui/ExerciseForm.svelte`
- `src/routes/workout/new/+page.svelte`, `src/routes/workout/summary/+page.svelte`
- `src/routes/storico/[id]/+page.svelte`

## Stato milestone
- [x] Milestone 1 — Durata totale ✅ completata 2026-06-07 (commit `c23b70c` → `e09f5c9`); migration SQL da applicare a mano in Supabase
- [x] Milestone 2 — Peso bilanciere ✅ completata 2026-06-07 (commit `9031a1e` → `6b859db`); migration SQL da applicare a mano in Supabase. Nota: gap fuori-scope sulla lista esercizi (vedi callout FINE MILESTONE 2)
