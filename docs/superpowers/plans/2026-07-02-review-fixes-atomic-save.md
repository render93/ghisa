# Fix review 2026-07-02 — Salvataggio seduta atomico + igiene doc/schema — Implementation Plan

> **✅ STATO (2026-07-02): TUTTI I 6 TASK COMPLETATI** su `feature/review-fixes-2026-07-02` (esecuzione subagent-driven, ogni task revisionato + final whole-branch review = *Ready to merge: Yes*, nessun Critical/Important).
> Commit: T1 `954656a` · T2 `b0f9483` (+`@types/node`) · T3 `8a54e4b` · T4 `0eaf989` · GATE (migration applicata + tipi rigenerati dall'utente) · T5 `5715ae8` · T6 `66d635a`.
> Suite 117/117, `npm run check` 0 errori. **NON** ancora mergiato/pushato (in attesa dell'utente) e verifica runtime nel browser (Task 6 Step 9) ancora da fare dall'utente.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il commit della seduta atomico per costruzione (una sola RPC transazionale + guard anti doppio-submit) e chiudere i finding di igiene doc/schema (R4/R5/R6) della review 2026-07-02.

**Architecture:** Una funzione Postgres `commit_workout` (`SECURITY INVOKER`, RLS intatta) scrive in un'unica transazione: riga `workouts`, righe `workout_entries`, avanzamento progressione `exercises`. Il client calcola i payload come oggi (via `applyEntryResult`) e li invia in una sola `supabase.rpc(...)`. Un guard `saving` sul bottone blocca il doppio-submit. Guardia offline schema↔tipi in CI.

**Tech Stack:** SvelteKit 2 · Svelte 5 runes · TypeScript · Vitest · Supabase (Postgres + RLS + PostgREST RPC) · adapter-static.

## Global Constraints

- Branch unico: `feature/review-fixes-2026-07-02`. **Niente merge/push/PR** senza ok esplicito dell'utente.
- `npm test` **e** `npm run check` verdi **prima di ogni commit**.
- Messaggi di commit in **italiano**. Ogni commit termina con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Copy UI in italiano, tono conciso/minuscolo.
- `trailingSlash: 'always'` → ogni `nav()`/`goto()` con slash finale.
- Store `.svelte.ts` (estensione obbligatoria per le rune). User id sempre via `supabase.auth.getUser()` a ogni scrittura. Nessuna service-role.
- Le soglie/impostazioni si leggono da `settingsStore.data`, non hardcoded.
- **Vincolo di sequenza sui tipi:** l'RPC aggiunge `Functions.commit_workout` a `src/lib/database.types.ts`; senza rigenerare i tipi, `supabase.rpc('commit_workout', …)` **non compila** (`npm run check` fallisce). Perciò il wiring `rpc` è l'ultimo passo, **dopo** il regen fatto dall'utente (gate tra Task 4 e Task 5).

---

## File Structure

**Creati:**
- `supabase/migrations/20260702000000_commit_workout_rpc.sql` — funzione transazionale `commit_workout`.
- `src/lib/schema-types.test.ts` — guardia offline: ogni colonna delle migration è presente in `database.types.ts`.
- `src/lib/stores/exercises.test.ts` — test per `applyLocal` + `domainToDb`.
- `src/lib/stores/workouts.test.ts` — test per `commit` (RPC mockata).

**Modificati:**
- `src/lib/stores/exercises.svelte.ts` — `export` di `domainToDb`; nuovo `applyLocal(exs)`.
- `src/lib/stores/workouts.svelte.ts` — `commit()` riscritto su singola `rpc`; helper `dbRowToEntry` estratto (DRY con `load`).
- `src/routes/workout/summary/+page.svelte` — `commit()` riscritto: guard `saving`, payload, `applyLocal`, niente `update` nel loop; bottone `disabled`.
- `src/lib/database.types.ts` — **rigenerato** dall'utente (non a mano) al gate.
- `CLAUDE.md` — sezione "Workout flow" riscritta; frase "single Supabase call" resa veritiera.
- `docs/superpowers/plans/2026-06-03-salto-e-arrotondamento-ibrido.md` — chiusura gate (R4).
- `docs/superpowers/plans/2026-06-03-linear-increment-steps.md` — SHA vivi (R5).
- `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md` — nota di stato (R6).
- `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md` — sezione `## Stato implementazione` (R6).

**Ordine:** Task 1 → 2 → 3 → 4 → **[GATE regen]** → 5 → 6.

---

## Task 1: Igiene doc R5 + R6

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-linear-increment-steps.md:6-8`
- Modify: `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md` (dopo il titolo H1)
- Modify: `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md` (in fondo)

**Interfaces:** nessuna (puro doc).

- [ ] **Step 1: R5 — sostituire i 3 SHA orfani con quelli vivi**

Nel file `docs/superpowers/plans/2026-06-03-linear-increment-steps.md`, sostituire le 3 righe (verificato via git: gli SHA orfani non sono raggiungibili da HEAD; i vivi hanno gli stessi subject):

Vecchio:
```
- Task 1 (motore + setting globale): commit `7311dcf` — 32 test verdi.
- Task 2 (migration + regen types): commit `d7e63ae` — colonna `linear_increment_steps` applicata su Supabase.
- Task 3 (store + form override): commit `5637bd9` — check 0 errori, build OK.
```
Nuovo:
```
- Task 1 (motore + setting globale): commit `982510f` — 32 test verdi.
- Task 2 (migration + regen types): commit `7ff9949` — colonna `linear_increment_steps` applicata su Supabase.
- Task 3 (store + form override): commit `0a22c3e` — check 0 errori, build OK.
```

- [ ] **Step 2: R6 — nota di stato in testa al plan fondativo**

In `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md`, inserire subito **dopo la prima riga di titolo `# ...`** questo blocco:
```markdown

> **✅ STATO (2026-07-02): COMPLETATO INTEGRALMENTE e in produzione.**
> L'app è live su GitHub Pages con Supabase; l'intera architettura descritta qui è stata costruita — vedi la storia di `main`. Le 174 checkbox `- [ ]` qui sotto **non** riflettono lo stato reale (non sono mai state spuntate durante l'esecuzione): sono da considerarsi tutte completate. Non ripartire da questo plan per re-implementare; usarlo solo come contesto storico.
```

- [ ] **Step 3: R6 — sezione stato nella design spec fondativa**

In fondo a `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md`, appendere:
```markdown

## Stato implementazione

**2026-07-02 — Completato integralmente e in produzione.**

Il design descritto in questo documento è stato implementato per intero: SPA SvelteKit statica su GitHub Pages, persistenza + auth Supabase con RLS `auth.uid() = user_id` su tutte le tabelle, store a rune, motore di progressione wave + lineare testato. Riferimento autorevole per lo stato attuale: la storia di `main` e `CLAUDE.md`. Questa sezione chiude il Task 48 (mai eseguito) del plan associato.
```

- [ ] **Step 4: Verifica**

Run:
```bash
git grep -nE "7311dcf|d7e63ae|5637bd9" docs/ || echo "OK: nessun SHA orfano residuo"
```
Expected: `OK: nessun SHA orfano residuo`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-03-linear-increment-steps.md \
        docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md \
        docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md
git commit -m "docs: igiene review (R5 SHA vivi, R6 stato piano fondativo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: R4 — guardia offline schema↔tipi

**Files:**
- Create: `src/lib/schema-types.test.ts`

**Interfaces:**
- Produces: nessun export (solo test). Parsa `supabase/migrations/*.sql` e verifica `src/lib/database.types.ts`.

- [ ] **Step 1: Scrivere il test**

Creare `src/lib/schema-types.test.ts` con questo contenuto completo:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = join(root, 'supabase/migrations');
const typesPath = join(root, 'src/lib/database.types.ts');

// Concatena tutte le migration, rimuovendo i commenti di riga (-- ...)
function loadMigrationsSql(): string {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n')
    .replace(/--[^\n]*/g, '');
}

// Estrae { tabella -> colonne } dalle CREATE TABLE (parentesi bilanciate)
function extractCreateTables(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /create\s+table\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1];
    let i = re.lastIndex - 1; // posizione della '('
    const start = i;
    let depth = 0;
    for (; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    out[table] = extractColumns(sql.slice(start + 1, i));
  }
  return out;
}

function extractColumns(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) parts.push(cur);

  const constraintKw = /^(primary|foreign|unique|check|constraint|exclude)\b/i;
  const cols: string[] = [];
  for (const raw of parts) {
    const line = raw.trim();
    if (!line || constraintKw.test(line)) continue;
    const name = line.split(/\s+/)[0].replace(/"/g, '');
    if (/^[a-z_][a-z0-9_]*$/i.test(name)) cols.push(name);
  }
  return cols;
}

// Estrae [tabella, colonna] dalle ALTER TABLE ... ADD COLUMN
function extractAddColumns(sql: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re =
    /alter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) out.push([m[1], m[2]]);
  return out;
}

