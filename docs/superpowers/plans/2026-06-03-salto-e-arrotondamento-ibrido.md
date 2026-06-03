# Salto allenamento + Arrotondamento ibrido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere (B) arrotondamento dischi differenziato per schema con override per esercizio, e (A) la registrazione del salto di sedute intere e singoli esercizi, senza effetti sui pesi.

**Architecture:** Due milestone indipendenti. B tocca il layer dominio (funzione pura `effectiveRounding`), Settings (JSONB, no SQL) ed Exercise (1 colonna SQL). A riusa le tabelle `workouts`/`workout_entries` con flag `skipped` (no progressione: per costruzione non si invoca `applyEntryResult`). Le funzioni di progressione non cambiano per il salto.

**Tech Stack:** SvelteKit 2 · Svelte 5 (runes) · TypeScript · Vitest · Supabase (`@supabase/supabase-js`).

**Ordine:** prima **Milestone B**, poi **STOP per ok utente**, poi **Milestone A**. Ogni milestone produce software funzionante e testabile.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-03-salto-e-arrotondamento-ibrido-design.md`

---

## Stato esecuzione

> Aggiornato: 2026-06-03

- **Milestone B — Arrotondamento ibrido: ✅ CHIUSA.** Implementata in subagent-driven sul branch `app`, commit `bff6f31`..`1e6c181` (7 commit). `npm run check` = 0 errori, `npm test` = 29/29 verdi. La migration `20260603000000_add_plate_rounding_to_exercises.sql` è stata **applicata a mano dall'utente** su Supabase (verificato a runtime: creazione/modifica esercizi OK).
  - ⚠️ **Bug noto emerso in collaudo, NON bloccante per la Milestone A:** override di arrotondamento per-esercizio e incremento lineare globale sono disaccoppiati → un esercizio lineare può restare bloccato (o saltare troppo). Dettagli, riproduzione e opzioni di fix in `docs/superpowers/specs/2026-06-03-known-issue-linear-increment-rounding.md`. Richiede brainstorming/spec a parte; **non** va affrontato dentro la Milestone A.
- **Milestone A — Salto allenamento: ✅ CHIUSA (codice).** Implementata in executing-plans sul branch `app`, commit `ae804d2`..`55ca038` (8 commit, A0→A7). `npm run check` = 0 errori (9 warning preesistenti in `ExerciseForm.svelte`/`tsconfig`, non introdotti qui), `npm test` = 29/29 verdi.
  - ⚠️ **SQL DA APPLICARE A MANO:** la migration `20260603000001_add_skip_columns.sql` **non** è ancora stata eseguita su Supabase. `database.types.ts` è stato allineato a mano (come per B0), ma le colonne `workouts.skipped`/`workouts.note`/`workout_entries.skipped` **non esistono ancora sul DB** → il salto fallirà a runtime finché l'utente non esegue la SQL nello SQL Editor. Step in A0/Step 2.
  - La Milestone A è rimasta **indipendente** dall'arrotondamento/incremento: il motore di progressione (`progression.ts`) **non è stato toccato**; il bug noto del rounding lineare resta invariato e fuori scope.
  - Modello dati: `workouts`/`workout_entries` con flag `skipped` + `note`. Verifica manuale a runtime (browser) ancora da fare dall'utente dopo l'applicazione della SQL.

**Convenzioni progetto rilevanti:**
- Stringhe UI in italiano, concise, minuscole.
- `npm run check` = `svelte-kit sync && svelte-check` (usare sempre questo localmente).
- `npm test` = Vitest una volta.
- Le migration SQL si applicano **a mano** nello SQL Editor di Supabase; poi si rigenera `src/lib/database.types.ts`.
- `trailingSlash = 'always'` → ogni `nav()`/`goto()` con slash finale.

---

# MILESTONE B — Arrotondamento ibrido

## File coinvolti

- Create: `supabase/migrations/20260603000000_add_plate_rounding_to_exercises.sql`
- Modify: `src/lib/domain/types.ts` (Settings, Exercise, DEFAULT_SETTINGS)
- Modify: `src/lib/domain/progression.ts` (nuova `effectiveRounding`, sostituzione `roundTo`)
- Modify: `src/lib/domain/progression.test.ts` (nuovi test + 2 expectation aggiornate)
- Modify: `src/lib/stores/exercises.svelte.ts` (mapping `plate_rounding`)
- Modify: `src/lib/database.types.ts` (rigenerato)
- Modify: `src/routes/impostazioni/+page.svelte` (2 campi al posto di 1)
- Modify: `src/lib/ui/ExerciseForm.svelte` (campo override + step dinamico)
- Modify: `src/routes/workout/new/+page.svelte` (step dinamico)

---

## Task B0: Migration colonna `plate_rounding` su `exercises`

**Files:**
- Create: `supabase/migrations/20260603000000_add_plate_rounding_to_exercises.sql`
- Modify: `src/lib/database.types.ts`

> **Nota esecuzione:** l'applicazione del SQL sul DB Supabase (SQL Editor) è un passo **manuale dell'utente**, fatto separatamente prima dell'uso a runtime. In questo task il file SQL viene creato e `database.types.ts` viene allineato **a mano** alle colonne previste, così build e test restano verdi. Quando l'utente rilancerà `npx supabase gen types`, l'output reale combacerà con questi tipi.

- [ ] **Step 1: Creare il file di migration**

`supabase/migrations/20260603000000_add_plate_rounding_to_exercises.sql`:
```sql
-- Override opzionale del passo di arrotondamento dischi, per singolo esercizio.
-- NULL = usa il default dello schema (settings.plateRoundingWave / plateRoundingLinear).
alter table exercises add column plate_rounding numeric;
```

- [ ] **Step 2: Allineare `database.types.ts`**

In `src/lib/database.types.ts`, dentro `exercises`, aggiungere (in ordine alfabetico, dopo `linear_target_sets`):
- in `Row`: `plate_rounding: number | null`
- in `Insert`: `plate_rounding?: number | null`
- in `Update`: `plate_rounding?: number | null`

- [ ] **Step 3: Type-check**

Run: `npm run check`
Atteso: nessun errore introdotto da questa modifica.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603000000_add_plate_rounding_to_exercises.sql src/lib/database.types.ts
git commit -m "feat(db): add plate_rounding column to exercises"
```

