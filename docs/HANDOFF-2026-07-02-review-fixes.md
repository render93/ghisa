# Handoff — Fix rimanenti dalla review del 2026-07-02

> **Per l'agente che riprende:** questo file è autocontenuto. Il progetto ha `.tokensave/` inizializzato: usa `tokensave_context`/`tokensave_body`/`tokensave_search` per esplorare il codice (NON Explore/grep/glob). Lavora su un **branch di feature** (mai su `main`); test verdi (`npm test` + `npm run check`) prima di ogni commit; commit in italiano; **non** mergiare/pushare/aprire PR senza ok esplicito dell'utente. Per l'Unità A (sotto) fai **prima** `superpowers:brainstorming` — richiede decisioni di design.

## Contesto

Ghisa — diario di allenamento single-user, SPA statica su GitHub Pages con Supabase (auth + persistenza, RLS `auth.uid() = user_id`). Stack: SvelteKit 2 · Svelte 5 runes · TypeScript · Vitest · adapter-static. `trailingSlash: 'always'` (ogni `nav()`/`goto()` con slash finale). Vedi `CLAUDE.md` per l'architettura.

Il 2026-07-02 una review multi-agente ha prodotto una lista di finding. Resoconto completo: **`docs/code-review-2026-07-02.md`** (potrebbe essere untracked: chiedi all'utente o cercalo nel working tree).

**Già risolto** (non rifare):
- **R7** — soglia di deload lineare resa configurabile (`settings.linearFailThreshold`).
- **A3-04** — obbligo di loggare tutte le serie prima di concludere.
Entrambi dentro la feature "cambio peso in seduta" — branch `feature/linear-load-shift` / PR #7 (in merge su `main`). Spec: `docs/superpowers/specs/2026-07-02-cambio-peso-seduta-design.md`; plan: `docs/superpowers/plans/2026-07-02-cambio-peso-seduta.md`.

**Restano da fare:** R1, R2, R3 (atomicità salvataggio), R4 (migration skip + test schema), R5 (SHA orfani), R6 (piano fondativo senza stato).

> Nota: i riferimenti `file:riga` qui sotto valgono per lo stato attuale; `workout/summary/+page.svelte` e `workouts.svelte.ts` **non** sono stati toccati dalla feature cambio-peso, quindi restano validi anche dopo il merge di PR #7. Verifica comunque con tokensave prima di editare.

---

## Unità A — Atomicità del salvataggio seduta (R1 alta · R2 media · R3 media)

Tre facce dello stesso rischio (il flusso di commit della seduta non è atomico). Conviene **un unico intervento progettato insieme** — fai brainstorming prima. Intervenire su uno solo lascia aperti gli altri percorsi verso il desync progressione↔storico.

### R1 (ALTA) — la progressione è persistita prima del commit; un retry la ri-avanza
- **File:** `src/routes/workout/summary/+page.svelte:21-62` (funzione `commit()`), con `src/lib/stores/exercises.svelte.ts:90-103` (`update()` fa rollback in memoria e **rilancia** l'errore).
- **Problema:** nel loop, ogni `await exercisesStore.update(r.updatedExercise)` (riga ~35) **persiste su Supabase** il nuovo stato di progressione **prima** che `workoutsStore.commit(...)` (riga ~56) inserisca la seduta. La chiamata `update` sta **fuori** dal `try` (che copre solo il commit finale). Se il commit fallisce → esercizi già avanzati su DB, nessuna riga in `workouts`, e `workoutDraftStore.cancel()` non viene chiamato (draft intatto): al retry `getById` restituisce l'esercizio già avanzato e `applyEntryResult` lo avanza di nuovo. Se fallisce a metà loop (2° esercizio di N) → rejection silenziosa (nessun alert), avanzamento parziale.
- **Fix (da brainstormare):** invertire l'ordine (prima `workoutsStore.commit`, poi l'avanzamento della progressione) oppure introdurre idempotenza + compensazione; portare il loop dentro il `try`. Aggiornare la sezione "Workout flow" di `CLAUDE.md`, che oggi descrive la sequenza apply→update→commit come atomica.

### R2 (media) — nessun guard anti doppio-submit
- **File:** `src/routes/workout/summary/+page.svelte:126` (bottone "Conferma e salva") + `commit()` async.
- **Problema:** `commit()` è async, nessuna flag "in corso" né `disabled`; il draft è azzerato solo a commit riuscito. Su mobile (target dell'app) un doppio tap invoca `commit()` due volte concorrenti → l'assegnazione ottimistica in `exercisesStore.update` è sincrona (`state.items[idx] = ex` prima del primo `await`), quindi la seconda legge l'esercizio già avanzato → due righe `workouts` con entry duplicate + possibile doppio avanzamento.
- **Fix:** flag `saving` in `$state` + `disabled` sul bottone; idempotenza lato dati come rete di sicurezza.

### R3 (media) — `commit` non transazionale: riga `workouts` orfana
- **File:** `src/lib/stores/workouts.svelte.ts:80-111`.
- **Problema:** la seduta è scritta con **due** insert Supabase separati (prima `workouts` :80-91, poi `workout_entries` :107-111). Se il secondo fallisce (`if (e2) throw e2`), resta una riga `workouts` orfana senza compensazione (in `/storico/` apparirebbe come seduta a 0 esercizi). `CLAUDE.md` dichiara erroneamente "inserts ... in a single Supabase call".
- **Fix:** spostare l'inserimento in una funzione Postgres/RPC transazionale (vera "single call"), oppure in subordine compensare (delete della riga `workouts` se `e2`); correggere la frase in `CLAUDE.md`.

---

## R4 (media) — gate migration skip mai chiuso + `database.types.ts` mantenuto a mano

- **Situazione:** `docs/superpowers/plans/2026-06-03-salto-e-arrotondamento-ibrido.md:23-26` tiene aperto un gate — *"SQL DA APPLICARE A MANO … non ancora eseguita … il salto fallirà a runtime … verifica runtime da fare"*. È **falso oggi**: le colonne skip esistono sul DB (dedotto perché `workoutsStore.commit` scrive `workout_entries.skipped` a ogni seduta salvata, `src/lib/stores/workouts.svelte.ts:104`; se non esistesse, nessuna seduta si salverebbe). La migration `supabase/migrations/20260603000001_add_skip_columns.sql` è quindi già applicata. Inoltre `src/lib/database.types.ts` è stato **editato a mano** (commit `7ea0c48`) invece che rigenerato — viola la regola di `CLAUDE.md`.
- **Fix (2 parti):**
  1. **Doc:** chiudere il gate nel plan con la data di verifica.
  2. **Prova + guardia:** far rigenerare i tipi all'utente — `npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts` (serve auth Supabase dell'utente; proponi il comando con prefisso `!`). Diff vuoto = allineamento provato. **E** aggiungere un **test offline** in `npm test` che parsa `supabase/migrations/*.sql` (`CREATE TABLE` + `ALTER TABLE ... ADD COLUMN`) e verifica che `src/lib/database.types.ts` contenga ogni colonna, nella tabella giusta — guardia CI-safe contro il regen-a-mano dimenticato. **Approccio già concordato con l'utente:** test offline migration↔tipi in CI (non serve rete); eventuale script probe-live on-demand (`npm run verify:schema` con anon key) come extra fuori dalla CI.

## R5 (bassa) — SHA orfani nel doc

- **File:** `docs/superpowers/plans/2026-06-03-linear-increment-steps.md:6-8`.
- **Problema:** cita 3 commit pre-rebase irraggiungibili da HEAD (`7311dcf`, `d7e63ae`, `5637bd9`); i commit vivi con gli stessi subject sono `982510f`, `7ff9949`, `0a22c3e`.
- **Fix:** sostituire i 3 SHA. (Puro doc.)

## R6 (bassa) — piano fondativo senza tracking di stato

- **File:** `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md` (174 checkbox, tutte non spuntate) e `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md`.
- **Problema:** l'app è integralmente in produzione ma il plan fondativo ha ogni checkbox `- [ ]` non spuntata e il suo Task 48 (aggiungere `## Stato implementazione` alla design spec) non è stato eseguito. Un agente che riprendesse il plan potrebbe ripartire dal Task 1.
- **Fix (puro doc):** nota di stato in testa al plan ("completato integralmente, vedi storia di `main`") + sezione `## Stato implementazione` nella design spec.

---

## Raggruppamento suggerito per i branch/PR

- **Branch 1 — atomicità salvataggio (Unità A: R1+R2+R3):** brainstorming → spec → plan → implementazione (TDD dove possibile) → test. È il pezzo più delicato e a rischio più alto.
- **Branch 2 — igiene doc/schema (R4 + R5 + R6):** perlopiù documentazione + un test offline dello schema. Indipendente dall'Unità A, può procedere in parallelo.

## Riferimenti

- Resoconto completo della review: `docs/code-review-2026-07-02.md`
- Feature appena conclusa (contesto e pattern): PR #7; spec/plan `2026-07-02-cambio-peso-seduta*`.
- Architettura e convenzioni: `CLAUDE.md`.