// Estrae il blocco di una tabella dai tipi generati (graffe bilanciate)
function typeTableBlock(types: string, table: string): string {
  const re = new RegExp(`\\n\\s*${table}: \\{`);
  const m = re.exec(types);
  if (!m) return '';
  let i = types.indexOf('{', m.index);
  let depth = 0;
  for (; i < types.length; i++) {
    if (types[i] === '{') depth++;
    else if (types[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return types.slice(m.index, i);
}

describe('schema SQL ↔ database.types.ts', () => {
  const sql = loadMigrationsSql();
  const tables = extractCreateTables(sql);
  const added = extractAddColumns(sql);
  const types = readFileSync(typesPath, 'utf8');

  // Mappa attesa: colonne da CREATE TABLE + ADD COLUMN
  const expected: Record<string, Set<string>> = {};
  for (const [t, cols] of Object.entries(tables)) {
    expected[t] = new Set(cols);
  }
  for (const [t, c] of added) {
    (expected[t] ??= new Set()).add(c);
  }

  // Sanity: il parser ha trovato qualcosa (niente falsi verdi)
  it('parsa almeno 6 tabelle dalle migration', () => {
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(6);
  });

  it('parsa un numero plausibile di colonne', () => {
    const total = Object.values(expected).reduce((n, s) => n + s.size, 0);
    expect(total).toBeGreaterThanOrEqual(30);
  });

  // Ogni colonna dichiarata nelle migration è presente nei tipi, tabella giusta
  for (const [table, cols] of Object.entries(expected)) {
    const block = typeTableBlock(types, table);
    it(`i tipi contengono la tabella ${table}`, () => {
      expect(block, `tabella ${table} assente in database.types.ts`).not.toBe('');
    });
    for (const col of cols) {
      it(`${table}.${col} è presente in database.types.ts`, () => {
        const re = new RegExp(`\\b${col}: `);
        expect(re.test(block), `colonna ${table}.${col} assente nei tipi`).toBe(true);
      });
    }
  }
});
```

- [ ] **Step 2: Eseguire il test**

Run:
```bash
npx vitest run src/lib/schema-types.test.ts
```
Expected: **PASS** (i tipi attuali sono già allineati alle migration → la guardia conferma l'allineamento corrente). Se una colonna risultasse mancante, è drift reale: portare avanti il regen (Task 5) e riallineare prima di committare.

- [ ] **Step 3: R4 — chiudere il gate nel plan**

In `docs/superpowers/plans/2026-06-03-salto-e-arrotondamento-ibrido.md`, alla sezione del gate (righe ~23-26, il blocco `⚠️ SQL DA APPLICARE A MANO`), aggiungere subito sotto:
```markdown

> **✅ GATE CHIUSO (2026-07-02):** le colonne skip sono presenti sul DB (ogni salvataggio seduta scrive `workout_entries.skipped`) e in `src/lib/database.types.ts`. Allineamento migration↔tipi ora protetto in CI dal test offline `src/lib/schema-types.test.ts`. La prova finale (regen dei tipi) è registrata nel branch `feature/review-fixes-2026-07-02`.
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/schema-types.test.ts docs/superpowers/plans/2026-06-03-salto-e-arrotondamento-ibrido.md
git commit -m "test(schema): guardia offline migration↔database.types + chiudi gate R4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `domainToDb` export + `exercisesStore.applyLocal`

**Files:**
- Modify: `src/lib/stores/exercises.svelte.ts:46` (export), `:123-131` (returned object)
- Create: `src/lib/stores/exercises.test.ts`

**Interfaces:**
- Produces:
  - `export function domainToDb(ex: Exercise, userId: string): Omit<DbExercise, 'id'> & { id?: string }` — mapping camelCase→snake_case (già esistente, ora esportata; usata da `workouts.svelte.ts` nel Task 6).
  - `exercisesStore.applyLocal(exs: Exercise[]): void` — aggiorna **solo** lo stato in memoria per gli esercizi il cui `id` è già presente; nessun round-trip DB (la persistenza avviene atomicamente nell'RPC del Task 6).

- [ ] **Step 1: Scrivere il test (fallisce)**

Creare `src/lib/stores/exercises.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbRow = {
  id: 'e1',
  user_id: 'u1',
  name: 'Panca',
  scheme: 'linear',
  rest_seconds: 180,
  plate_rounding: null,
  bar_weight: null,
  linear_increment_steps: null,
  wave_base_load: null,
  wave_current_week: null,
  wave_current_cycle: null,
  cycle_failures: 0,
  pending_deload: false,
  linear_current_load: 100,
  linear_target_sets: 3,
  linear_target_reps: 5,
  linear_consecutive_failures: 0
};

vi.mock('$lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [dbRow], error: null }))
      }))
    }))
  }
}));

import { exercisesStore, domainToDb } from '$lib/stores/exercises.svelte';
import type { Exercise } from '$lib/domain/types';

describe('exercisesStore.applyLocal', () => {
  beforeEach(async () => {
    await exercisesStore.load();
  });

  it('aggiorna in memoria senza round-trip DB', () => {
    expect(exercisesStore.getById('e1')?.linearCurrentLoad).toBe(100);
    const updated: Exercise = { ...exercisesStore.getById('e1')!, linearCurrentLoad: 102.5 };
    exercisesStore.applyLocal([updated]);
    expect(exercisesStore.getById('e1')?.linearCurrentLoad).toBe(102.5);
  });

  it('ignora esercizi non presenti in memoria', () => {
    const ghost: Exercise = { ...exercisesStore.getById('e1')!, id: 'nope' };
    expect(() => exercisesStore.applyLocal([ghost])).not.toThrow();
    expect(exercisesStore.getById('nope')).toBeUndefined();
  });
});

describe('domainToDb', () => {
  beforeEach(async () => {
    await exercisesStore.load();
  });

  it('mappa camelCase → snake_case includendo id e user_id', () => {
    const row = domainToDb(exercisesStore.getById('e1')!, 'u1');
    expect(row.user_id).toBe('u1');
    expect(row.id).toBe('e1');
    expect(row.linear_current_load).toBe(100);
  });
});
```

- [ ] **Step 2: Eseguire il test — deve fallire**

Run:
```bash
npx vitest run src/lib/stores/exercises.test.ts
```
Expected: FAIL — `domainToDb` non è esportata e `applyLocal` non esiste.

- [ ] **Step 3: Esportare `domainToDb`**

In `src/lib/stores/exercises.svelte.ts` riga 46, cambiare:
```ts
function domainToDb(ex: Exercise, userId: string): Omit<DbExercise, 'id'> & { id?: string } {
```
in:
```ts
export function domainToDb(ex: Exercise, userId: string): Omit<DbExercise, 'id'> & { id?: string } {
```

- [ ] **Step 4: Aggiungere `applyLocal`**

In `src/lib/stores/exercises.svelte.ts`, dentro `createExercisesStore()`, subito dopo la funzione `update()` (dopo la riga 103), aggiungere:
```ts
  // Aggiorna SOLO lo stato in memoria, senza round-trip DB. Usato dopo il commit
  // atomico della seduta (RPC commit_workout), che ha già persistito la
  // progressione: qui si allinea la copia in memoria. Eccezione consapevole al
  // pattern optimistic+persist+rollback di update()/remove().
  function applyLocal(exs: Exercise[]) {
    for (const ex of exs) {
      const idx = state.items.findIndex((e) => e.id === ex.id);
      if (idx >= 0) state.items[idx] = ex;
    }
  }
```

Poi nell'oggetto ritornato (righe ~123-131) aggiungere `applyLocal` accanto agli altri metodi:
```ts
  return {
    get items() { return state.items; },
    get loaded() { return state.loaded; },
    load,
    create,
    update,
    remove,
    applyLocal,
    getById
  };
```

- [ ] **Step 5: Eseguire i test — devono passare**

Run:
```bash
npx vitest run src/lib/stores/exercises.test.ts && npm run check
```
Expected: test PASS; `check` 0 errori.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/exercises.svelte.ts src/lib/stores/exercises.test.ts
git commit -m "feat(store): esporta domainToDb + exercisesStore.applyLocal (in-memory)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migration `commit_workout` (artefatto SQL)

**Files:**
- Create: `supabase/migrations/20260702000000_commit_workout_rpc.sql`

**Interfaces:**
- Produces: funzione Postgres `commit_workout(p_scheda_id uuid, p_day_id uuid, p_performed_at timestamptz, p_duration_sec int, p_entries jsonb, p_exercise_updates jsonb) returns jsonb`. Ritorna `{ workout: <workouts row>, entries: [<workout_entries rows>] }`. Consumata dal Task 6.

> Nota: questo file SQL non viene eseguito localmente né dai test; è l'artefatto che l'utente applicherà al GATE. La verifica è la review della sintassi + il runtime post-applicazione.

- [ ] **Step 1: Creare la migration**

Creare `supabase/migrations/20260702000000_commit_workout_rpc.sql`:
```sql
-- Ghisa — commit_workout: salvataggio atomico della seduta
-- 2026-07-02
--
-- Scrive in UN'UNICA transazione: riga workouts, righe workout_entries e
-- l'avanzamento di progressione degli exercises. O tutto, o niente.
-- SECURITY INVOKER (default): la RLS auth.uid()=user_id resta il confine di
-- sicurezza; nessuna service-role.
--
-- MANUTENZIONE: l'UPDATE su exercises enumera le colonne di progressione.
-- Aggiungendo in futuro una colonna a exercises da persistere al commit,
-- aggiornare anche il blocco SET qui sotto.

create or replace function commit_workout(
  p_scheda_id uuid,
  p_day_id uuid,
  p_performed_at timestamptz,
  p_duration_sec int,
  p_entries jsonb,
  p_exercise_updates jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_workout workouts;
  v_entries jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into workouts (user_id, scheda_id, day_id, performed_at, duration_sec)
  values (v_uid, p_scheda_id, p_day_id, p_performed_at, p_duration_sec)
  returning * into v_workout;

  with ins as (
    insert into workout_entries (
      workout_id, user_id, exercise_id, position,
      prescribed, actual_sets, user_action, result_info,
      is_deload_session, skipped
    )
    select
      v_workout.id,
      v_uid,
      (e->>'exercise_id')::uuid,
      (e->>'position')::int,
      e->'prescribed',
      e->'actual_sets',
      e->>'user_action',
      e->'result_info',
      coalesce((e->>'is_deload_session')::boolean, false),
      coalesce((e->>'skipped')::boolean, false)
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_entries from ins;

  update exercises ex set
    wave_base_load = u.wave_base_load,
    wave_current_week = u.wave_current_week,
    wave_current_cycle = u.wave_current_cycle,
    cycle_failures = u.cycle_failures,
    pending_deload = u.pending_deload,
    linear_current_load = u.linear_current_load,
    linear_target_sets = u.linear_target_sets,
    linear_target_reps = u.linear_target_reps,
    linear_consecutive_failures = u.linear_consecutive_failures,
    updated_at = now()
  from jsonb_populate_recordset(null::exercises, coalesce(p_exercise_updates, '[]'::jsonb)) as u
  where ex.id = u.id and ex.user_id = v_uid;

  return jsonb_build_object('workout', to_jsonb(v_workout), 'entries', v_entries);
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260702000000_commit_workout_rpc.sql
git commit -m "feat(db): migration RPC transazionale commit_workout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 🔒 GATE — applicare la migration + rigenerare i tipi (azione utente)

Dopo il Task 4, **fermarsi** e chiedere all'utente di:

1. Aprire il **SQL Editor** di Supabase e incollare/eseguire il contenuto di `supabase/migrations/20260702000000_commit_workout_rpc.sql`.
2. Rigenerare i tipi (richiede la sua auth Supabase). Proporgli il comando con prefisso `!` (project-ref da `supabase/config.toml` o dashboard):
   ```
   !npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
   ```

Perché è necessario: il regen (a) aggiunge `Functions.commit_workout` ai tipi — senza cui il wiring del Task 6 non compila — e (b) **prova l'allineamento** migration↔DB↔tipi (chiude R4). Il diff atteso è minimo: l'aggiunta della funzione `commit_workout`. Un diff inatteso su tabelle/colonne rivela drift da hand-edit passati e va comunque committato (i tipi diventano finalmente allineati). Non proseguire al Task 5 finché l'utente non conferma di aver eseguito entrambi i passi.

---

## Task 5: Commit dei tipi rigenerati (post-GATE)

**Files:**
- Modify: `src/lib/database.types.ts` (rigenerato dall'utente)

**Interfaces:**
- Consumes: nulla.
- Produces: tipo `Functions.commit_workout` disponibile per `supabase.rpc(...)` nel Task 6.

- [ ] **Step 1: Verificare il diff dei tipi**

Run:
```bash
git --no-pager diff --stat src/lib/database.types.ts
git --no-pager diff src/lib/database.types.ts | grep -A6 "commit_workout" | head -40
```
Expected: comparsa di `commit_workout` nella sezione `Functions`. Se il diff tocca anche tabelle/colonne, va bene: è drift pregresso ora sanato.

- [ ] **Step 2: Guardia + type-check ancora verdi**

Run:
```bash
npx vitest run src/lib/schema-types.test.ts && npm run check
```
Expected: test schema PASS; `check` 0 errori.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore(types): rigenera database.types dopo migration commit_workout (prova R4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Salvataggio atomico — store `commit` + componente + doc

**Files:**
- Modify: `src/lib/stores/workouts.svelte.ts:39-66` (estrai `dbRowToEntry`), `:70-136` (riscrivi `commit`)
- Modify: `src/routes/workout/summary/+page.svelte:1-67` (script) e `:126` (bottone)
- Modify: `CLAUDE.md` (sezione "Workout flow")
- Create/Modify: `src/lib/stores/workouts.test.ts`

**Interfaces:**
- Consumes:
  - `domainToDb(ex, userId)` da `$lib/stores/exercises.svelte` (Task 3).
  - `exercisesStore.applyLocal(exs)` (Task 3).
  - `supabase.rpc('commit_workout', {...})` (Task 4 + tipi Task 5).
- Produces:
  - `workoutsStore.commit(schedaId, dayId, performedAt, durationSec, entries, exerciseUpdates: Exercise[]): Promise<Workout>` — firma con il nuovo ultimo parametro `exerciseUpdates`.

- [ ] **Step 1: Scrivere il test dello store (fallisce)**

Creare `src/lib/stores/workouts.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('$lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    rpc: (...a: unknown[]) => rpc(...a)
  }
}));

import { workoutsStore } from '$lib/stores/workouts.svelte';
import type { Exercise } from '$lib/domain/types';

const entry = {
  exerciseId: 'e1',
  position: 0,
  prescribed: { sets: 3, reps: 5, load: 100, barWeight: 20, isDeload: false },
  actualSets: [{ status: 'ok' as const, reps: 5, load: 100 }],
  userAction: null,
  resultInfo: null,
  isDeloadSession: false,
  skipped: false
};

const exUpdate = { id: 'e1', name: 'Panca', scheme: 'linear', restSeconds: 180,
  cycleFailures: 0, pendingDeload: false, linearConsecutiveFailures: 0,
  linearCurrentLoad: 102.5, linearTargetSets: 3, linearTargetReps: 5 } as unknown as Exercise;

beforeEach(() => {
  rpc.mockReset();
  getUser.mockClear();
});

describe('workoutsStore.commit', () => {
  it('invia una sola rpc(commit_workout) con payload corretto e aggiorna lo stato', async () => {
    rpc.mockResolvedValue({
      data: {
        workout: { id: 'w1', skipped: false, note: null },
        entries: [{ id: 'we1', workout_id: 'w1', exercise_id: 'e1', position: 0,
          prescribed: entry.prescribed, actual_sets: entry.actualSets, user_action: null,
          result_info: null, is_deload_session: false, skipped: false }]
      },
      error: null
    });

    const w = await workoutsStore.commit('s1', 'd1', '2026-07-02T10:00:00Z', 3600, [entry], [exUpdate]);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('commit_workout');
    expect(args.p_scheda_id).toBe('s1');
    expect(args.p_entries[0].exercise_id).toBe('e1');
    expect(args.p_entries[0].actual_sets).toEqual(entry.actualSets);
    expect(args.p_exercise_updates[0].linear_current_load).toBe(102.5);
    expect(args.p_exercise_updates[0].user_id).toBe('u1');

    expect(w.id).toBe('w1');
    expect(w.entries[0].id).toBe('we1');
    expect(workoutsStore.items[0]?.id).toBe('w1');
  });

  it('su errore rpc lancia e non modifica lo stato', async () => {
    const before = workoutsStore.items.length;
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      workoutsStore.commit('s1', 'd1', '2026-07-02T10:00:00Z', 3600, [entry], [exUpdate])
    ).rejects.toBeTruthy();

    expect(workoutsStore.items.length).toBe(before);
  });
});
```

- [ ] **Step 2: Eseguire il test — deve fallire**

Run:
```bash
npx vitest run src/lib/stores/workouts.test.ts
```
Expected: FAIL — `commit` fa ancora due insert `.from(...).insert(...)`, non `rpc`; `rpc` non viene chiamata.

- [ ] **Step 3: Estrarre `dbRowToEntry` e riscrivere `commit`**

In `src/lib/stores/workouts.svelte.ts`:

(a) In cima, aggiornare gli import:
```ts
import { supabase } from '$lib/supabase';
import { domainToDb } from '$lib/stores/exercises.svelte';
import type { Entry, Exercise, ProgressionResult } from '$lib/domain/types';
import type { Json } from '$lib/database.types';
```

(b) Aggiungere l'helper `dbRowToEntry` (subito prima di `createWorkoutsStore()`):
```ts
function dbRowToEntry(e: Record<string, unknown>): WorkoutEntryRecord {
  return {
    id: e.id as string,
    workoutId: e.workout_id as string,
    exerciseId: e.exercise_id as string,
    position: e.position as number,
    prescribed: e.prescribed as Entry['prescribed'],
    actualSets: e.actual_sets as Entry['actualSets'],
    userAction: e.user_action as 'repeat' | null,
    resultInfo: e.result_info as ProgressionResult | null,
    isDeloadSession: e.is_deload_session as boolean,
    skipped: e.skipped as boolean
  };
}
```

(c) In `load()`, sostituire il blocco di mapping inline (righe ~41-52) usando l'helper:
```ts
    for (const e of entries || []) {
      const rec = dbRowToEntry(e as Record<string, unknown>);
      if (!entriesByWorkout.has(rec.workoutId)) entriesByWorkout.set(rec.workoutId, []);
      entriesByWorkout.get(rec.workoutId)!.push(rec);
    }