---

## Task B1: `effectiveRounding` + split `plateRounding` per schema (dominio)

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/domain/progression.ts`
- Test: `src/lib/domain/progression.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

In coda a `src/lib/domain/progression.test.ts` aggiungere:
```ts
import { effectiveRounding } from './progression';

describe('effectiveRounding', () => {
  it('esercizio wave senza override usa plateRoundingWave', () => {
    expect(effectiveRounding(baseWave(), DEFAULT_SETTINGS)).toBe(2.5);
  });

  it('esercizio linear senza override usa plateRoundingLinear', () => {
    expect(effectiveRounding(baseLinear(), DEFAULT_SETTINGS)).toBe(2);
  });

  it('override per-esercizio ha precedenza sul default dello schema', () => {
    expect(effectiveRounding(baseWave({ plateRounding: 1.25 }), DEFAULT_SETTINGS)).toBe(1.25);
    expect(effectiveRounding(baseLinear({ plateRounding: 5 }), DEFAULT_SETTINGS)).toBe(5);
  });
});

describe('applyEntryResult — arrotondamento override', () => {
  const allOkB1 = (p: { sets: number; reps: number; load: number }): Entry => ({
    prescribed: p,
    actualSets: Array.from({ length: p.sets }, () => ({ status: 'ok' as const, reps: p.reps, load: p.load }))
  });

  it('reset wave usa il rounding override dell esercizio', () => {
    const ex = baseWave({ waveBaseLoad: 100, waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 3, plateRounding: 4 });
    const result = applyEntryResult(ex, allOkB1({ sets: 8, reps: 3, load: 120 }), null, DEFAULT_SETTINGS);
    // 100 * 0.95 = 95, arrotondato a step 4 → 96
    expect(result.updatedExercise.waveBaseLoad).toBe(96);
  });
});
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npm test -- src/lib/domain/progression.test.ts`
Atteso: FAIL — `effectiveRounding` non esiste (errore di import/compile).

- [ ] **Step 3: Aggiornare i tipi in `types.ts`**

In `src/lib/domain/types.ts`, nel tipo `Settings` sostituire la riga `plateRounding: number;` con:
```ts
  plateRoundingWave: number;
  plateRoundingLinear: number;
```
Nel tipo `Exercise`, dopo `restSeconds: number;` aggiungere:
```ts
  plateRounding?: number; // override del passo di arrotondamento; assente = default dello schema
```
In `DEFAULT_SETTINGS` sostituire `plateRounding: 2.5,` con:
```ts
  plateRoundingWave: 2.5,
  plateRoundingLinear: 2,
```

- [ ] **Step 4: Aggiungere `effectiveRounding` e sostituire gli usi in `progression.ts`**

