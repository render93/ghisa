# Cambio peso in seduta + ricalibro lineare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nel solo schema lineare, il peso effettivo delle serie ricalibra il carico (regola "del 25%"); nel wave il peso non è modificabile in seduta; le serie vanno tutte loggate prima di concludere.

**Architecture:** Una funzione pura `resolveLinearOutcome` (domain layer) decide l'esito lineare (advance/downshift/upshift/repeat/deload) analizzando pesi effettivi e reps; `applyEntryResult` la chiama e la traduce in `ProgressionResult`. La UI di seduta rende la riga-serie condizionale allo schema e blocca "Concludi" finché ogni serie non è marcata. Due nuove soglie in `Settings`.

**Tech Stack:** SvelteKit 2 · Svelte 5 (runes) · TypeScript · Vitest · Supabase.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-02-cambio-peso-seduta-design.md`

## Global Constraints

- Svelte 5 **runes mode** obbligatorio (`$state`/`$derived`); niente store legacy.
- Le stringhe UI sono in **italiano**, tono conciso/minuscolo.
- I valori di configurazione stanno in `Settings` e si leggono da `settingsStore.data` / `settings` al use-site — **non** hardcodati.
- `nextPrescription` e `applyEntryResult` restano in **lock-step**: a ogni modifica lanciare l'intera `progression.test.ts`.
- Verifica per ogni task: `npm run check` (= `svelte-kit sync && svelte-check`) **e** `npm test` verdi.
- Branch di lavoro già creato: **`feature/linear-load-shift`**. Commit in italiano. **Nessun commit su `main`, nessun merge.**
- Nessuna migration SQL: i due nuovi setting sono JSONB e `settingsStore.load` fa già merge con `DEFAULT_SETTINGS`.

## Stato esecuzione

> Aggiornato: 2026-07-02 — **tutti i 5 task completati** su `feature/linear-load-shift`; `npm test` 51/51, `npm run check` 0 errori. Review finale del branch: nessun Critical/Important. R7 e A3-04 chiusi.

- [x] Task 1 — Settings + varianti ProgressionResult (commit `d57bfdf`)
- [x] Task 2 — `resolveLinearOutcome` (funzione pura) (commit `ff9a7c3`)
- [x] Task 3 — Integrazione in `applyEntryResult` (commit `f499a91`)
- [x] Task 4 — UI seduta (riga condizionale + gate logging) (commit `8e60d04`)
- [x] Task 5 — Form Impostazioni (2 controlli) (commit `6467e48`)

**Minor noti (dalla review finale):** M1 — un ribasso/rialzo verso un peso fuori-griglia può arrotondare fino al carico prescritto (etichetta `linear-downshift`/`-upshift` senza calo/salita effettivo): cosmetico, coerente col vincolo "carico multiplo dello step", non renderizzato in UI, non una regressione. M2 (copy dell'help `linearResetPct` legata al "due" fisso) — **risolto**.

---

## Task 1: Settings e varianti di ProgressionResult

**Files:**
- Modify: `src/lib/domain/types.ts` (`Settings` righe 3-19, `ProgressionResult` righe 70-86, `DEFAULT_SETTINGS` righe 101-117)
- Test: `src/lib/domain/progression.test.ts`

**Interfaces:**
- Produces: `Settings.linearLoadShiftPct: number`, `Settings.linearFailThreshold: number`; `ProgressionResult` con due varianti aggiuntive `{ kind: 'linear-downshift'; newLoad: number }` e `{ kind: 'linear-upshift'; newLoad: number }`.

- [ ] **Step 1: Scrivi il test che fallisce** (append in fondo a `progression.test.ts`)

```ts
describe('DEFAULT_SETTINGS — nuove soglie lineari', () => {
  it('espone linearLoadShiftPct=25 e linearFailThreshold=2', () => {
    expect(DEFAULT_SETTINGS.linearLoadShiftPct).toBe(25);
    expect(DEFAULT_SETTINGS.linearFailThreshold).toBe(2);
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npm test -- src/lib/domain/progression.test.ts`
Expected: FAIL — proprietà `linearLoadShiftPct`/`linearFailThreshold` inesistenti (errore di tipo o `undefined`).

- [ ] **Step 3: Aggiungi i campi a `Settings`** (dentro il blocco righe 3-19, dopo `linearResetPct: number;`)

```ts
  linearResetPct: number;
  linearLoadShiftPct: number;
  linearFailThreshold: number;
```

- [ ] **Step 4: Aggiungi i default a `DEFAULT_SETTINGS`** (dopo `linearResetPct: 10,`)

```ts
  linearResetPct: 10,
  linearLoadShiftPct: 25,
  linearFailThreshold: 2,
```

- [ ] **Step 5: Aggiungi le due varianti a `ProgressionResult`** (nel union righe 70-86, dopo la variante `linear-advance`)

```ts
  | { kind: 'linear-advance'; newLoad: number }
  | { kind: 'linear-downshift'; newLoad: number }
  | { kind: 'linear-upshift'; newLoad: number }
  | { kind: 'linear-repeat' }
```

- [ ] **Step 6: Esegui test + type-check**

Run: `npm test -- src/lib/domain/progression.test.ts && npm run check`
Expected: PASS, 0 errori di tipo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progression.test.ts
git commit -m "feat(settings): soglia ricalibro peso lineare e soglia deload configurabili"
```

---

## Task 2: `resolveLinearOutcome` (funzione pura)

**Files:**
- Modify: `src/lib/domain/progression.ts` (nuova funzione + tipo, vicino agli altri helper)
- Test: `src/lib/domain/progression.test.ts`

**Interfaces:**
- Consumes: `effectiveRounding`, `effectiveIncrementSteps`, `roundTo` (già in `progression.ts`); `Settings.linearLoadShiftPct`, `Settings.linearFailThreshold`, `Settings.linearResetPct` (Task 1).
- Produces:
```ts
export type LinearOutcome =
  | { kind: 'advance'; newLoad: number }
  | { kind: 'downshift'; newLoad: number }
  | { kind: 'upshift'; newLoad: number }
  | { kind: 'repeat'; newLoad: number }
  | { kind: 'deload'; newLoad: number };
export function resolveLinearOutcome(ex: Exercise, entry: Entry, settings: Settings): LinearOutcome;
```

- [ ] **Step 1: Scrivi i test che falliscono** (append in `progression.test.ts`; aggiungi `resolveLinearOutcome` e il tipo all'import da `./progression`)

```ts
import { resolveLinearOutcome, type LinearOutcome } from './progression';

describe('resolveLinearOutcome', () => {
  // esercizio lineare 4×12 @ 10, step (plateRoundingLinear) = 2
  const ex = (o = {}) => baseLinear({ linearCurrentLoad: 10, linearTargetReps: 12, linearTargetSets: 4, ...o });
  const e = (sets: { status: 'ok' | 'fail'; reps: number; load: number }[]) =>
    entry({ prescribed: { sets: 4, reps: 12, load: 10 }, actualSets: sets });

  it('tutte al prescritto e completate → advance +step', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'advance', newLoad: 12 });
  });

  it('>25% abbassate e completate → downshift al più basso', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 8 }, { status: 'ok', reps: 12, load: 8 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'downshift', newLoad: 8 });
  });

  it('>25% alzate e completate → upshift al più alto', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 12 }, { status: 'ok', reps: 12, load: 12 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'upshift', newLoad: 12 });
  });

  it('esattamente 25% abbassate (1 su 4) → non scatta, advance', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 8 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'advance', newLoad: 12 });
  });

  it('mix abbassate+alzate oltre soglia → precede il ribasso', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 8 }, { status: 'ok', reps: 12, load: 8 },
      { status: 'ok', reps: 12, load: 12 }, { status: 'ok', reps: 12, load: 12 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'downshift', newLoad: 8 });
  });

  it('pesi misti abbassati → downshift al minimo', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 6 }, { status: 'ok', reps: 12, load: 8 },
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'downshift', newLoad: 6 });
  });

  it('non completato senza abbassamenti → repeat allo stesso carico', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 9, load: 10 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'repeat', newLoad: 10 });
  });

  it('abbassi oltre soglia ma non chiudi le reps → repeat al minimo usato', () => {
    const r = resolveLinearOutcome(ex(), e([
      { status: 'ok', reps: 9, load: 8 }, { status: 'ok', reps: 9, load: 8 },
      { status: 'ok', reps: 12, load: 8 }, { status: 'ok', reps: 12, load: 10 }
    ]), DEFAULT_SETTINGS);
    expect(r).toEqual({ kind: 'repeat', newLoad: 8 });
  });

  it('secondo fallimento consecutivo → deload dal carico corrente', () => {
    const exDl = baseLinear({ linearCurrentLoad: 100, linearTargetReps: 12, linearConsecutiveFailures: 1 });
    const r = resolveLinearOutcome(exDl, entry({
      prescribed: { sets: 3, reps: 12, load: 100 },
      actualSets: [{ status: 'fail', reps: 8, load: 100 }]
    }), DEFAULT_SETTINGS);
    // 100 * (1 - 10/100) = 90
    expect(r).toEqual({ kind: 'deload', newLoad: 90 });
  });
});
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npm test -- src/lib/domain/progression.test.ts`
Expected: FAIL — `resolveLinearOutcome is not a function`.

- [ ] **Step 3: Implementa la funzione** (in `src/lib/domain/progression.ts`, dopo `effectiveIncrementSteps`, righe ~23-25)

```ts
export type LinearOutcome =
  | { kind: 'advance'; newLoad: number }
  | { kind: 'downshift'; newLoad: number }
  | { kind: 'upshift'; newLoad: number }
  | { kind: 'repeat'; newLoad: number }
  | { kind: 'deload'; newLoad: number };

export function resolveLinearOutcome(ex: Exercise, entry: Entry, settings: Settings): LinearOutcome {
  const P = entry.prescribed.load;
  const R = entry.prescribed.reps;
  const sets = entry.actualSets;
  const N = sets.length;
  const step = effectiveRounding(ex, settings);
  const currentLoad = ex.linearCurrentLoad ?? 0;

  const completed = N > 0 && sets.every((s) => s.status === 'ok' && (s.reps || 0) >= R);

  const loads = sets.map((s) => s.load);
  const t = settings.linearLoadShiftPct / 100;
  const loweredOverThreshold = N > 0 && sets.filter((s) => s.load < P).length / N > t;
  const raisedOverThreshold = N > 0 && sets.filter((s) => s.load > P).length / N > t;

  if (completed) {
    if (loweredOverThreshold) return { kind: 'downshift', newLoad: roundTo(Math.min(...loads), step) };
    if (raisedOverThreshold) return { kind: 'upshift', newLoad: roundTo(Math.max(...loads), step) };
    const steps = effectiveIncrementSteps(ex, settings);
    return { kind: 'advance', newLoad: roundTo(currentLoad + steps * step, step) };
  }

  // non completato → fallimento; se ha abbassato oltre soglia, il lavoro scende comunque al minimo usato
  const baseLoad = loweredOverThreshold ? Math.min(...loads) : currentLoad;
  const fails = (ex.linearConsecutiveFailures ?? 0) + 1;
  if (fails >= settings.linearFailThreshold) {
    return { kind: 'deload', newLoad: roundTo(baseLoad * (1 - settings.linearResetPct / 100), step) };
  }
  return { kind: 'repeat', newLoad: roundTo(baseLoad, step) };
}
```

- [ ] **Step 4: Esegui test + type-check**

Run: `npm test -- src/lib/domain/progression.test.ts && npm run check`
Expected: PASS su tutti i casi di `resolveLinearOutcome`, 0 errori di tipo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(progression): resolveLinearOutcome — ricalibro peso lineare (regola 25%)"
```

---

## Task 3: Integrazione in `applyEntryResult`

**Files:**
- Modify: `src/lib/domain/progression.ts` (ramo lineare di `applyEntryResult`, dentro `if (ex.scheme === 'linear') { … }`, righe ~90-119)
- Test: `src/lib/domain/progression.test.ts`

**Interfaces:**
- Consumes: `resolveLinearOutcome` (Task 2), varianti `linear-downshift`/`linear-upshift` di `ProgressionResult` (Task 1).

- [ ] **Step 1: Scrivi i test di integrazione che falliscono** (append nel describe `applyEntryResult — linear`, o in un nuovo describe)

```ts
describe('applyEntryResult — linear ricalibro peso', () => {
  const exL = (o = {}) => baseLinear({ linearCurrentLoad: 10, linearTargetReps: 12, linearTargetSets: 4, ...o });

  it('completato con >25% abbassate → linear-downshift, carico al minimo, fails 0', () => {
    const e = entry({ prescribed: { sets: 4, reps: 12, load: 10 }, actualSets: [
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 8 }, { status: 'ok', reps: 12, load: 8 }
    ]});
    const r = applyEntryResult(exL(), e, null, DEFAULT_SETTINGS);
    expect(r.info.kind).toBe('linear-downshift');
    expect(r.updatedExercise.linearCurrentLoad).toBe(8);
    expect(r.updatedExercise.linearConsecutiveFailures).toBe(0);
  });

  it('completato con >25% alzate → linear-upshift, carico al massimo', () => {
    const e = entry({ prescribed: { sets: 4, reps: 12, load: 10 }, actualSets: [
      { status: 'ok', reps: 12, load: 10 }, { status: 'ok', reps: 12, load: 10 },
      { status: 'ok', reps: 12, load: 12 }, { status: 'ok', reps: 12, load: 12 }
    ]});
    const r = applyEntryResult(exL(), e, null, DEFAULT_SETTINGS);
    expect(r.info.kind).toBe('linear-upshift');
    expect(r.updatedExercise.linearCurrentLoad).toBe(12);
  });

  it('abbassi oltre soglia ma fallisci le reps → linear-repeat al minimo, fails +1', () => {
    const e = entry({ prescribed: { sets: 4, reps: 12, load: 10 }, actualSets: [
      { status: 'ok', reps: 9, load: 8 }, { status: 'ok', reps: 9, load: 8 },
      { status: 'ok', reps: 12, load: 8 }, { status: 'ok', reps: 12, load: 10 }
    ]});
    const r = applyEntryResult(exL(), e, null, DEFAULT_SETTINGS);
    expect(r.info.kind).toBe('linear-repeat');
    expect(r.updatedExercise.linearCurrentLoad).toBe(8);
    expect(r.updatedExercise.linearConsecutiveFailures).toBe(1);
  });
});
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npm test -- src/lib/domain/progression.test.ts`
Expected: FAIL — `applyEntryResult` restituisce ancora `linear-advance`/`linear-repeat` con carico sbagliato (ramo vecchio).

- [ ] **Step 3: Sostituisci il ramo lineare di `applyEntryResult`**

Rimpiazza l'intero blocco `if (ex.scheme === 'linear') { … }` (dall'apertura fino alla `}` prima del commento `// wave`) con:

```ts
  if (ex.scheme === 'linear') {
    const outcome = resolveLinearOutcome(ex, entry, settings);
    updated.linearCurrentLoad = outcome.newLoad;
    updated.linearConsecutiveFailures =
      outcome.kind === 'repeat' ? (ex.linearConsecutiveFailures ?? 0) + 1 : 0;
    const info: ProgressionResult =
      outcome.kind === 'advance'
        ? { kind: 'linear-advance', newLoad: outcome.newLoad }
        : outcome.kind === 'downshift'
          ? { kind: 'linear-downshift', newLoad: outcome.newLoad }
          : outcome.kind === 'upshift'
            ? { kind: 'linear-upshift', newLoad: outcome.newLoad }
            : outcome.kind === 'deload'
              ? { kind: 'linear-deload', newLoad: outcome.newLoad }
              : { kind: 'linear-repeat' };
    return { updatedExercise: updated, info };
  }
```

Il check `anyAttempt` a monte (che ritorna `noop` se nessuna serie è loggata) resta invariato.

- [ ] **Step 4: Esegui l'intera suite + type-check**

Run: `npm test -- src/lib/domain/progression.test.ts && npm run check`
Expected: PASS — i nuovi test di integrazione e **tutti** i test lineari esistenti (advance/repeat/deload usano `load = prescribed.load`, quindi nessuna divergenza → comportamento identico) e i test wave.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(progression): applyEntryResult usa resolveLinearOutcome (down/up-shift)"
```

---

## Task 4: UI seduta — riga condizionale allo schema + gate di logging

**Files:**
- Modify: `src/routes/workout/new/+page.svelte` (riga-serie righe 107-149; pulsanti nav righe 152-159; blocco `<style>` `.set-row`)

Nessun unit test di componente esiste nel progetto: la verifica è `npm run check` + prova manuale in `npm run dev`.

- [ ] **Step 1: Aggiungi il derived per il gate di logging** (nello `<script>`, dopo `const bar = $derived(...)` riga 38)

```ts
  const allSetsLogged = $derived(
    !currentEntry
      ? false
      : currentEntry.skipped || currentEntry.sets.every((s) => s.status !== null)
  );
```

- [ ] **Step 2: Rendi il campo KG condizionale allo schema** (righe 121-131: avvolgi la `<label class="field">` del KG)

```svelte
          {#if currentExercise.scheme === 'linear'}
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
          {/if}
```

- [ ] **Step 3: Aggiungi la classe griglia per la riga senza peso** (riga 109)

```svelte
        <div class="set-row card" class:closed class:no-load={currentExercise.scheme !== 'linear'}>
```

E nel blocco `<style>`, dopo la regola `.set-row { … }`:

```css
  .set-row.no-load {
    grid-template-columns: 28px 1fr auto auto;
  }
```

- [ ] **Step 4: Blocca "Succ →" e "Concludi seduta →" finché le serie non sono loggate** (righe 154-158)

```svelte
      {#if isLast}
        <button class="btn primary" onclick={finish} disabled={!allSetsLogged}>Concludi seduta →</button>
      {:else}
        <button class="btn primary" onclick={next} disabled={!allSetsLogged}>Succ →</button>
      {/if}
```

- [ ] **Step 5: Type-check + prova manuale**

Run: `npm run check`
Expected: 0 errori.
Prova manuale (`npm run dev`, `:5173`):
1. Avvia una seduta con un esercizio **wave**: la riga-serie mostra solo `REPS` + ✓/✗, **niente** campo KG; il layout resta allineato.
2. Esercizio **lineare**: il campo KG è presente.
3. Con serie non ancora marcate, `Succ →` / `Concludi seduta →` è **disabilitato**; marca tutte le serie (o salta l'esercizio) → si abilita.

- [ ] **Step 6: Commit**

```bash
git add src/routes/workout/new/+page.svelte
git commit -m "feat(seduta): wave senza campo peso e obbligo di loggare tutte le serie"
```

---

## Task 5: Form Impostazioni — due nuovi controlli

**Files:**
- Modify: `src/routes/impostazioni/+page.svelte` (`HELP` righe 6-21; card "Linear" righe 182-211)

- [ ] **Step 1: Aggiungi le descrizioni in `HELP`** (dopo `linearResetPct: '…'`, riga 20)

```ts
    linearResetPct: 'Quanto ridurre il carico dopo due fallimenti consecutivi.',
    linearLoadShiftPct: 'Percentuale di serie con peso modificato oltre cui il carico lineare viene ricalibrato al peso usato (ribasso o rialzo).',
    linearFailThreshold: 'Numero di sessioni lineari fallite consecutive prima che scatti il deload.'
```

- [ ] **Step 2: Aggiungi i due campi nella card "Linear"** (dopo il `.field` di `linearResetPct`, riga 210, prima della `</div>` di chiusura card riga 211)

```svelte
    <div class="field">
      <div class="field-head">
        <label for="f-linearLoadShiftPct">Soglia ricalibro peso (%)</label>
        {@render helpIcon('linearLoadShiftPct')}
      </div>
      <input id="f-linearLoadShiftPct" type="number" bind:value={editing.linearLoadShiftPct} step="5" min="0" max="100" />
      {@render helpText('linearLoadShiftPct')}
    </div>

    <div class="field">
      <div class="field-head">
        <label for="f-linearFailThreshold">Fallimenti prima del deload</label>
        {@render helpIcon('linearFailThreshold')}
      </div>
      <input id="f-linearFailThreshold" type="number" bind:value={editing.linearFailThreshold} step="1" min="1" />
      {@render helpText('linearFailThreshold')}
    </div>
```

- [ ] **Step 3: Type-check + prova manuale**

Run: `npm run check`
Expected: 0 errori (`editing` deriva da `settingsStore.data`, che ora include i due campi via merge dei default).
Prova manuale: apri `/impostazioni/`, sezione "Linear" → i due nuovi controlli sono presenti, editabili e "Salva" li persiste; "Reset default" li riporta a 25 e 2.

- [ ] **Step 4: Commit**

```bash
git add src/routes/impostazioni/+page.svelte
git commit -m "feat(impostazioni): controlli per soglia ricalibro peso e soglia deload lineare"
```

---

## Note di chiusura

- A fine implementazione, aggiornare la sezione "Stato esecuzione" qui sopra (checkbox + esito test) per l'handoff.
- Fuori scope di questo plan: i finding di review **R1/R2/R3** (atomicità salvataggio), **R4** (gate migration + test schema), **R5** (SHA orfani) — restano nel batch separato. **R7** è chiuso qui (Task 1 + Task 2/3).