```

(d) Sostituire **interamente** la funzione `commit(...)` (righe ~70-136) con:
```ts
  async function commit(
    schedaId: string | null,
    dayId: string | null,
    performedAt: string,
    durationSec: number,
    entries: Omit<WorkoutEntryRecord, 'id' | 'workoutId'>[],
    exerciseUpdates: Exercise[]
  ): Promise<Workout> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const p_entries = entries.map((e, i) => ({
      exercise_id: e.exerciseId,
      position: i,
      prescribed: e.prescribed,
      actual_sets: e.actualSets,
      user_action: e.userAction,
      result_info: e.resultInfo,
      is_deload_session: e.isDeloadSession,
      skipped: e.skipped
    }));
    const p_exercise_updates = exerciseUpdates.map((ex) => domainToDb(ex, user.id));

    const { data, error } = await supabase.rpc('commit_workout', {
      p_scheda_id: schedaId,
      p_day_id: dayId,
      p_performed_at: performedAt,
      p_duration_sec: durationSec,
      p_entries: p_entries as unknown as Json,
      p_exercise_updates: p_exercise_updates as unknown as Json
    });
    if (error) throw error;

    const payload = data as { workout: Record<string, unknown>; entries: Record<string, unknown>[] };
    const w = payload.workout;
    const newWorkout: Workout = {
      id: w.id as string,
      schedaId,
      dayId,
      performedAt,
      durationSec,
      skipped: (w.skipped as boolean) ?? false,
      note: (w.note as string | null) ?? null,
      entries: (payload.entries || []).map(dbRowToEntry)
    };
    state.items = [newWorkout, ...state.items];
    return newWorkout;
  }