In `src/lib/domain/progression.ts`, dopo la funzione `roundTo` (riga ~14) aggiungere:
```ts
export function effectiveRounding(ex: Exercise, settings: Settings): number {
  return (
    ex.plateRounding ??
    (ex.scheme === 'wave' ? settings.plateRoundingWave : settings.plateRoundingLinear)
  );
}
```
Poi sostituire i **6** usi di `settings.plateRounding` con `effectiveRounding(ex, settings)`:
- riga ~27 (deload load): `roundTo(baseLoad * pattern.mult * (settings.deloadLoadPct / 100), effectiveRounding(ex, settings))`
- riga ~36 (load normale wave): `roundTo(baseLoad * pattern.mult, effectiveRounding(ex, settings))`
- riga ~83/85 (linear advance): secondo argomento → `effectiveRounding(ex, settings)`
- riga ~95/97 (linear deload): secondo argomento → `effectiveRounding(ex, settings)`
- riga ~134 (reset base wave): secondo argomento → `effectiveRounding(ex, settings)`

Verificare con una ricerca che non resti alcun `settings.plateRounding`:
```bash
grep -n "settings.plateRounding" src/lib/domain/progression.ts
```
Atteso: nessun risultato.

- [ ] **Step 5: Aggiornare le 2 expectation linear esistenti**

Il default `plateRoundingLinear` è ora `2` (prima era 2.5 globale). In `progression.test.ts`:

Nel test `'all sets ok at target reps → advance load by linearIncrementKg'`:
```ts
    // 60 + 2.5 = 62.5, arrotondato a step 2 → 62
    expect(result.updatedExercise.linearCurrentLoad).toBe(62);
```
Nel test `'two consecutive fails → linear-deload, reset counter'`:
```ts
    // 60 * (1 - 10/100) = 54, arrotondato a step 2 → 54
    expect(result.updatedExercise.linearCurrentLoad).toBe(54);
```

- [ ] **Step 6: Eseguire i test per vederli passare**

Run: `npm test -- src/lib/domain/progression.test.ts`
Atteso: PASS (tutti, comprese le suite wave preesistenti che usano `plateRoundingWave: 2.5`).

- [ ] **Step 7: Type-check**

Run: `npm run check`
Atteso: 0 errori. (Le UI che usavano `settings.plateRounding` verranno aggiornate nei task B3–B5; se `check` segnala lì degli errori è atteso e li chiudiamo nei prossimi task — ma per non lasciare il branch rotto, procedere subito con B3–B5 prima di considerare la milestone conclusa.)

> Nota: `ExerciseForm.svelte` (riga 69, 74) e `workout/new/+page.svelte` (riga 112) e `impostazioni/+page.svelte` referenziano ancora `plateRounding`. `svelte-check` segnalerà questi 3 punti finché B3–B5 non sono fatti. È previsto.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(domain): per-scheme + per-exercise plate rounding via effectiveRounding"
```

---

## Task B2: Mapping `plate_rounding` nello store esercizi

**Files:**
- Modify: `src/lib/stores/exercises.svelte.ts`

- [ ] **Step 1: Estendere `DbExercise`**

In `src/lib/stores/exercises.svelte.ts`, nel tipo `DbExercise` aggiungere dopo `rest_seconds: number;`:
```ts
  plate_rounding: number | null;
```

- [ ] **Step 2: Aggiornare `dbToDomain`**

Dopo `restSeconds: row.rest_seconds,` aggiungere:
```ts
    plateRounding: row.plate_rounding ?? undefined,
```

- [ ] **Step 3: Aggiornare `domainToDb`**

Dopo `rest_seconds: ex.restSeconds,` aggiungere:
```ts
    plate_rounding: ex.plateRounding ?? null,
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Atteso: nessun nuovo errore in `exercises.svelte.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/exercises.svelte.ts
git commit -m "feat(store): persist exercise plate_rounding override"
```

---

## Task B3: Impostazioni — due campi di arrotondamento

**Files:**
- Modify: `src/routes/impostazioni/+page.svelte`

- [ ] **Step 1: Aggiornare l'oggetto `HELP`**

In `src/routes/impostazioni/+page.svelte`, sostituire la riga `plateRounding: ...` con:
```ts
    plateRoundingWave: 'Passo di arrotondamento per gli esercizi wave (es. 2.5 = dischi da 1.25 kg per lato).',
    plateRoundingLinear: 'Passo di arrotondamento per gli esercizi linear (es. 2 = manubri con step da 2 kg).',
```

- [ ] **Step 2: Rimuovere il campo da "Generale"**

Eliminare l'intero blocco `<div class="field">` del campo `f-plateRounding` (le righe con `label for="f-plateRounding"`, `helpIcon('plateRounding')`, l'`<input id="f-plateRounding" ...>` e `helpText('plateRounding')`).

- [ ] **Step 3: Aggiungere il campo wave nella card "Wave"**

