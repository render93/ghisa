# Design — Fix della review 2026-07-02 (salvataggio seduta atomico + igiene doc/schema)

**Data:** 2026-07-02 · **Branch:** `feature/review-fixes-2026-07-02` · **Autore:** brainstorming collaborativo

## Contesto

La review multi-agente del 2026-07-02 (`docs/code-review-2026-07-02.md`, handoff `docs/HANDOFF-2026-07-02-review-fixes.md`) ha prodotto 6 finding aperti. Già risolti a parte: R7, A3-04 (PR #7).

Questo design copre **tutti e 6 i finding rimanenti in un unico branch, in sequenza**:

- **Unità A (R1 alta · R2 media · R3 media)** — il salvataggio della seduta non è atomico su tre livelli. Un unico intervento: RPC transazionale + guard anti doppio-submit.
- **R4 (media)** — gate migration skip mai chiuso + `database.types.ts` mantenuto a mano. Fix: prova di allineamento (regen) + test offline schema↔tipi.
- **R5 (bassa)** — SHA orfani in un doc. Fix: sostituzione con gli SHA vivi.
- **R6 (bassa)** — piano fondativo senza tracking di stato. Fix: note di stato in plan + spec.

## Obiettivo e non-obiettivi

**Obiettivo:** rendere il commit della seduta **atomico per costruzione** (o tutto, o niente), impossibile da desincronizzare tra progressione (`exercises`) e storico (`workouts`/`workout_entries`); più igiene doc/schema.

**Non-obiettivi (esplicitamente fuori scope):**
- Persistenza incrementale del draft di seduta per resilienza ai crash. Discusso e rimandato: è una feature separata, non un fix di atomicità. Vedi memoria `project-draft-persistence-crash-resilience`. Il draft resta in memoria come oggi.
- Idempotency-key lato dati (UUID seduta + `on conflict do nothing`). Omesso per YAGNI: il guard `saving` + il rollback transazionale coprono i casi reali di un'app single-user.
- Probe live schema↔DB in CI. La guardia è offline; un eventuale probe on-demand è extra futuro.

---

## Unità A — Salvataggio seduta atomico (Opzione A: RPC transazionale)

### Problema (stato attuale, verificato nel codice)

`src/routes/workout/summary/+page.svelte` `commit()`:
- riga 35: `await exercisesStore.update(r.updatedExercise)` **dentro il loop, fuori dal `try`** → la progressione è **persistita su Supabase prima** del commit della seduta. Se il commit fallisce, gli esercizi restano avanzati su DB, nessuna riga in `workouts`, draft intatto → al retry `applyEntryResult` ri-avanza (**R1**, alta).
- riga 126: bottone "Conferma e salva" senza flag "in corso" né `disabled` → doppio-tap su mobile invoca `commit()` due volte concorrenti (**R2**, media).

`src/lib/stores/workouts.svelte.ts` `commit()` (righe 70-136): **due insert separati non transazionali** — prima `workouts` (:80-91), poi `workout_entries` (:107-111). Se il secondo fallisce → riga `workouts` orfana senza compensazione (**R3**, media).

`CLAUDE.md` dichiara erroneamente il flusso "apply → update → commit" atomico e "inserts … in a single Supabase call".

### Soluzione: funzione Postgres `commit_workout`

Nuova migration `supabase/migrations/20260702000000_commit_workout_rpc.sql`.

- `SECURITY INVOKER` (default): la RLS `auth.uid() = user_id` resta il confine di sicurezza. Nessuna service-role (conforme a CLAUDE.md).
- Una singola transazione (le funzioni plpgsql sono transazionali) esegue, in ordine:
  1. `insert into workouts` con `user_id = auth.uid()` → riga seduta.
  2. `insert into workout_entries` dagli elementi di `p_entries jsonb` (array), con `workout_id` della riga appena creata e `user_id = auth.uid()`.
  3. `update exercises` per gli esercizi avanzati, sorgente `p_exercise_updates jsonb` (array), tipizzato via `jsonb_populate_recordset(null::exercises, p_exercise_updates)`; `where id = u.id and user_id = auth.uid()`; il `SET` enumera esplicitamente le colonne di progressione (+ `updated_at = now()`).
- Guardia: se `auth.uid()` è null → `raise exception 'not authenticated'`.
- Ritorno: la riga `workouts` creata **e** le entry inserite con i loro id generati dal DB (es. `jsonb_build_object('workout', to_jsonb(v_workout), 'entries', <array entry inserite>)`), così lo store ricostruisce l'oggetto `Workout` in memoria con la stessa forma di oggi.

**Firma (contratto):**
```
commit_workout(
  p_scheda_id     uuid,
  p_day_id        uuid,
  p_performed_at  timestamptz,
  p_duration_sec  int,
  p_entries       jsonb,   -- [{ exercise_id, position, prescribed, actual_sets,
                           --    user_action, result_info, is_deload_session, skipped }]
  p_exercise_updates jsonb -- [ <riga exercises snake_case, come domainToDb> ]
) returns jsonb            -- { workout: <workouts row>, entries: [<workout_entries rows>] }
```

**Tassa di manutenzione nota:** l'`UPDATE exercises` enumera le colonne. Aggiungendo in futuro una colonna a `exercises`, va aggiornato anche questo RPC. Documentato qui e nel commento della migration.

### Modifiche client

**`src/lib/stores/workouts.svelte.ts` — `commit(...)`:**
- Nuova firma: aggiunge `exerciseUpdates: Exercise[]` come ultimo parametro.
- Corpo: una sola `supabase.rpc('commit_workout', { … })` con `p_entries` e `p_exercise_updates` (quest'ultimo = `exerciseUpdates.map(ex => domainToDb(ex, user.id))`). `domainToDb` va importato/condiviso da exercises (o duplicato minimamente; preferenza: esportarlo da `exercises.svelte.ts`).
- Su successo: ricostruisce `newWorkout` dal payload di ritorno, `state.items = [newWorkout, ...state.items]`, `return newWorkout`.
- Su errore RPC: `throw` (nessuna scrittura è avvenuta — transazione rolled back).

**`src/lib/stores/exercises.svelte.ts` — nuovo `applyLocal(exs: Exercise[])`:**
- Aggiorna **solo** lo stato in memoria (`state.items`), **senza** round-trip DB, perché la persistenza è già avvenuta atomicamente nell'RPC.
- Documentato inline come eccezione consapevole al pattern optimistic+persist+rollback (che resta valido per `update()`/`remove()`).
- `domainToDb` esportato per uso dello store workouts.

**`src/routes/workout/summary/+page.svelte` — `commit()`:**
- `let saving = $state(false)`; guard `if (!draft || saving) return;` in cima; `saving = true` prima del lavoro; `finally { saving = false }`.
- Bottone: `disabled={saving}` (+ eventuale label "Salvataggio…" durante).
- Il loop **non chiama più** `exercisesStore.update`. Costruisce `entries[]` e raccoglie `exerciseUpdates[]` (i `r.updatedExercise` da `applyEntryResult`).
- Dentro il `try`: `const w = await workoutsStore.commit(schedaId, dayId, date, durationSec, entries, exerciseUpdates)`; poi `exercisesStore.applyLocal(exerciseUpdates)`; poi `workoutDraftStore.cancel()`; poi `nav('/storico/')`.
- Su errore: `alert(...)`, draft intatto (nessun `cancel`), stato invariato.

### Comportamento risultante

- **R1 eliminato:** nessuna progressione persistita prima del commit. Un fallimento della RPC non scrive **nulla**; draft intatto; il retry ricalcola dallo stesso stato → nessun doppio avanzamento.
- **R2 eliminato:** il doppio-tap è bloccato dal guard `saving` + `disabled`.
- **R3 eliminato:** una sola chiamata transazionale; nessuna riga orfana possibile.

### Sequenziamento (vincolo sui tipi)

L'RPC aggiunge `Functions.commit_workout` a `database.types.ts`; senza rigenerare i tipi, `supabase.rpc('commit_workout', …)` non compila (`npm run check` fallirebbe). Perciò:
1. Scrittura di: migration SQL, guard `saving`, refactor che costruisce i payload, `applyLocal`, `domainToDb` esportato, test store — tutto ciò che **non** richiede i nuovi tipi (il wiring `rpc` finale resta l'ultimo passo).
2. **STOP operativo:** l'utente applica la migration nel SQL editor Supabase e rigenera i tipi (`npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`). Questo **chiude anche R4** (il regen prova l'allineamento e raccoglie sia le colonne skip sia la nuova funzione).
3. Completamento del wiring `rpc` tipizzato → `npm run check` + `npm test` verdi.

### Test (Vitest)

- Test store per `workoutsStore.commit` con `$lib/supabase` mockato (`vi.mock`):
  - asserisce **una sola** chiamata `supabase.rpc('commit_workout', …)` con payload corretto (entries + exercise_updates ben formati);
  - su successo: `state.items` aggiornato con la nuova seduta;
  - su errore RPC: `throw` e **nessuna** modifica a `state.items`.
- Guard `saving` e transazione DB: verifica a runtime nel browser (doppio-tap; commit che fallisce → nessuna scrittura; retry pulito).

### Doc

- `CLAUDE.md` sezione "Workout flow": riscritta sul nuovo flusso RPC (single transactional call). Corretta la frase "inserts … in a single Supabase call" (ora veritiera).

---

## R4 — Gate migration skip + guardia schema↔tipi

### Doc
- `docs/superpowers/plans/2026-06-03-salto-e-arrotondamento-ibrido.md:23-26`: chiudere il gate con data verifica (2026-07-02) e nota che l'allineamento è provato dal regen (diff atteso: nessuna colonna mancante; presenza della funzione `commit_workout`).

### Prova d'allineamento
- Il regen dei tipi dello step 2 del sequenziamento Unità A fa doppio servizio: dimostra che le colonne skip (`workout_entries.skipped`, `workouts.note`, ecc.) sono sul DB **e** raccoglie la nuova RPC. Un solo comando chiude R4 + il wiring.

### Guardia CI-safe (test offline)
Nuovo test Vitest (es. `src/lib/schema-types.test.ts`):
- Legge tutti i file `supabase/migrations/*.sql`.
- Estrae con regex: `CREATE TABLE <t> ( … )` (colonne dentro le parentesi) e `ALTER TABLE <t> ADD COLUMN <c>`.
- Costruisce la mappa attesa `{ tabella → set(colonne) }`.
- Legge `src/lib/database.types.ts` e verifica che per ogni tabella la sezione `Tables.<t>.Row` contenga ogni colonna attesa.
- Fallisce se una colonna presente nelle migration manca nei tipi → intercetta regen dimenticato / hand-edit. Nessuna rete.
- Robustezza parsing: gestire `if not exists`, virgolette, commenti `--`, tipi multi-parola; il test deve essere tollerante ma non silenziosamente vuoto (asserire che ha trovato ≥ N tabelle/colonne, così un parser rotto non "passa" trovando nulla).

---

## R5 — SHA orfani (puro doc)

`docs/superpowers/plans/2026-06-03-linear-increment-steps.md:6-8`: sostituire i 3 SHA orfani con i vivi, mappati per subject (verificato via git):
- Task 1 (motore + setting globale): `7311dcf` → **`982510f`**
- Task 2 (migration + regen types): `d7e63ae` → **`7ff9949`**
- Task 3 (store + form override): `5637bd9` → **`0a22c3e`**

---

## R6 — Piano fondativo senza stato (puro doc)

- `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md`: nota di stato in testa ("✅ completato integralmente e in produzione — vedi storia di `main`; le 174 checkbox non riflettono lo stato reale, l'app è live").
- `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md`: aggiungere sezione `## Stato implementazione` (il Task 48 mai eseguito) con sintesi dello stato attuale.

---

## Ordine di esecuzione del branch

Tutto sequenziale, un solo branch (`feature/review-fixes-2026-07-02`); `npm test` + `npm run check` verdi prima di ogni commit; commit in italiano; **niente merge/push/PR** senza ok esplicito.

1. **R5 + R6** (doc puro, rischio zero) → commit.
2. **R4**: test offline schema↔tipi + chiusura gate doc → commit.
3. **Unità A**: migration SQL + guard `saving` + refactor payload/store/`applyLocal` + `domainToDb` esportato + test store + doc `CLAUDE.md` → commit.
4. **STOP**: passare all'utente la migration da applicare + comando regen tipi.
5. **Unità A wiring finale**: chiamata `rpc` tipizzata + `check`/`test` verdi → commit.

## Rischi e mitigazioni

- **Il regen tipi richiede l'auth Supabase dell'utente** → proposto come comando `!`; il branch è progettato per fermarsi lì senza lasciare `check` rotto (gli step 1-3 non toccano il wiring `rpc`).
- **Tassa colonne nell'RPC** → documentata in migration e CLAUDE.md.
- **Parsing SQL fragile nel test R4** → asserzioni di sanity (numero minimo tabelle/colonne trovate) per evitare falsi verdi.
