# Incremento lineare a passi di arrotondamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'incremento lineare globale in kg con un incremento espresso in "N passi dello step di arrotondamento" (default 1, con override per-esercizio), eliminando per costruzione il bug di progressione bloccata.

**Architecture:** Il motore di progressione (`applyEntryResult`, ramo lineare) calcola il nuovo carico come `roundTo(vecchio + N × step, step)`, dove `step = effectiveRounding(ex, settings)` e `N = effectiveIncrementSteps(ex, settings)`. `N` viene da un nuovo setting globale `linearIncrementSteps` (default 1) o da un override per-esercizio `Exercise.linearIncrementSteps`. Siccome `N ≥ 1` e `step > 0`, il carico sale **sempre**.

**Tech Stack:** SvelteKit 2 · Svelte 5 (runes) · TypeScript · Vitest · Supabase (Postgres + RLS).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-03-linear-increment-steps-design.md`

**⚠️ Ordine vincolante:** il codice dello store che scrive la colonna `linear_increment_steps` (Task 3) **non deve raggiungere `main`/produzione prima** che la migration (Task 2) sia applicata sul DB Supabase, altrimenti ogni salvataggio/commit esercizio fallirebbe ("column does not exist"). I task sono ordinati di conseguenza: Task 1 non tocca il DB; Task 2 crea + applica la migration; Task 3 introduce il codice che usa la colonna.

---

### Task 1: Motore + setting globale (incremento a passi)

Cambio atomico del modello globale: `Settings.linearIncrementKg` → `Settings.linearIncrementSteps`, nuovo helper nel motore, e adeguamento dell'unico consumer UI compile-time (Impostazioni) così che `npm run check` resti verde. Nessuna dipendenza dal DB.

**Files:**
- Modify: `src/lib/domain/types.ts` (`Settings`, `DEFAULT_SETTINGS`, `Exercise`)
- Modify: `src/lib/domain/progression.ts` (`effectiveIncrementSteps`, ramo advance)
- Modify: `src/routes/impostazioni/+page.svelte` (label + binding + help)
- Test: `src/lib/domain/progression.test.ts`

- [ ] **Step 1: Aggiorna/aggiungi i test (falliscono)**

In `src/lib/domain/progression.test.ts`, dentro il blocco `describe('applyEntryResult — linear', ...)`:

Rinomina il test esistente (era `'all sets ok at target reps → advance load by linearIncrementKg'`) e aggiorna il commento; il valore atteso **resta 62** (con i default: step 2, N=1 → `60 + 1×2`):

```ts
  it('all sets ok → advance di N×step (default N=1, step 2 → +2)', () => {
    const ex = baseLinear({ linearCurrentLoad: 60 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 60 },
      actualSets: [
        { status: 'ok', reps: 8, load: 60 },
        { status: 'ok', reps: 8, load: 60 },
        { status: 'ok', reps: 8, load: 60 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-advance');
    // 60 + 1×2 = 62
    expect(result.updatedExercise.linearCurrentLoad).toBe(62);
    expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
  });
```

Aggiungi questi tre nuovi test subito dopo:

```ts
  it('regressione bug: load 40, step 5 (override), N=1 globale → 45', () => {
    const ex = baseLinear({ linearCurrentLoad: 40, plateRounding: 5 });
    const e = entry({
      prescribed: { sets: 4, reps: 8, load: 40 },
      actualSets: [
        { status: 'ok', reps: 8, load: 40 },
        { status: 'ok', reps: 8, load: 40 },
        { status: 'ok', reps: 8, load: 40 },
        { status: 'ok', reps: 8, load: 40 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.info.kind).toBe('linear-advance');
    expect(result.updatedExercise.linearCurrentLoad).toBe(45);
  });

  it('override per-esercizio: N=2, step 2.5 → +5', () => {
    const ex = baseLinear({ linearCurrentLoad: 50, plateRounding: 2.5, linearIncrementSteps: 2 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 50 },
      actualSets: [
        { status: 'ok', reps: 8, load: 50 },
        { status: 'ok', reps: 8, load: 50 },
        { status: 'ok', reps: 8, load: 50 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.updatedExercise.linearCurrentLoad).toBe(55);
  });

  it('auto-correzione fuori griglia: load 42, step 5, N=1 → 45', () => {
    const ex = baseLinear({ linearCurrentLoad: 42, plateRounding: 5 });
    const e = entry({
      prescribed: { sets: 3, reps: 8, load: 42 },
      actualSets: [
        { status: 'ok', reps: 8, load: 42 },
        { status: 'ok', reps: 8, load: 42 },
        { status: 'ok', reps: 8, load: 42 }
      ]
    });
    const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
    expect(result.updatedExercise.linearCurrentLoad).toBe(45);
  });
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npm test -- src/lib/domain/progression.test.ts`
Expected: FAIL — compilazione TS rotta (`linearIncrementSteps` non esiste su `Exercise`/`Settings`) e/o asserzioni fallite (il vecchio motore su `load 40, step 5` produce ancora 40).

- [ ] **Step 3: Aggiorna `src/lib/domain/types.ts`**

In `Settings`, sostituisci la riga `linearIncrementKg: number;` con:

```ts
  linearIncrementSteps: number;
```

In `Exercise`, nel blocco `// linear`, aggiungi dopo `linearConsecutiveFailures?: number;`:

```ts
  linearIncrementSteps?: number; // override del numero di passi per advance; assente = settings.linearIncrementSteps
```

In `DEFAULT_SETTINGS`, sostituisci la riga `linearIncrementKg: 2.5,` con:

```ts
  linearIncrementSteps: 1,
```

- [ ] **Step 4: Aggiorna `src/lib/domain/progression.ts`**

Subito dopo la funzione `effectiveRounding` aggiungi il gemello:

```ts
export function effectiveIncrementSteps(ex: Exercise, settings: Settings): number {
  return ex.linearIncrementSteps ?? settings.linearIncrementSteps;
}
```

Nel ramo `if (allCompleted) {` di `applyEntryResult`, sostituisci:

```ts
      updated.linearCurrentLoad = roundTo(
        (ex.linearCurrentLoad ?? 0) + settings.linearIncrementKg,
        effectiveRounding(ex, settings)
      );
```

con:

```ts
      const step = effectiveRounding(ex, settings);
      const steps = effectiveIncrementSteps(ex, settings);
      updated.linearCurrentLoad = roundTo((ex.linearCurrentLoad ?? 0) + steps * step, step);
```

- [ ] **Step 5: Aggiorna `src/routes/impostazioni/+page.svelte`**

Nel record `HELP`, sostituisci la riga della chiave `linearIncrementKg` con:

```ts
    linearIncrementSteps: 'Di quanti passi di arrotondamento sale il carico dopo una sessione completata pienamente (1 = un passo). Lo "step" è l\'arrotondamento dischi, globale o per-esercizio.',
```

Nella card "Linear", sostituisci il blocco del campo `linearIncrementKg` (oggi label "Incremento per advance (kg)") con:

```svelte
    <div class="field">
      <div class="field-head">
        <label for="f-linearIncrementSteps">Incremento per advance (passi)</label>
        {@render helpIcon('linearIncrementSteps')}
      </div>
      <input id="f-linearIncrementSteps" type="number" bind:value={editing.linearIncrementSteps} step="1" min="1" />
      {@render helpText('linearIncrementSteps')}
    </div>
```

- [ ] **Step 6: Esegui i test per verificare che passino**

Run: `npm test -- src/lib/domain/progression.test.ts`
Expected: PASS (tutti i test linear, inclusi i 3 nuovi).

- [ ] **Step 7: Type-check completo**

Run: `npm run check`
Expected: 0 errori, 0 warning (nessun riferimento residuo a `linearIncrementKg`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progression.ts src/routes/impostazioni/+page.svelte src/lib/domain/progression.test.ts
git commit -m "feat(progression): incremento lineare come N passi dello step (setting globale)"
```

---

### Task 2: Migration colonna `linear_increment_steps` (crea + applica + regen)

Crea il file di migration, applicalo a mano nel SQL Editor Supabase (il repo non applica le migration in automatico), poi rigenera `database.types.ts`. Da fare **prima** del Task 3.

**Files:**
- Create: `supabase/migrations/20260603000002_add_linear_increment_steps_to_exercises.sql`
- Modify: `src/lib/database.types.ts` (rigenerato)

- [ ] **Step 1: Crea il file di migration**

Crea `supabase/migrations/20260603000002_add_linear_increment_steps_to_exercises.sql` con:

```sql
-- Override opzionale del numero di passi di incremento per advance, per singolo esercizio.
-- NULL = usa il default globale (settings.linearIncrementSteps).
alter table exercises add column linear_increment_steps integer;
```

- [ ] **Step 2: Applica la migration (manuale, SQL Editor Supabase)**

Apri il progetto su Supabase → SQL Editor → incolla ed esegui il contenuto del file appena creato.
Expected: "Success. No rows returned". Verifica con:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'exercises' and column_name = 'linear_increment_steps';
```
Expected: una riga `linear_increment_steps | integer`.

- [ ] **Step 3: Rigenera i tipi TypeScript**

Run (sostituisci `<project-ref>` con il project ref Supabase reale):

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```
Expected: il file include `linear_increment_steps: number | null` nel blocco `exercises` (Row/Insert/Update).

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: 0 errori (i tipi rigenerati non rompono nulla; lo store usa ancora il suo `DbExercise` locale fino al Task 3).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260603000002_add_linear_increment_steps_to_exercises.sql src/lib/database.types.ts
git commit -m "feat(db): colonna linear_increment_steps su exercises + regen types"
```

---

### Task 3: Persistenza override per-esercizio + campo nel form

Mappa la nuova colonna nello store e aggiunge il campo opzionale "passi per advance" nel form esercizio (solo schema linear). Niente unit test: store e componenti non hanno harness di test nel repo (convenzione: verifica via `npm run check` + runtime).

**Files:**
- Modify: `src/lib/stores/exercises.svelte.ts` (`DbExercise`, `dbToDomain`, `domainToDb`)
- Modify: `src/lib/ui/ExerciseForm.svelte` (state + submit + markup)

- [ ] **Step 1: Mappa la colonna nello store**

In `src/lib/stores/exercises.svelte.ts`:

Nel type `DbExercise`, dopo `plate_rounding: number | null;` aggiungi:

```ts
  linear_increment_steps: number | null;
```

In `dbToDomain`, dopo `plateRounding: row.plate_rounding ?? undefined,` aggiungi:

```ts
    linearIncrementSteps: row.linear_increment_steps ?? undefined,
```

In `domainToDb`, dopo `plate_rounding: ex.plateRounding ?? null,` aggiungi:

```ts
    linear_increment_steps: ex.linearIncrementSteps ?? null,
```

- [ ] **Step 2: Aggiungi il campo nel form esercizio**

In `src/lib/ui/ExerciseForm.svelte`, nel blocco `<script>`, dopo `let plateRounding = $state<number | undefined>(exercise.plateRounding);` aggiungi:

```ts
  let linearIncrementSteps = $state<number | undefined>(exercise.linearIncrementSteps);
```

Nella funzione `submit`, nel ramo `else` (linear), aggiungi la proprietà all'oggetto passato a `onsave({ ... })`:

```ts
        linearIncrementSteps: linearIncrementSteps && linearIncrementSteps > 0 ? linearIncrementSteps : undefined,
```

Nel markup, dentro il blocco `{:else}` (linear), dopo il campo "Reps target", aggiungi:

```svelte
    <label>
      Passi per advance (vuoto = default impostazioni)
      <input type="number" min="1" step="1" placeholder={String(settingsStore.data.linearIncrementSteps)} bind:value={linearIncrementSteps} />
    </label>
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: 0 errori, 0 warning.

- [ ] **Step 4: Build di sicurezza**

Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/exercises.svelte.ts src/lib/ui/ExerciseForm.svelte
git commit -m "feat(esercizi): override per-esercizio dei passi di advance (form + store)"
```

---

### Task 4: Verifica runtime end-to-end

Conferma sul DB reale che l'esercizio prima bloccato ora progredisce.

- [ ] **Step 1: Avvia l'app**

Run: `npm run dev`
Apri `http://localhost:5173`, effettua il login.

- [ ] **Step 2: Verifica Hip thrust (caso bloccato)**

Annota il carico corrente di **Hip thrust** (atteso 40, step/arrotondamento 5). Avvia una seduta dalla scheda, registra tutte le serie come completate al target reps, conferma nel summary e committa la seduta.
Expected: in `/storico/` la seduta è salvata; alla prescrizione successiva di Hip thrust il carico è **45** (era fermo a 40).

- [ ] **Step 3: Verifica override per-esercizio (opzionale)**

Nel form di un esercizio linear imposta "Passi per advance" = 2 e salva. Riapri il form: il valore 2 persiste (conferma round-trip DB).

- [ ] **Step 4: Aggiorna lo stato nel known-issue e nella spec**

In `docs/superpowers/specs/2026-06-03-known-issue-linear-increment-rounding.md` cambia `Stato: **APERTO**` in `Stato: **RISOLTO** (vedi 2026-06-03-linear-increment-steps-design.md, opzione C)`.
In `docs/superpowers/specs/2026-06-03-linear-increment-steps-design.md` cambia lo stato in `IMPLEMENTATO`.

```bash
git add docs/superpowers/specs/2026-06-03-known-issue-linear-increment-rounding.md docs/superpowers/specs/2026-06-03-linear-increment-steps-design.md
git commit -m "docs: chiudi known-issue incremento lineare (risolto con opzione C)"
```

---

## Note di completamento

- **Deploy:** non mergiare il Task 3 su `main` prima che la migration del Task 2 sia applicata in produzione (il deploy su GitHub Pages parte al push su `main`).
- **Storico pregresso:** nessun backfill — il record `result_info` fuorviante già salvato resta com'è (non è renderizzato in alcuna UI).
- **Wave:** fuori scope, invariato.