Nella card Wave (subito dopo `<h3 ...>Wave</h3>`), come primo `<div class="field">`:
```svelte
    <div class="field">
      <div class="field-head">
        <label for="f-plateRoundingWave">Arrotondamento dischi</label>
        {@render helpIcon('plateRoundingWave')}
      </div>
      <input id="f-plateRoundingWave" type="number" bind:value={editing.plateRoundingWave} step="0.5" min="0.5" />
      {@render helpText('plateRoundingWave')}
    </div>
```

- [ ] **Step 4: Aggiungere il campo linear nella card "Linear"**

Nella card Linear (subito dopo `<h3 ...>Linear</h3>`), come primo `<div class="field">`:
```svelte
    <div class="field">
      <div class="field-head">
        <label for="f-plateRoundingLinear">Arrotondamento dischi</label>
        {@render helpIcon('plateRoundingLinear')}
      </div>
      <input id="f-plateRoundingLinear" type="number" bind:value={editing.plateRoundingLinear} step="0.5" min="0.5" />
      {@render helpText('plateRoundingLinear')}
    </div>
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Atteso: nessun errore relativo a `impostazioni/+page.svelte`.

- [ ] **Step 6: Verifica manuale**

Run: `npm run dev` → aprire `/impostazioni/`. Verificare: nessun campo arrotondamento in "Generale"; un campo "Arrotondamento dischi" in Wave e uno in Linear; salvataggio OK; ricaricando la pagina i valori persistono.

- [ ] **Step 7: Commit**

```bash
git add src/routes/impostazioni/+page.svelte
git commit -m "feat(settings): split plate rounding into wave/linear fields"
```

---

## Task B4: ExerciseForm — campo override + step dinamico

**Files:**
- Modify: `src/lib/ui/ExerciseForm.svelte`

- [ ] **Step 1: Stato del campo + step effettivo**

In `<script>` di `src/lib/ui/ExerciseForm.svelte`, dopo `let linearTargetReps = ...`:
```ts
  let plateRounding = $state<number | undefined>(exercise.plateRounding);
  const stepValue = $derived(
    plateRounding && plateRounding > 0
      ? plateRounding
      : scheme === 'wave'
        ? settingsStore.data.plateRoundingWave
        : settingsStore.data.plateRoundingLinear
  );
```

- [ ] **Step 2: Includere `plateRounding` nel salvataggio**

Nel `submit`, estendere `base`:
```ts
    const base: Omit<Exercise, 'id'> = {
      name: name.trim(),
      scheme,
      restSeconds,
      plateRounding: plateRounding && plateRounding > 0 ? plateRounding : undefined
    };
```

- [ ] **Step 3: Usare `stepValue` negli input carico**

Sostituire `step={settingsStore.data.plateRounding}` con `step={stepValue}` in **entrambi** gli input (carico base wave e carico iniziale linear).

- [ ] **Step 4: Aggiungere il campo override nel form**

Subito prima del `<div class="actions">` finale:
```svelte
  <label>
    Arrotondamento dischi (vuoto = default schema)
    <input type="number" min="0" step="0.25" placeholder={String(stepValue)} bind:value={plateRounding} />
  </label>
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Atteso: nessun errore in `ExerciseForm.svelte`.

- [ ] **Step 6: Verifica manuale**

`npm run dev` → creare/modificare un esercizio: lasciando vuoto il campo, lo `step` dell'input carico riflette il default dello schema (wave 2.5 / linear 2); impostando un valore (es. 1.25) lo `step` cambia di conseguenza; salvando e riaprendo, il valore persiste.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/ExerciseForm.svelte
git commit -m "feat(exercise): optional per-exercise plate rounding override"
```

---

## Task B5: workout/new — step dinamico per esercizio corrente

**Files:**
- Modify: `src/routes/workout/new/+page.svelte`

- [ ] **Step 1: Importare `effectiveRounding`**

Modificare l'import da `progression`:
```ts
  import { nextPrescription, effectiveRounding } from '$lib/domain/progression';
```

- [ ] **Step 2: Usare il rounding effettivo per lo step KG**

Sostituire `step={settingsStore.data.plateRounding}` (riga ~112) con:
```svelte
            step={effectiveRounding(currentExercise, settingsStore.data)}
