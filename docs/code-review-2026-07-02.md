# Ghisa — Resoconto review multi-agente

**Data:** 2026-07-02 · **Branch:** `main` (HEAD `b4bcb89`) · **Metodo:** 4 subagenti indipendenti + verifica e scoring dell'orchestratore

## Metodo

Quattro subagenti hanno analizzato il repo in parallelo, ciascuno con una lente diversa e senza vedere i risultati degli altri:

| Agente | Lente |
|---|---|
| #1 | Conformità del codice alle regole di `CLAUDE.md` |
| #2 | Coerenza tra `docs/superpowers/` (plan + spec) e codice attuale |
| #3 | Bug reali nel sorgente (`src/`) con scenario di fallimento concreto |
| #4 | Git history/blame: desincronizzazioni, revert, gate mai chiusi |

Ogni finding è stato poi **ri-verificato dall'orchestratore direttamente nel sorgente o in git** (lettura delle righe citate, comandi `git`, grep) e ha ricevuto una **confidenza 0–100**. Soglia di inclusione: **≥ 80**. I duplicati tra agenti sono stati fusi (A1-02 ≡ A3-02, trovato indipendentemente da due lenti diverse — il che ne rafforza la confidenza).

**Rubrica di scoring**
- **90–100**: evidenza ri-verificata riga per riga dall'orchestratore, scenario di fallimento concreto e riproducibile.
- **80–89**: evidenza esatta ri-verificata; resta un margine di interpretazione (portata della regola, intento di design) o una variabile esterna non ispezionabile.
- **< 80**: fatti verificati ma qualificazione come difetto non dimostrabile, oppure evidenza non replicata → **escluso** (elencato in appendice).

## Sintesi

**7 finding confermati** (1 alta, 3 medie, 3 basse severità) · **1 scartato** (< 80).

Il tema dominante è uno solo: **il salvataggio della seduta non è atomico, su tre livelli indipendenti** (R1: ordine progressione→commit; R2: doppio submit; R3: doppio insert non transazionale). I tre difetti si compongono tra loro: il caso peggiore è progressione avanzata più volte senza alcuna seduta in storico.

Per il resto il progetto è in buona salute: la matematica di progressione è conforme alle spec e ben testata, i rollback dei store sono corretti, la navigazione rispetta `trailingSlash: 'always'`, il workflow di deploy è sano e il known-issue sull'incremento lineare è **realmente** risolto nel codice (opzione C verificata).

---

## Finding confermati (confidenza ≥ 80)

### R1 · Salvataggio seduta non atomico: la progressione viene persistita prima del commit; un retry dopo errore la ri-avanza — **95/100 · severità ALTA**

**Fonte:** Agent #3 (A3-01, conf. agente 90) · verificato riga per riga dall'orchestratore
**File:** `src/routes/workout/summary/+page.svelte:24-62` · `src/lib/stores/exercises.svelte.ts:90-103`

Nel loop di `commit()` ogni esercizio viene avanzato e **scritto su Supabase** (`await exercisesStore.update(...)`, riga 35) **prima** che la seduta venga inserita (`workoutsStore.commit`, riga 56). Il `try` copre solo il commit finale: in caso di errore mostra un `alert` e non compensa nulla; `workoutDraftStore.cancel()` gira solo sul percorso di successo.

```js
if (!de.skipped && anyLogged && ex) {
  const r = applyEntryResult(ex, entry, userAction, settingsStore.data);
  await exercisesStore.update(r.updatedExercise);   // persiste, dentro il loop, PRIMA del commit
}
...
try {
  await workoutsStore.commit(...);
  workoutDraftStore.cancel();
  nav('/storico/');
} catch (err) { alert('Errore salvataggio: ' + ...); }
```