```

- [ ] **Step 4: Eseguire il test dello store — deve passare**

Run:
```bash
npx vitest run src/lib/stores/workouts.test.ts
```
Expected: PASS (2 test).

- [ ] **Step 5: Riscrivere `commit()` nel componente riepilogo**

In `src/routes/workout/summary/+page.svelte`:

(a) Import dei tipi (riga 9), aggiungere `Exercise`:
```ts
  import type { Entry, Exercise, ProgressionResult } from '$lib/domain/types';
```

(b) Aggiungere lo stato `saving` dopo la riga `const draft = $derived(...)` (riga 11):
```ts
  let saving = $state(false);
```

(c) Sostituire **interamente** la funzione `commit()` (righe ~21-62) con:
```ts
  async function commit() {
    if (!draft || saving) return;
    saving = true;
    try {
      const entries: Parameters<typeof workoutsStore.commit>[4] = [];
      const exerciseUpdates: Exercise[] = [];
      for (const de of draft.exercises) {
        const ex = exercisesStore.getById(de.exerciseId);
        const entry = entryFromDraft(de);
        const anyLogged = entry.actualSets.some((s) => s.status !== null);

        let resultInfo: ProgressionResult | null = null;
        let userAction: 'repeat' | null = null;
        if (!de.skipped && anyLogged && ex) {
          userAction = workoutDraftStore.summaryChoices[de.exerciseId] ?? null;
          const r = applyEntryResult(ex, entry, userAction, settingsStore.data);
          resultInfo = r.info;
          exerciseUpdates.push(r.updatedExercise);
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
      }

      const durationSec = Math.max(
        0,
        Math.round((Date.now() - new Date(draft.date).getTime()) / 1000)
      );

      await workoutsStore.commit(draft.schedaId, draft.dayId, draft.date, durationSec, entries, exerciseUpdates);
      exercisesStore.applyLocal(exerciseUpdates);
      workoutDraftStore.cancel();
      nav('/storico/');
    } catch (err) {
      alert('Errore salvataggio: ' + (err instanceof Error ? err.message : ''));
    } finally {
      saving = false;
    }
  }
```

(d) Bottone (riga ~126): aggiungere `disabled` e label dinamica:
```svelte
    <button class="btn primary" onclick={commit} disabled={saving} style="margin-top: 24px;">
      {saving ? 'Salvataggio…' : 'Conferma e salva'}
    </button>
```

(e) Aggiungere lo stile disabled in fondo al blocco `<style>` (dopo `.btn.primary`):
```css
  .btn:disabled {
    opacity: 0.6;
  }
```

- [ ] **Step 6: Aggiornare `CLAUDE.md` (sezione "Workout flow")**

In `CLAUDE.md`, sostituire il blocco che descrive il flusso (i 4 punti numerati + la frase sull'unica place) con:
```markdown
The draft becomes a real DB record only when the user confirms in `/workout/summary/`:
1. For each entry with any logged set, `applyEntryResult(...)` computes the updated exercise + result info; the component collects the entries and the advanced exercises.
2. A single transactional RPC — `supabase.rpc('commit_workout', ...)` via `workoutsStore.commit(...)` — inserts one `workouts` row + N `workout_entries` rows **and** advances the exercises' progression, all in one Postgres transaction (all-or-nothing).
3. On success the in-memory exercise state is synced via `exercisesStore.applyLocal(...)` (no extra DB round-trip), the draft is cleared, and the user is sent to `/storico/`. On failure nothing is written, the draft is kept, and a retry is clean.

A `saving` flag disables the confirm button to prevent double-submit. This is the **only** place exercise progression state advances. If you add a new mutation path, route it through the same `commit_workout` RPC or progression state will desync from history.
```

- [ ] **Step 7: Verifica completa**

Run:
```bash
npm run check && npm test
```
Expected: `check` 0 errori; **tutti** i test PASS (progression, utils, schema-types, exercises, workouts).

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/workouts.svelte.ts src/lib/stores/workouts.test.ts \
        src/routes/workout/summary/+page.svelte CLAUDE.md
git commit -m "feat(seduta): commit atomico via RPC commit_workout + guard doppio-submit (R1/R2/R3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Verifica a runtime (utente, browser)**

Chiedere all'utente di verificare nel browser:
1. Seduta normale → "Conferma e salva" → seduta in `/storico/`, progressione avanzata una sola volta.
2. Doppio-tap rapido sul bottone → una sola seduta salvata (il bottone si disabilita).
3. (Opz.) Simulare errore rete durante il commit → alert, draft ancora presente, nessuna seduta né avanzamento; retry pulito.

---

## Self-Review

**1. Spec coverage:**
- R1 (progressione prima del commit) → Task 6 (RPC transazionale, niente `update` nel loop). ✓
- R2 (doppio-submit) → Task 6 step 5 (guard `saving` + `disabled`). ✓
- R3 (due insert non transazionali) → Task 4 + Task 6 (singola `rpc`). ✓
- R4 (gate + tipi a mano) → Task 2 (guardia offline + gate doc) + GATE regen + Task 5 (prova). ✓
- R5 (SHA orfani) → Task 1 step 1. ✓
- R6 (piano fondativo senza stato) → Task 1 step 2-3. ✓
- Non-obiettivi (draft persistence, idempotency-key, probe live) → non implementati, come da spec. ✓
- Doc `CLAUDE.md` "single call" → Task 6 step 6. ✓

**2. Placeholder scan:** nessun TBD/TODO; tutto il codice è mostrato per intero. L'unico `<project-ref>` è nel comando utente al GATE (valore noto solo all'utente). ✓

**3. Type consistency:**
- `commit(...)` nuova firma con `exerciseUpdates: Exercise[]` — usata identica in store (Task 6 step 3d), test (Task 6 step 1) e componente via `Parameters<typeof workoutsStore.commit>[4]` (Task 6 step 5c). ✓
- `applyLocal(exs: Exercise[])` — definita in Task 3 step 4, usata in Task 6 step 5c. ✓
- `domainToDb(ex, userId)` — esportata in Task 3 step 3, importata/usata in Task 6 step 3. ✓
- `dbRowToEntry` — definita e usata solo in `workouts.svelte.ts` (Task 6 step 3b/c/d). ✓
- Payload RPC (`p_entries`, `p_exercise_updates`, ecc.) coerente tra migration (Task 4), store (Task 6 step 3d) e test (Task 6 step 1). ✓
```