```
(`currentExercise` è già garantito non-null dentro il blocco `{:else}`/`{#if ... currentExercise}`.)

- [ ] **Step 3: Type-check**

Run: `npm run check`
Atteso: 0 errori in tutto il progetto (chiude i 3 punti segnalati in B1/Step 7).

- [ ] **Step 4: Full test + verifica manuale**

Run: `npm test`
Atteso: PASS.
`npm run dev` → avviare una seduta: lo `step` dell'input KG riflette il rounding dell'esercizio (override o default schema).

- [ ] **Step 5: Commit**

```bash
git add src/routes/workout/new/+page.svelte
git commit -m "feat(workout): use effective plate rounding for load input step"
```

---

## ✅ CHECKPOINT FINE MILESTONE B — CHIUSA (2026-06-03)

Completata: commit `bff6f31`..`1e6c181`, `npm run check` 0 errori, `npm test` 29/29, SQL applicata dall'utente. Bug noto registrato in `docs/superpowers/specs/2026-06-03-known-issue-linear-increment-rounding.md` (fuori scope qui). Procedere con la Milestone A.

---

# MILESTONE A — Salto allenamento

## File coinvolti

- Create: `supabase/migrations/20260603000001_add_skip_columns.sql`
- Modify: `src/lib/database.types.ts` (rigenerato)
- Modify: `src/lib/stores/workouts.svelte.ts` (tipi, mapping, `commitSkip`)
- Modify: `src/lib/stores/workout-draft.svelte.ts` (flag `skipped`, `setSkipped`)
- Modify: `src/routes/workout/new/+page.svelte` (toggle salta esercizio)
- Modify: `src/routes/workout/summary/+page.svelte` (badge + commit salta)
- Modify: `src/routes/schede/[id]/days/[dayId]/+page.svelte` (pannello salta seduta)
- Modify: `src/routes/storico/+page.svelte` (badge in lista)
- Modify: `src/routes/storico/[id]/+page.svelte` (dettaglio salto)

---

## Task A0: Migration colonne di salto

**Files:**
- Create: `supabase/migrations/20260603000001_add_skip_columns.sql`
- Modify (manuale): `src/lib/database.types.ts`

- [ ] **Step 1: Creare il file di migration**

`supabase/migrations/20260603000001_add_skip_columns.sql`:
```sql
-- Salto di un'intera seduta: riga workouts con skipped=true e nessuna entry.
alter table workouts add column skipped boolean not null default false;
alter table workouts add column note text;

-- Salto di un singolo esercizio dentro una seduta svolta.
alter table workout_entries add column skipped boolean not null default false;
```

- [ ] **Step 2: Applicare la migration a mano**

SQL Editor Supabase → eseguire il contenuto dello Step 1. Verificare le colonne `skipped`/`note` su `workouts` e `skipped` su `workout_entries`.

- [ ] **Step 3: Rigenerare i tipi del DB**

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```
(project-ref come in B0/Step 3.)
Atteso: `workouts` ha `skipped: boolean` + `note: string | null`; `workout_entries` ha `skipped: boolean`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603000001_add_skip_columns.sql src/lib/database.types.ts
git commit -m "feat(db): add skip columns to workouts and workout_entries"
```

---

## Task A1: Store workouts — tipi, mapping, `commitSkip`

**Files:**
- Modify: `src/lib/stores/workouts.svelte.ts`

- [ ] **Step 1: Estendere i tipi**

In `WorkoutEntryRecord` aggiungere dopo `isDeloadSession: boolean;`:
```ts
  skipped: boolean;
```
In `Workout` aggiungere dopo `performedAt: string;`:
```ts
  skipped: boolean;
  note: string | null;
```

- [ ] **Step 2: Aggiornare il mapping in `load()`**

Nel mapping delle entry (oggetto `rec`), aggiungere:
```ts
        skipped: e.skipped as boolean,
```
Nel mapping dei workout (`state.items = (workouts || []).map(...)`), aggiungere:
```ts
      skipped: w.skipped as boolean,
      note: w.note as string | null,
```

- [ ] **Step 3: Aggiornare `commit()`**

In `entryRows` (oggetto inserito), aggiungere:
```ts
      skipped: e.skipped,
```
Nel `newWorkout` ritornato, aggiungere dopo `performedAt,`:
```ts
      skipped: (workout.skipped as boolean) ?? false,
      note: (workout.note as string | null) ?? null,
```
e nel mapping delle `insertedEntries` aggiungere:
```ts
        skipped: e.skipped as boolean,
```

- [ ] **Step 4: Aggiungere `commitSkip`**

Dopo la funzione `commit`, aggiungere:
```ts
  async function commitSkip(
    schedaId: string | null,
    dayId: string | null,
    performedAt: string,
    note: string | null
  ): Promise<Workout> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        scheda_id: schedaId,
        day_id: dayId,
        performed_at: performedAt,
        skipped: true,
        note
      })
      .select()
      .single();
    if (error) throw error;

    const newWorkout: Workout = {
      id: workout.id as string,
      schedaId,
      dayId,
      performedAt,
      skipped: true,
      note,
      entries: []
    };
    state.items = [newWorkout, ...state.items];
    return newWorkout;
  }
```
Ed esporlo nel `return { ... }` dello store, dopo `commit,`:
```ts
    commitSkip,
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Atteso: `workouts.svelte.ts` compila. (Atteso un errore in `workout/summary/+page.svelte`: il tipo del parametro `entries` ora richiede `skipped` → chiuso in A4.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/workouts.svelte.ts
git commit -m "feat(store): skipped/note on workouts + commitSkip"
```

---

## Task A2: Store draft — flag `skipped` + `setSkipped`

**Files:**
- Modify: `src/lib/stores/workout-draft.svelte.ts`

- [ ] **Step 1: Estendere `DraftEntry`**

Aggiungere dopo `sets: Entry['actualSets'];`:
```ts
  skipped: boolean;
```

- [ ] **Step 2: Inizializzare in `start()`**

Nell'oggetto ritornato per ogni esercizio (dopo `sets: Array.from(...)`), aggiungere:
```ts
          ,
          skipped: false
```
(ovvero il `return { exerciseId, prescribed, sets, skipped: false }`).

- [ ] **Step 3: Aggiungere `setSkipped`**

Dopo `setSummaryChoice`, aggiungere:
```ts
  function setSkipped(exIdx: number, value: boolean) {
    if (!state.draft) return;
    state.draft.exercises[exIdx].skipped = value;
  }
```
Ed esporlo nel `return { ... }` dopo `setSummaryChoice,`:
```ts
    setSkipped,
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Atteso: `workout-draft.svelte.ts` compila.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/workout-draft.svelte.ts
git commit -m "feat(draft): per-exercise skipped flag + setSkipped"
```

---

## Task A3: workout/new — toggle "salta esercizio"

**Files:**
- Modify: `src/routes/workout/new/+page.svelte`

- [ ] **Step 1: Funzione toggle**

In `<script>`, dopo `function prev() { ... }`:
```ts
  function toggleSkip() {
    if (!draft || !currentEntry) return;
    workoutDraftStore.setSkipped(draft.currentExIdx, !currentEntry.skipped);
  }
```

- [ ] **Step 2: Bottone + set rows condizionate**

Subito dopo la `<div class="card">` della prescription (chiusa a `</div>` dopo il badge DELOAD), aggiungere il bottone:
```svelte
    <button type="button" class="btn skip-toggle" class:on={currentEntry.skipped} onclick={toggleSkip}>
      {currentEntry.skipped ? 'annulla salto' : 'salta esercizio'}
    </button>
```
Poi avvolgere il blocco `{#each currentEntry.sets as set, i (i)} ... {/each}` in una condizione:
```svelte
    {#if currentEntry.skipped}
      <div class="card skipped-note">esercizio saltato — non inciderà sui pesi</div>
    {:else}
      {#each currentEntry.sets as set, i (i)}
        <!-- ...blocco set-row invariato... -->
      {/each}
    {/if}
```

- [ ] **Step 3: Stile**

Nel blocco `<style>`, aggiungere:
```css
  .btn.skip-toggle {
    width: 100%;
    margin: 8px 0 12px;
    background: var(--bg-elev);
    color: var(--ink-2);
    border: 1px solid var(--line);
  }
  .btn.skip-toggle.on {
    border-color: var(--warn, var(--accent));
    color: var(--warn, var(--accent));
  }
  .skipped-note {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-3);
    text-align: center;
  }
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Atteso: nessun nuovo errore in `workout/new/+page.svelte`.

- [ ] **Step 5: Verifica manuale**

`npm run dev` → avviare una seduta: "salta esercizio" nasconde le set-row e mostra la nota; "annulla salto" le ripristina.

- [ ] **Step 6: Commit**

```bash
git add src/routes/workout/new/+page.svelte
git commit -m "feat(workout): skip single exercise toggle"
```

---

## Task A4: summary — badge "saltato" + commit senza progressione

**Files:**
- Modify: `src/routes/workout/summary/+page.svelte`

- [ ] **Step 1: Saltare la progressione per gli entry skipped**

Nel ciclo di `commit()`, sostituire la condizione e la push dell'entry:
```ts
      let resultInfo: ProgressionResult | null = null;
      let userAction: 'repeat' | null = null;
      if (!de.skipped && anyLogged && ex) {
        userAction = workoutDraftStore.summaryChoices[de.exerciseId] ?? null;
        const r = applyEntryResult(ex, entry, userAction, settingsStore.data);
        resultInfo = r.info;
        await exercisesStore.update(r.updatedExercise);
      }

      entries.push({
        exerciseId: de.exerciseId,
        position: 0,
        prescribed: entry.prescribed,
        actualSets: entry.actualSets,
        userAction,
        resultInfo,
        isDeloadSession: !!entry.isDeloadSession,
        skipped: de.skipped
      });
```

- [ ] **Step 2: Badge "saltato" e nascondere "ripeti settimana"**

Nel markup di ogni card, sostituire la `<span class="badge {status.kind}">{status.text}</span>` con:
```svelte
          {#if de.skipped}
            <span class="badge skip">saltato</span>
          {:else}
            <span class="badge {status.kind}">{status.text}</span>
          {/if}
```
E nel blocco "Settimana fallita…", aggiungere `&& !de.skipped` alla condizione:
```svelte
        {#if failed && ex?.scheme === 'wave' && !entry.prescribed.isDeload && !de.skipped}
```

- [ ] **Step 3: Stile badge**

Nel `<style>`, aggiungere:
```css
  .badge.skip {
    background: var(--bg-elev);
    color: var(--ink-2);
  }
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Atteso: 0 errori (chiude l'errore previsto da A1/Step 5).

- [ ] **Step 5: Verifica manuale**

`npm run dev` → seduta con un esercizio saltato → summary mostra "saltato", nessun blocco "ripeti settimana"; dopo "Conferma e salva", lo stato di progressione di quell'esercizio è **invariato** (controllare in `/esercizi/[id]/` o ripartendo una seduta che la prescription non è avanzata).

- [ ] **Step 6: Commit**

```bash
git add src/routes/workout/summary/+page.svelte
git commit -m "feat(summary): skipped entries recorded without progression"
```

---

## Task A5: Pagina giorno — pannello "salta seduta"

**Files:**
- Modify: `src/routes/schede/[id]/days/[dayId]/+page.svelte`

- [ ] **Step 1: Import + stato**

In `<script>` aggiungere l'import:
```ts
  import { workoutsStore } from '$lib/stores/workouts.svelte';
```
Dopo `let pickerOpen = $state(false);` aggiungere:
```ts
  let skipOpen = $state(false);
  let skipNote = $state('');
  let skipDate = $state(new Date().toISOString().slice(0, 10));
  let skipping = $state(false);
```

- [ ] **Step 2: Funzione conferma salto**

Dopo `function startWorkout() { ... }`:
```ts
  async function confirmSkip() {
    skipping = true;
    try {
      const performedAt = new Date(skipDate).toISOString();
      await workoutsStore.commitSkip(schedaId, dayId, performedAt, skipNote.trim() || null);
      skipOpen = false;
      skipNote = '';
      nav('/storico/');
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : ''));
    } finally {
      skipping = false;
    }
  }
```

- [ ] **Step 3: Bottone + pannello inline**

Subito dopo il bottone `<button class="btn primary" onclick={startWorkout} ...>Inizia seduta</button>`, aggiungere:
```svelte
    {#if !skipOpen}
      <button class="btn ghost" onclick={() => (skipOpen = true)} style="margin-top: 12px;">Salta seduta</button>
    {:else}
      <div class="card" style="margin-top: 12px;">
        <p class="view-sub" style="margin: 0 0 12px;">Registra un salto</p>
        <label class="skip-field">
          Data
          <input type="date" bind:value={skipDate} />
        </label>
        <label class="skip-field">
          Nota (opzionale)
          <textarea bind:value={skipNote} rows="2" placeholder="es. influenza, viaggio…"></textarea>
        </label>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <button class="btn ghost" onclick={() => (skipOpen = false)}>Annulla</button>
          <button class="btn primary" onclick={confirmSkip} disabled={skipping}>Conferma salto</button>
        </div>
      </div>
    {/if}
```

- [ ] **Step 4: Stile campi**

Nel `<style>`, aggiungere:
```css
  .skip-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; letter-spacing: .04em; color: var(--ink-2); margin-bottom: 10px; }
  .skip-field input, .skip-field textarea { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; font-family: inherit; }
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Atteso: nessun errore in `days/[dayId]/+page.svelte`.

- [ ] **Step 6: Verifica manuale**

`npm run dev` → giorno scheda → "Salta seduta" apre il pannello (data preimpostata a oggi) → "Conferma salto" porta a `/storico/` e crea una voce; i pesi degli esercizi del giorno restano invariati.

- [ ] **Step 7: Commit**

```bash
git add src/routes/schede/[id]/days/[dayId]/+page.svelte
git commit -m "feat(scheda): skip a whole session with date + note"
```

---

## Task A6: Storico lista — badge "saltata"

**Files:**
- Modify: `src/routes/storico/+page.svelte`

- [ ] **Step 1: Riga condizionale**

Sostituire la `<div class="card-sub">{fmtDate(w.performedAt)} · {w.entries.length} esercizi</div>` con:
```svelte
      {#if w.skipped}
        <div class="card-sub"><span class="badge skip">saltata</span> {fmtDate(w.performedAt)}{w.note ? ` · ${w.note}` : ''}</div>
      {:else}
        <div class="card-sub">{fmtDate(w.performedAt)} · {w.entries.length} esercizi</div>
      {/if}
```

- [ ] **Step 2: Stile badge**

Aggiungere al file (se non c'è un `<style>`, crearne uno in fondo):
```svelte
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
```

- [ ] **Step 3: Type-check + verifica**

Run: `npm run check` (0 errori).
`npm run dev` → `/storico/` mostra le sedute saltate con badge "saltata" + nota, senza conteggio esercizi.

- [ ] **Step 4: Commit**

```bash
git add src/routes/storico/+page.svelte
git commit -m "feat(storico): show skipped sessions in list"
```

---

## Task A7: Storico dettaglio — vista salto

**Files:**
- Modify: `src/routes/storico/[id]/+page.svelte`

- [ ] **Step 1: Sottotitolo e corpo condizionali**

Sostituire `<p class="view-sub">{workout.entries.length} esercizi</p>` con:
```svelte
    <p class="view-sub">{workout.skipped ? 'seduta saltata' : `${workout.entries.length} esercizi`}</p>
```
Avvolgere il blocco `{#each workout.entries as entry (entry.id)} ... {/each}` così:
```svelte
    {#if workout.skipped}
      <div class="card">
        <span class="badge skip">saltata</span>
        {#if workout.note}<p style="margin: 12px 0 0; font-size: 14px; color: var(--ink-2);">{workout.note}</p>{/if}
      </div>
    {:else}
      {#each workout.entries as entry (entry.id)}
        <!-- ...card entry invariata, vedi Step 2 per il badge per-entry... -->
      {/each}
    {/if}
```

- [ ] **Step 2: Badge "saltato" per le entry skipped**

Dentro la card di ogni entry, nella `<div class="card-sub">`, dopo il badge DELOAD aggiungere:
```svelte
          {#if entry.skipped}<span class="badge skip">saltato</span>{/if}
```
E avvolgere la lista dei set in modo da non mostrarla per entry saltate:
```svelte
        {#if !entry.skipped}
          <div style="margin-top: 12px;">
            {#each entry.actualSets as s, i (i)}
              <!-- ...riga set invariata... -->
            {/each}
          </div>
        {/if}
```

- [ ] **Step 3: Stile badge**

Nel `<style>`, aggiungere:
```css
  .badge.skip {
    background: var(--bg-elev);
    color: var(--ink-2);
    padding: 2px 8px;
    font-size: 9px;
    border-radius: 6px;
    font-family: var(--mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-left: 8px;
  }
```

- [ ] **Step 4: Type-check + full test**

Run: `npm run check` (0 errori) e `npm test` (PASS).

- [ ] **Step 5: Verifica manuale**

`npm run dev` → aprire dal `/storico/` una seduta saltata (mostra nota, niente set) e una seduta normale con un esercizio saltato (badge "saltato" su quell'entry).

- [ ] **Step 6: Commit**

```bash
git add src/routes/storico/[id]/+page.svelte
git commit -m "feat(storico): skipped session + skipped entry detail view"
```

---

## ✅ CHECKPOINT FINE MILESTONE A — CHIUSA codice (2026-06-03)

Completata: commit `ae804d2`..`55ca038` (A0→A7), `npm run check` 0 errori, `npm test` 29/29. Funzionalità complete in codice: arrotondamento ibrido + salto seduta/esercizio. **Resta da fare dall'utente:** (1) applicare `supabase/migrations/20260603000001_add_skip_columns.sql` nello SQL Editor; (2) verifica manuale a runtime (salta esercizio in seduta, salta intera seduta dal giorno scheda, badge in storico lista/dettaglio, progressione invariata per gli esercizi saltati). Fermarsi per review finale dell'utente prima di eventuale merge/deploy.

---

## Self-review (note di copertura)

- **Spec → task**: Settings split (B1/B3), Exercise override + colonna SQL (B0/B1/B2/B4), `effectiveRounding` e sostituzione 6 usi (B1), step UI (B4/B5); salto-seduta dati+store+UI (A0/A1/A5/A6/A7), salto-esercizio draft+flusso+commit+storico (A0/A1/A2/A3/A4/A7). Tutte le sezioni della spec hanno un task.
- **Nessun nuovo `ProgressionResult`** e `progression.ts` non cambia per il salto (garanzia strutturale): nessun test di dominio per il salto, come da spec.
- **Type consistency**: `effectiveRounding(ex, settings)`, `Settings.plateRoundingWave/Linear`, `Exercise.plateRounding`, `Workout.skipped/note`, `WorkoutEntryRecord.skipped`, `DraftEntry.skipped`, `workoutsStore.commitSkip`, `workoutDraftStore.setSkipped` usati con gli stessi nomi in tutti i task.
- **Interazione default linear=2**: due test linear preesistenti aggiornati in B1/Step 5 (62.5→62, 55→54). Documentato.