Aggravante verificata: `exercisesStore.update()` fa rollback in memoria e poi **rilancia** l'errore (`throw error`, exercises.svelte.ts:101), e la riga 35 sta **fuori** dal `try` → se fallisce l'update del 2° esercizio su N, il 1° resta avanzato su DB, il loop si interrompe con una **rejection silenziosa** (nessun alert), nessuna seduta salvata, draft intatto.

**Scenario:** esercizio wave in settimana 2. Conferma → update persiste 2→3 → il commit fallisce per rete → alert, draft ancora presente. L'utente ritocca "Conferma e salva": `getById` restituisce l'esercizio già in settimana 3 → `applyEntryResult` avanza 3→4. **Ogni retry avanza di un'altra settimana** (nel lineare: altri `steps × step` kg), con storico vuoto.

**Raccomandazione:** invertire l'ordine (prima il commit della seduta, poi l'avanzamento) oppure introdurre un guard di idempotenza + compensazione; portare il loop dentro il `try`. Richiede anche l'aggiornamento della sezione "Workout flow" di `CLAUDE.md`, che oggi prescrive la sequenza apply → update → commit definendola atomica.

---

### R2 · "Conferma e salva" senza guard anti doppio-submit: sedute duplicate e progressione doppia — **90/100 · severità MEDIA**

**Fonte:** Agent #3 (A3-03, conf. agente 80) · verificato
**File:** `src/routes/workout/summary/+page.svelte:126` (+ `commit()` a :21-62)

```svelte
<button class="btn primary" onclick={commit} style="margin-top: 24px;">Conferma e salva</button>
```

`commit()` è async, non esiste alcuna flag "salvataggio in corso" né `disabled`, e il draft viene azzerato solo a commit riuscito. Su mobile (target dell'app) un doppio tap invoca `commit()` due volte in concorrenza: l'assegnazione ottimistica in `update()` è **sincrona** (`state.items[idx] = ex` prima del primo `await`), quindi la seconda invocazione legge l'esercizio **già avanzato** e lo avanza di nuovo; in ogni caso vengono inserite **due** righe `workouts` con entry duplicate.

**Raccomandazione:** flag `saving` in `$state` + `disabled` sul bottone (pattern minimo); idempotenza lato dati come rete di sicurezza.

---

### R3 · `workoutsStore.commit` non è atomico: due insert separati, con riga `workouts` orfana in caso di fallimento parziale (e `CLAUDE.md` dichiara "a single Supabase call") — **88/100 · severità MEDIA**

**Fonte:** Agent #1 (A1-02, conf. 52) **+** Agent #3 (A3-02, conf. 70), trovato indipendentemente e fuso · verificato
**File:** `src/lib/stores/workouts.svelte.ts:80-111` · `CLAUDE.md` sezione "Workout flow"

La seduta viene scritta con **due chiamate Supabase distinte e non transazionali**: prima l'insert su `workouts` (:80-91), poi l'insert delle entry su `workout_entries` (:107-111). Se il secondo fallisce (`if (e2) throw e2`), la riga `workouts` resta **orfana** nel DB senza alcuna compensazione (in `/storico/` apparirebbe come seduta senza esercizi). La documentazione in `CLAUDE.md` («inserts one `workouts` row + N `workout_entries` rows in a single Supabase call») è quindi fattualmente errata rispetto all'implementazione.

**Raccomandazione:** spostare l'inserimento in una funzione Postgres/RPC transazionale (una vera "single call"), o in subordine compensare (delete della riga `workouts` se `e2`); in ogni caso correggere la frase in `CLAUDE.md`.

---

### R4 · Migration skip: gate "SQL da applicare + verifica runtime" mai chiuso nel plan, e `database.types.ts` mantenuto a mano anziché rigenerato — **84/100 · severità MEDIA**

**Fonte:** Agent #4 (A4-02, conf. agente 62) · verificato su repo dall'orchestratore
**File:** `docs/superpowers/plans/2026-06-03-salto-e-arrotondamento-ibrido.md:23-26` · commit `7ea0c48` · `src/lib/database.types.ts`

Il plan a HEAD marca la Milestone A «✅ CHIUSA **(codice)**» ma subito sotto mantiene aperto il gate operativo:

> ⚠️ **SQL DA APPLICARE A MANO:** la migration `20260603000001_add_skip_columns.sql` **non** è ancora stata eseguita su Supabase. `database.types.ts` è stato allineato a mano (come per B0) […] il salto fallirà a runtime finché l'utente non esegue la SQL […] Verifica manuale a runtime (browser) ancora da fare dall'utente.

Nessun commit successivo chiude questo gate (a differenza delle migration `plate_rounding` e `linear_increment_steps`, esplicitamente registrate come "applicata su Supabase / verificato a runtime"). In parallelo, i tipi generati — che `CLAUDE.md` impone di **rigenerare** dopo ogni migration — risultano allineati a mano: il commit `7ea0c48` lo dichiara («B0 hand-edits database.types instead of manual regen») e il PR #6 tocca `database.types.ts` con 6 sole insertion chirurgiche, non con un regen.

**Valutazione:** l'uso reale dell'app dopo il 03/06 (il commit del 05/06 dichiara verifiche a runtime; ogni salvataggio seduta scrive già la colonna `skipped`) rende molto probabile che la SQL **sia stata** applicata e che il gate sia solo documentazione stantia — ma **dal repo non è dimostrabile**, ed è esattamente questo il problema: la corrispondenza migration ↔ DB live ↔ tipi non è verificabile.

**Raccomandazione:** eseguire `npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts` — se il diff è vuoto l'allineamento è provato — e chiudere il gate nel plan con la data di verifica.

---

### R5 · Il doc di chiusura del known-issue cita SHA orfani (pre-rebase), irraggiungibili da HEAD — **88/100 · severità BASSA**

**Fonte:** Agent #4 (A4-01, conf. agente 90) · verificato (grep + `git merge-base --is-ancestor`)
**File:** `docs/superpowers/plans/2026-06-03-linear-increment-steps.md:6-8`

I tre commit citati come chiusura dei task (`7311dcf`, `d7e63ae`, `5637bd9`) non sono raggiungibili da HEAD: sono resti di un rebase del 05/06; i commit vivi con gli stessi subject sono `982510f`, `7ff9949`, `0a22c3e`. Su un clone fresco o su GitHub i riferimenti sono già rotti (gli oggetti orfani sopravvivono solo nel repo locale fino al prossimo `git gc`).

**Raccomandazione:** sostituire nel doc i tre SHA con `982510f` / `7ff9949` / `0a22c3e`.

---

### R6 · Il piano fondativo non traccia alcuno stato (0/174 checkbox) e il suo stesso task di chiusura non è mai stato eseguito — **85/100 · severità BASSA**

**Fonte:** Agent #2 (A2-01, conf. agente 60) · verificato (conteggi grep + lettura spec)
**File:** `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md` · `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md`

L'app è integralmente costruita e in produzione, ma il plan fondativo ha **174 checkbox, tutte non spuntate**, e il Task 48 — che prescriveva di aggiungere la sezione `## Stato implementazione` alla design spec — non è mai stato eseguito (la spec termina con "Domande aperte / Nessuna al momento"). È l'unico artefatto della cartella in cui lo stato registrato (nulla di fatto) contraddice la realtà (tutto fatto); gli altri tre plan registrano correttamente stato e commit-range. Viola la convenzione di progetto "chiudendo una milestone, scrivere lo stato nel plan per l'handoff ad altri agenti": un agente a cui venisse ripassato questo plan potrebbe ripartire dal Task 1.

**Raccomandazione:** una nota di stato in testa al plan ("completato integralmente, vedi storia di `main`") + la sezione `## Stato implementazione` nella spec.

---

### R7 · Soglia del deload lineare hardcoded (`fails >= 2`) invece che in Settings — **82/100 · severità BASSA**

**Fonte:** Agent #1 (A1-01, conf. agente 58) · verificato
**File:** `src/lib/domain/progression.ts:106-107` · `src/lib/domain/types.ts:3-19`

```ts
const fails = (ex.linearConsecutiveFailures ?? 0) + 1;
if (fails >= 2) {
```

Il numero di fallimenti consecutivi che innesca il deload lineare è la costante `2` nel codice; `Settings` non ha alcun campo corrispondente, mentre tutte le soglie analoghe dell'onda (`cycleHoldThreshold`, `cycleResetThreshold`, `deloadEveryNCycles`) e l'entità del deload lineare (`linearResetPct`) sono configurabili. Viola alla lettera la regola di `CLAUDE.md`: «deload settings, threshold cutoffs all live in `Settings` […] Do not hardcode them». Il margine residuo di dubbio (−18) sta solo nel poterla considerare costante intrinseca del modello anziché soglia tunable.

**Raccomandazione:** nuovo campo in `Settings` (es. `linearFailThreshold`, default 2) letto al use-site.

---

## Finding scartati (confidenza < 80)

| ID | Titolo | Fonte | Conf. | Motivo esclusione |
|---|---|---|---|---|
| A3-04 | Il lineare conta i set **non loggati** come fallimento (asimmetria col wave: `every(ok)` vs `some(fail)`) → possibile deload indesiderato con log parziale | #3 | **65** | Meccanica verificata e reale (`progression.ts:93-95` vs `:65-70`), scenario raggiungibile dalla UI. Ma nessuna spec definisce il comportamento atteso e "nel lineare avanzi solo se completi tutto" è una scelta di design difendibile: non certificabile come difetto. **Da chiarire come decisione di prodotto**, non come bug. |

## Verifiche passate (aggregato dei 4 agenti)

- **Progressione:** tutte le transizioni wave (advance, repeat-week, hold, reset, trigger/completamento deload) conformi a spec e test; `WAVE_PATTERN[week-1]` mai out-of-bounds; il known-issue sull'incremento lineare è **realmente risolto** con l'opzione C (`roundTo(load + steps × step, step)`), non clobberato dai commit successivi; lock-step `nextPrescription`/`applyEntryResult` rispettato in tutta la storia (ogni commit su `progression.ts` tocca anche i test).
- **Store:** snapshot di rollback catturati prima della mutazione ottimistica in tutti i mutator; user id sempre via `supabase.auth.getUser()` a ogni scrittura; nessuna service-role key (unico client con anon key); `settingsStore.load` fa merge con `DEFAULT_SETTINGS` (niente `undefined` → NaN).
- **Navigazione/shell:** tutti i `nav()` con trailing slash (conforme a `trailingSlash: 'always'`); `+layout.ts` con `ssr=false`, `prerender=false`; auth-gate `$effect` converge senza loop; tabbar esattamente 4 sezioni con le route corrette; rest timer mai invocato prima della registrazione.
- **Tipi/migrazioni:** tutte e 6 le colonne aggiunte dalle migration presenti in `database.types.ts` con tipo/nullabilità coerenti; ogni migration accompagnata dall'aggiornamento tipi nello stesso commit o subito dopo.
- **Storia/CI:** `deploy.yml` sano (check + test + build con `BASE_PATH` intatti); nessun revert/flip-flop su `progression.ts`; nessun TODO/FIXME nel codice; il `.gitignore` modificato non committato aggiunge solo `.tokensave` (stato locale del code-graph, innocuo).
- **Copy:** UI coerentemente in italiano, tono conforme.

## Nota trasversale

R1 + R2 + R3 sono tre facce dello stesso rischio (atomicità del flusso di salvataggio) e convengono a un **unico intervento progettato insieme**: guard di submit, commit transazionale via RPC, avanzamento progressione dopo il commit. Intervenire su uno solo dei tre lascia aperti gli altri due percorsi verso il medesimo desync progressione↔storico.
