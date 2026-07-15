# Progressione v2 — wave adattiva e revisione lineare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la wave percentuale soggetta ad arrotondamenti nulli con un piano caricabile e adattivo di cinque pesi; usare il carico realmente consolidato per avanzare/ricalibrare/ripetere; introdurre la lineare v2 a incrementi di uno/due step e fallimento oltre il 25%; preservare integralmente lo storico.

**Architecture:** `Exercise.waveCycleLoads` diventa la fonte autorevole della prescrizione wave v2. Funzioni pure costruiscono il piano, generano il ciclo successivo, calcolano il carico consolidato e producono un `WaveV2Outcome`; `applyEntryResult` applica l'outcome e la RPC `commit_workout` salva entry + nuovo piano in un'unica transazione. Gli esercizi v1 vengono convertiti lazy preservando la prossima prescrizione legacy.

**Tech Stack:** SvelteKit 2 · Svelte 5 runes · TypeScript · Vitest · Supabase (Postgres, JSONB, array `numeric[]`, RLS, PostgREST RPC) · adapter-static.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-15-progressione-v2-design.md`

**Branch:** `feature/progression-v2` (già creato). Nessun merge/push/PR senza autorizzazione esplicita.

## Global Constraints

- Le regole lineari approvate nel Task 0 sono vincolanti: nessun incremento `+10%` e nessun criterio basato sulle sole ripetizioni.
- La tolleranza del 25% è una costante di dominio condivisa da wave e lineare: non aggiungere settings, controlli UI o chiavi JSON per modificarla.
- Nessuna riscrittura o cancellazione di `workouts` / `workout_entries` storici.
- Migration solo additive nella prima release; niente `DROP COLUMN` e niente pulizia distruttiva dei JSON settings legacy.
- `nextPrescription` e `applyEntryResult` restano in lock-step: dopo ogni task di dominio eseguire l'intera `src/lib/domain/progression.test.ts`.
- Tutte le funzioni matematiche e di outcome devono essere pure e testate prima del wiring UI/store.
- Svelte 5 runes obbligatorie; niente store legacy.
- Copy UI in italiano, conciso.
- Il peso mostrato/editato è totale; dominio e DB continuano a memorizzare `load` escluso il bilanciere.
- `plateRounding` è lo step minimo caricabile. Progressioni positive usano il prossimo step; riduzioni usano lo step inferiore.
- Tutte le serie devono essere marcate prima di lasciare l'esercizio, salvo esercizio saltato.
- `npm test`, `npm run check` e, nei task finali, `npm run build` devono essere verdi prima di ogni commit.
- Migrazione Supabase e rigenerazione tipi costituiscono un gate: il codice che scrive le nuove colonne non può arrivare in produzione prima dell'applicazione SQL.
- Commit futuri in italiano. Nessun commit è richiesto durante la sola stesura di questo documento.

## Stato esecuzione

> Implementazione locale completata il 2026-07-15. Restano il gate manuale di applicazione della migration Supabase e la verifica runtime sui dati reali.

- [x] Task 0 — Chiudere il gate funzionale lineare
- [x] Task 1 — Contratti dominio/settings v2
- [x] Task 2 — Matematica del piano wave v2
- [x] Task 3 — Valutazione seduta e autoregolazione wave
- [ ] Task 4 — Migration DB + applicazione manuale + regen tipi (SQL e tipi locali pronti; applicazione remota pendente)
- [x] Task 5 — Mapping store e bootstrap v1→v2
- [x] Task 6 — Integrazione `nextPrescription` / `applyEntryResult` / commit atomico
- [x] Task 7 — UI seduta: peso wave editabile
- [x] Task 8 — Riepilogo automatico wave
- [x] Task 9 — Impostazioni e preview esercizio
- [x] Task 10 — Revisione lineare v2
- [ ] Task 11 — Verifica E2E, compatibilità storico e documentazione (suite locale completa; runtime remoto pendente)

---

## File Structure prevista

**Creati:**

- `supabase/migrations/20260715000000_progression_v2.sql`

**Modificati:**

- `src/lib/database.types.ts` — rigenerato dopo la migration.
- `src/lib/domain/types.ts` — stato v2, settings, prescription/result union.
- `src/lib/domain/progression.ts` — piano, quantizzazione, outcome e integrazione.
- `src/lib/domain/progression.test.ts` — test puri + integrazione.
- `src/lib/stores/exercises.svelte.ts` — mapping colonne e bootstrap.
- `src/lib/stores/exercises.test.ts` — round-trip mapping/plan v2.
- `src/lib/stores/workouts.svelte.ts` — payload stato v2 alla RPC.
- `src/lib/stores/workouts.test.ts` — payload e rollback su errore.
- `src/lib/stores/workout-draft.svelte.ts` — applicazione peso alle serie successive.
- `src/lib/ui/ExerciseForm.svelte` — nomenclatura step e preview.
- `src/routes/workout/new/+page.svelte` — peso wave editabile.
- `src/routes/workout/summary/+page.svelte` — esito automatico.
- `src/routes/impostazioni/+page.svelte` — settings v2, rimozione hold/reset.
- `src/lib/schema-types.test.ts` — nessuna modifica attesa salvo adeguamento parser per array, se necessario.
- `CLAUDE.md` — flusso progressione v2 e colonne RPC.

---

## Task 0: Chiudere il gate funzionale lineare — COMPLETATO

**Files:**

- Modify: `docs/superpowers/specs/2026-07-15-progressione-v2-design.md` (§ Decisioni funzionali lineare)
- Modify: questo plan (Task 10)

**Decisione approvata:**

| Esito | Regola |
|---|---|
| Serie valida | status ok, reps target e carico prescritto raggiunti |
| 100% serie valide | `+2 × effectiveStep` |
| Almeno 75%, meno del 100% | `+1 × effectiveStep` |
| Oltre 25% non valide, primo fallimento | carico invariato |
| Oltre 25% non valide, secondo consecutivo | `−5%` sul totale, quantizzato verso il basso di almeno uno step; contatore azzerato |
| Qualsiasi seduta non fallita | contatore fallimenti azzerato |

Il precedente `+10%` era un refuso nella direzione e, dopo il confronto, è stato eliminato del tutto perché troppo aggressivo nel lungo periodo. La spec e il Task 10 contengono ora la semantica completa.

La soglia del 25% è fissa e non configurabile. Restano inoltre confermati: incremento lineare calcolato dalla prescrizione corrente, riduzione wave basata sul carico tentato predominante (parità → più basso) e deload programmato invariato.

---

## Task 1: Contratti dominio e settings v2

**Files:**

- Modify: `src/lib/domain/types.ts`
- Test: `src/lib/domain/progression.test.ts`

**Produces:**

```ts
Exercise.progressionVersion?: number;
Exercise.waveCycleLoads?: number[];

Settings.waveCycleIncrementPct: number; // default 2

Prescription.algorithmVersion?: number;
```

`ProgressionResult` conserva tutte le varianti legacy e aggiunge:

```ts
wave-v2-advance
wave-v2-rebase-advance
wave-v2-repeat-reduced
wave-v2-cycle-end
```

La variante `wave-v2-cycle-end` salva anche il tipo di aggiustamento W5, il carico prescritto e consolidato, i conteggi di serie e il piano completato prima di generare quello del ciclo successivo. In questo modo lo snapshot storico resta interpretabile senza ricostruzioni dallo stato corrente.

- [ ] **Step 1: Scrivere test dei default**

Testare:

```ts
expect(DEFAULT_SETTINGS.waveCycleIncrementPct).toBe(2);
```

Verificare inoltre che non venga introdotto `progressionFailurePct` in `Settings` o `DEFAULT_SETTINGS`.

- [ ] **Step 2: Scrivere fixture v1/v2**

Aggiornare `baseWave` affinché possa produrre:

- esercizio legacy senza `progressionVersion` / piano;
- esercizio v2 con piano di cinque valori.

- [ ] **Step 3: Eseguire test e verificare il fallimento**

Run:

```bash
npx vitest run src/lib/domain/progression.test.ts
```

Expected: FAIL per proprietà/varianti mancanti.

- [ ] **Step 4: Aggiungere i contratti TypeScript**

Vincoli documentati nei commenti:

- `waveCycleLoads` contiene carichi escluso bilanciere;
- lunghezza esatta 5 in v2;
- `progressionVersion` assente equivale a 1.

- [ ] **Step 5: Aggiungere le varianti risultato con snapshot completi**

Usare esattamente i campi definiti nella spec; non riutilizzare `wave-cycle-end` cambiandone il significato.

- [ ] **Step 6: Test + check**

```bash
npx vitest run src/lib/domain/progression.test.ts
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/progression.test.ts
git commit -m "feat(progression): contratti dominio per wave v2"
```

---

## Task 2: Matematica del piano wave v2

**Files:**

- Modify: `src/lib/domain/progression.ts`
- Test: `src/lib/domain/progression.test.ts`

**Produces (nomi indicativi, mantenere firme pure):**

```ts
export function ceilToStep(value: number, step: number): number;
export function floorToStep(value: number, step: number): number;

export function buildWavePlan(
  anchorLoad: number,
  anchorWeek: number,
  step: number
): number[];

export function nextWaveCyclePlan(
  currentPlan: number[],
  barWeight: number,
  step: number,
  incrementPct: number
): number[];
```

- [ ] **Step 1: Test quantizzazione**

Casi obbligatori:

- step 2, 2,5 e 5;
- valore già in griglia;
- valore appena sopra/sotto la griglia;
- floating point (`61.2`, `63.75`, `30.75`);
- step `<= 0` rifiutato o normalizzato in modo esplicito.

- [ ] **Step 2: Test piano ancorato**

```text
anchor 30, week 1, step 5 → [30,35,40,45,50]
anchor 45, week 4, step 5 → [30,35,40,45,50]
anchor 45, week 4, step 2.5 → [37.5,40,42.5,45,47.5]
```

Il secondo/terzo caso prova il bootstrap senza cambiare la prescrizione della settimana corrente.

- [ ] **Step 3: Test ciclo successivo al 2% sul totale**

Casi reali attesi (totali mostrati):

| Piano C1 | Bar | Step | Piano C2 |
|---|---:|---:|---|
| 60/62,5/65/67,5/70 | 20 | 2,5 | 62,5/65/67,5/70/72,5 |
| 14/16/18/20/22 | 0 | 2 | 16/18/20/22/24 |
| 50/55/60/65/70 | 20 | 5 | 55/60/65/70/75 |
| 60/65/70/75/80 | 20 | 5 | 65/70/75/80/85 |

Convertire correttamente tra totale e carico senza bilanciere nelle fixture.

- [ ] **Step 4: Verificare fallimento dei test**

Expected: funzioni inesistenti.

- [ ] **Step 5: Implementare helper puri**

Requisiti:

- nessuna lettura di store;
- nessuna mutazione dell'array di input;
- output finiti, non negativi e lungo 5;
- epsilon controllato nella quantizzazione decimale;
- monotonia minima di uno step nel piano generato per il nuovo ciclo.

- [ ] **Step 6: Property-style tests**

Per più combinazioni base/step/bar verificare:

```text
next.length === 5
next[i] >= 0
next[i] >= next[i-1] + step
next[i] > current[i] quando incrementPct > 0
```

- [ ] **Step 7: Suite + check**

```bash
npx vitest run src/lib/domain/progression.test.ts
npm run check
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(progression): piano caricabile e ciclo wave al 2%"
```

---

## Task 3: Valutazione seduta e autoregolazione wave

**Files:**

- Modify: `src/lib/domain/progression.ts`
- Test: `src/lib/domain/progression.test.ts`

**Produces:**

```ts
export type WaveV2Outcome =
  | { kind: 'advance'; consolidatedLoad: number; newPlan: number[] }
  | { kind: 'rebase-advance'; consolidatedLoad: number; newPlan: number[] }
  | { kind: 'repeat-reduced'; reducedLoad: number; newPlan: number[] };

export function resolveWaveV2Outcome(
  ex: Exercise,
  entry: Entry,
  settings: Settings
): WaveV2Outcome;
```

- [ ] **Step 1: Test soglia 25%**

Verificare `required = ceil(N × 0.75)`:

```text
N 3 → 3
N 4 → 3
N 5 → 4
N 6 → 5
N 8 → 6
```

- [ ] **Step 2: Test carico consolidato**

Per `5×5 @70`:

- `5×70` → 70;
- `4×70 + 1×65` → 70;
- `3×70 + 2×65` → 65;
- `5×65` → 65;
- serie `ok` con reps sotto target esclusa;
- serie `fail` esclusa anche con reps numericamente alte.

- [ ] **Step 3: Test outcome advance/rebase**

- consolidato uguale → piano invariato, advance;
- consolidato −step → corrente e future traslate −step;
- consolidato +step → corrente e future traslate +step;
- settimane precedenti identiche;
- nessun valore negativo.

- [ ] **Step 4: Test fallimento e carico ridotto**

Casi:

- tutte al prescritto ma `validSets < required` → `prescribed - step`;
- maggioranza a carico inferiore → usa il predominante se più basso;
- parità tra carichi → sceglie il più basso;
- peso inserito fuori griglia → `floorToStep`;
- fallimento W5 non chiude il ciclo.

- [ ] **Step 5: Eseguire e verificare fallimento**

Expected: helper/outcome inesistenti.

- [ ] **Step 6: Implementare funzioni pure**

Non leggere `waveCurrentWeek` dalla prescription quando presente un valore incoerente: validare che `entry.prescribed.week` e stato esercizio coincidano, oppure usare una singola fonte autorevole documentata.

- [ ] **Step 7: Suite completa**

```bash
npx vitest run src/lib/domain/progression.test.ts
npm run check
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(progression): autoregolazione wave su carico consolidato"
```

---

## Task 4: Migration DB, applicazione e rigenerazione tipi

**Files:**

- Create: `supabase/migrations/20260715000000_progression_v2.sql`
- Modify: `src/lib/database.types.ts` (generato, non editato a mano)
- Test: `src/lib/schema-types.test.ts`

- [ ] **Step 1: Scrivere la migration additiva**

Contenuto minimo:

```sql
alter table exercises
  add column progression_version integer not null default 1,
  add column wave_cycle_loads numeric[];

update user_settings
set data = jsonb_set(data, '{waveCycleIncrementPct}', '2'::jsonb, true),
    updated_at = now();
```

Aggiungere un `create or replace function commit_workout(...)` basato sulla migration corrente, estendendo l'`UPDATE exercises` con:

```sql
progression_version = u.progression_version,
wave_cycle_loads = u.wave_cycle_loads,
```

Non rimuovere gli update legacy nella prima release.

- [ ] **Step 2: Test schema offline prima dell'applicazione**

```bash
npx vitest run src/lib/schema-types.test.ts
```

Expected prima del regen: FAIL perché le nuove colonne non sono ancora nei tipi generati. Questo è il gate atteso, non aggirarlo con cast permanenti.

- [ ] **Step 3: Review manuale SQL**

Controllare:

- RLS invariata (`SECURITY INVOKER` / comportamento attuale);
- update limitato a `ex.user_id = auth.uid()`;
- nessun backfill dello storico;
- update settings preserva tutte le altre chiavi;
- migration riproducibile sullo schema corrente.

- [ ] **Step 4: Applicare nel SQL Editor Supabase**

Eseguire la migration completa. Verificare:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'exercises'
  and column_name in ('progression_version', 'wave_cycle_loads');
```

Expected: due righe (`integer`, `ARRAY`).

- [ ] **Step 5: Rigenerare i tipi**

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```

Expected: nuove colonne in Row/Insert/Update e firma RPC ancora presente.

- [ ] **Step 6: Guardia schema + check**

```bash
npx vitest run src/lib/schema-types.test.ts
npm run check
```

Expected: PASS. Se il parser offline non riconosce `numeric[]`, correggere il test senza indebolire le sanity assertion.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260715000000_progression_v2.sql \
        src/lib/database.types.ts src/lib/schema-types.test.ts
git commit -m "feat(db): stato additivo per progressione v2"
```

---

## Task 5: Mapping store e bootstrap v1→v2

**Files:**

- Modify: `src/lib/stores/exercises.svelte.ts`
- Test: `src/lib/stores/exercises.test.ts`
- Test: `src/lib/domain/progression.test.ts`

**Produces:**

```ts
export function ensureProgressionV2(ex: Exercise, settings: Settings): Exercise;
```

- [ ] **Step 1: Test mapping DB↔domain**

Verificare:

- `progression_version` ↔ `progressionVersion`;
- `wave_cycle_loads` ↔ `waveCycleLoads`;
- array copiato, non condiviso/mutato;
- colonne legacy ancora mappate.

- [ ] **Step 2: Test bootstrap legacy**

Per ogni combinazione reale di step/bar/stato:

- calcolare `legacyPrescription = nextPrescriptionV1(...)`;
- convertire;
- verificare che `v2.waveCycleLoads[currentWeek - 1] === legacyPrescription.load`;
- verificare `progressionVersion === 2` e lunghezza 5.

Casi minimi: T-bar W4 C1, manubri W1 C2, squat W1 C2, stacco W4 C1.

- [ ] **Step 3: Test idempotenza**

Chiamare due volte `ensureProgressionV2` su un esercizio v2 deve restituire lo stesso piano e non incrementare ciclo/settimana.

- [ ] **Step 4: Implementare mapping e bootstrap**

Il bootstrap non deve fare scritture remote durante `load()`. Produce stato in memoria; la persistenza avviene nel prossimo commit atomico o nel salvataggio esercizio.

- [ ] **Step 5: Assicurare il bootstrap prima della creazione del draft**

Lo store o il call-site deve garantire che `nextPrescription` non riceva un esercizio wave v1 non convertito quando è attivo il motore v2. Evitare conversioni duplicate in più componenti.

- [ ] **Step 6: Test + check**

```bash
npx vitest run src/lib/domain/progression.test.ts src/lib/stores/exercises.test.ts
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/exercises.svelte.ts src/lib/stores/exercises.test.ts \
        src/lib/domain/progression.ts src/lib/domain/progression.test.ts
git commit -m "feat(esercizi): bootstrap compatibile wave v1 verso v2"
```

---

## Task 6: Integrazione dominio e commit atomico

**Files:**

- Modify: `src/lib/domain/progression.ts`
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/stores/workouts.svelte.ts`
- Modify: `src/routes/workout/summary/+page.svelte`
- Test: `src/lib/domain/progression.test.ts`
- Test: `src/lib/stores/workouts.test.ts`

- [ ] **Step 1: Test `nextPrescription` v2**

Verificare:

- legge `waveCycleLoads[week - 1]`;
- conserva bar/week/cycle/versione;
- deload applica percentuali al valore del piano;
- esercizio saltato/no attempt resta noop.

- [ ] **Step 2: Test `applyEntryResult` v2**

Una riga per outcome:

- advance a settimana successiva;
- rebase + advance;
- repeat-reduced stessa settimana;
- W5 riuscita → `wave-v2-cycle-end` autosufficiente, piano +2%, ciclo +1;
- W5 riuscita con carico consolidato diverso → snapshot del piano completato dopo il rebase e prima dell'incremento del ciclo;
- W5 fallita → nessuna fine ciclo;
- deload completato → clear pending, piano/settimana invariati.

- [ ] **Step 3: Conservare il ramo legacy solo per bootstrap/test storico**

Le nuove sedute non devono produrre `wave-repeat-week`, `wave-advance-week` o adjustment hold/reset. Le varianti restano nel tipo per decodificare lo storico.

- [ ] **Step 4: Aggiornare payload RPC**

`domainToDb` deve includere sempre:

```text
progression_version
wave_cycle_loads
```

Testare che `workoutsStore.commit` invii l'array e che un errore RPC non aggiorni lo stato locale.

- [ ] **Step 5: Rimuovere dipendenza da `summaryChoices` nel calcolo wave**

Il parametro `userAction` può restare temporaneamente per compatibilità lineare/tipi legacy, ma il ramo wave v2 lo ignora e salva `null`.

- [ ] **Step 6: Suite lock-step**

```bash
npx vitest run src/lib/domain/progression.test.ts src/lib/stores/workouts.test.ts
npm test
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain src/lib/stores/workouts.svelte.ts \
        src/lib/stores/workouts.test.ts src/routes/workout/summary/+page.svelte
git commit -m "feat(progression): integra wave v2 nel commit atomico"
```

---

## Task 7: UI seduta — peso wave editabile

**Files:**

- Modify: `src/routes/workout/new/+page.svelte`

- [ ] **Step 1: Rendere il campo KG comune a wave e linear**

Rimuovere la condizione che oggi mostra KG solo per `scheme === 'linear'`. Mantenere:

- valore totale in input;
- sottrazione del bilanciere nel draft;
- `step={effectiveRounding(...)}`;
- campo disabilitato dopo la chiusura della serie.

- [ ] **Step 2: Confermare la serie senza classificarla manualmente**

Mostrare una sola azione “Conferma serie eseguita”. La conferma chiude la riga con lo stato tecnico `ok`, ma non dichiara il raggiungimento dell'obiettivo: il dominio continua a valutare reps e carico effettivi. Una serie da 7 reps su target 8 viene quindi confermata dall'utente e classificata automaticamente come non valida.

- [ ] **Step 3: Nessuna modifica in blocco dei carichi**

Non mostrare “Applica alle serie successive”: ogni carico viene registrato esplicitamente sulla singola serie.

- [ ] **Step 4: Gate logging invariato**

`Succ` / `Concludi` restano disabilitati fino a tutte le serie marcate o esercizio saltato.

- [ ] **Step 5: Check + runtime**

```bash
npm run check
npm run dev
```

Provare wave con e senza bilanciere e step 2 / 2,5 / 5.

- [ ] **Step 6: Commit**

```bash
git add src/routes/workout/new/+page.svelte src/lib/stores/workout-draft.svelte.ts
git commit -m "feat(seduta): conferma serie e valuta automaticamente l'esito"
```

---

## Task 8: Riepilogo automatico wave

**Files:**

- Modify: `src/routes/workout/summary/+page.svelte`
- Modify: `src/lib/stores/workout-draft.svelte.ts`

- [ ] **Step 1: Rimuovere radio ripeti/avanza**

Eliminare la scelta manuale per wave e i relativi call-site `setSummaryChoice` quando non più usati da altri flussi.

- [ ] **Step 2: Calcolare preview outcome senza mutare store**

Usare la funzione pura di Task 3 per mostrare:

- prescritto;
- consolidato;
- conteggio valide/richieste;
- settimana e carico successivi;
- oppure ripetizione con carico ridotto.

- [ ] **Step 3: Garantire singolo calcolo autorevole al commit**

La preview e il commit devono usare la stessa funzione/entry. Evitare di duplicare regole in Svelte.

- [ ] **Step 4: Copy UI**

Esempi:

```text
Prescritto 70 kg · consolidato 65 kg
Prossima: 6×4 @ 70 kg
```

```text
Settimana non consolidata (3/4 serie)
Ripeti 5×5 @ 65 kg
```

- [ ] **Step 5: Check + runtime**

Provare tutte e tre le classi: advance, rebase-advance, repeat-reduced.

- [ ] **Step 6: Commit**

```bash
git add src/routes/workout/summary/+page.svelte src/lib/stores/workout-draft.svelte.ts
git commit -m "feat(riepilogo): esito automatico della wave adattiva"
```

---

## Task 9: Impostazioni e preview esercizio

**Files:**

- Modify: `src/routes/impostazioni/+page.svelte`
- Modify: `src/lib/ui/ExerciseForm.svelte`
- Test: `src/lib/ui/ExerciseForm.test.ts`
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/domain/progression.ts`

- [ ] **Step 1: Rimuovere controlli legacy dalla card Wave**

Rimuovere markup e `HELP` per:

- `cycleHoldThreshold`;
- `cycleResetThreshold`;
- `cycleResetPct`.

Le chiavi JSON remote restano inerti.

- [ ] **Step 2: Aggiornare incremento ciclo**

Label/help devono esplicitare:

- default 2%;
- applicazione al totale;
- quantizzazione al prossimo peso caricabile.

- [ ] **Step 3: Mantenere controlli deload**

Non modificarne semantica o default in questo task.

- [ ] **Step 4: Chiarire step nel form esercizio**

Sostituire “Arrotondamento dischi” con una copy equivalente a:

```text
Step minimo caricabile (vuoto = default schema)
```

Mostrare il valore effettivo risolto anche quando deriva dal globale.

- [ ] **Step 5: Preview piano**

Per wave mostrare piano corrente e ciclo successivo, totali comprensivi di bilanciere. La preview usa gli helper di dominio, non formule duplicate nel componente.

- [ ] **Step 6: Bloccare la configurazione iniziale dopo la creazione**

Schema, carico iniziale/base e step minimo sono editabili soltanto per un nuovo esercizio. Per un esercizio esistente restano visibili ma non modificabili; nome, recupero e peso del bilanciere restano editabili. Coprire sia wave sia lineare con un test di rendering del form.

- [ ] **Step 7: Soglia 25% non configurabile**

Verificare che l'interfaccia non esponga controlli per la soglia e che nessuna nuova chiave `progressionFailurePct` venga salvata nei settings. La costante del 25% appartiene al dominio ed è condivisa da wave e lineare.

- [ ] **Step 8: Check + test**

```bash
npx vitest run src/lib/domain/progression.test.ts
npm run check
```

- [ ] **Step 9: Commit**

```bash
git add src/routes/impostazioni/+page.svelte src/lib/ui/ExerciseForm.svelte \
        src/lib/domain/types.ts src/lib/domain/progression.ts
git commit -m "feat(impostazioni): semplifica wave e mostra preview caricabile"
```

---

## Task 10: Revisione lineare v2

**Files previsti:**

- Modify: `src/lib/domain/progression.ts`
- Modify: `src/lib/domain/types.ts`
- Modify: `src/routes/impostazioni/+page.svelte`
- Test: `src/lib/domain/progression.test.ts`

- [ ] **Step 1: Scrivere test parametrizzati per la validità della serie**

Una serie è valida solo con `status === 'ok'`, reps almeno pari al target e carico effettivo almeno pari al prescritto. Coprire separatamente reps insufficienti, carico inferiore, status failed e carico superiore.

- [ ] **Step 2: Scrivere test per soglia ed esiti**

Coprire `required = ceil(N × 0.75)` per 3/4/5/6/8 serie e verificare:

- 100% valide → `+2 × effectiveStep`;
- almeno `required` ma meno del 100% → `+1 × effectiveStep`;
- meno di `required`, primo fallimento → hold e contatore 1;
- meno di `required`, secondo consecutivo → `−5%` quantizzato e contatore 0;
- successo completo o tollerato dopo un fallimento → contatore 0.

- [ ] **Step 3: Scrivere test di quantizzazione del −5%**

Applicare la percentuale al totale comprensivo di bilanciere, poi convertire al carico senza bilanciere con `floorToStep`. Verificare step 2 / 2,5 / 5, carichi fuori griglia, limite zero e riduzione minima effettiva di uno step.

- [ ] **Step 4: Verificare che i nuovi test falliscano sul motore corrente**

Expected: il motore v1 considera fallimento qualsiasi serie mancante, usa il vecchio reset percentuale e non distingue `+1/+2 step`.

- [ ] **Step 5: Implementare `resolveLinearV2Outcome` come funzione pura**

La funzione restituisce almeno tipo di esito, serie richieste/valide, carico precedente, nuovo carico e nuovo contatore. Non muta esercizio o array di serie.

- [ ] **Step 6: Integrare l'outcome in `applyEntryResult`**

Usare il nuovo ramo soltanto per `progressionVersion === 2`; conservare la decodifica dei `ProgressionResult` legacy. Il prossimo carico positivo deriva dalla prescrizione corrente, non dal massimo peso provato in una singola serie.

- [ ] **Step 7: Cutover lineare v1→v2**

Preservare `linearCurrentLoad`, target e storico; impostare `progressionVersion = 2` e azzerare `linearConsecutiveFailures` perché il contatore v1 usa una classificazione incompatibile.

- [ ] **Step 8: Aggiornare tipi, snapshot e impostazioni**

Aggiungere varianti `ProgressionResult` lineari v2 con `algorithmVersion: 2`, dati di soglia e incremento applicato. Rendere legacy/inerti `linearIncrementSteps`, `linearResetPct`, `linearLoadShiftPct` e `linearFailThreshold` dopo averne verificato tutti i consumer; mantenere configurabile soltanto lo step fisico tramite `plateRoundingLinear` e l'override esercizio `plateRounding`.

- [ ] **Step 9: Suite lineare completa + check**

```bash
npx vitest run src/lib/domain/progression.test.ts
npm run check
```

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(progression): regole lineari v2"
```

---

## Task 11: Verifica E2E, compatibilità storico e documentazione

**Files:**

- Modify: `CLAUDE.md`
- Modify: questo plan (stato esecuzione)
- Eventuale modify: pagine storico solo se i nuovi snapshot vengono mostrati

- [ ] **Step 1: Suite completa**

```bash
npm test
npm run check
npm run build
```

Expected: tutto verde; nessuna warning Svelte introdotta.

- [ ] **Step 2: Verifica storico legacy**

Aprire sedute con:

- `wave-advance-week`;
- `wave-cycle-end` normal;
- entry lineari legacy;
- `result_info = null`.

Expected: caricamento e rendering invariati, nessun cast/runtime error.

- [ ] **Step 3: Verifica bootstrap sui quattro esercizi reali**

Prima del primo commit v2 annotare la prescrizione legacy prevista; dopo bootstrap deve essere identica per la settimana corrente.

- [ ] **Step 4: Verifica autoregolazione runtime**

Per almeno un esercizio per step 2 / 2,5 / 5:

1. tutte le serie al prescritto → advance;
2. almeno 75% valide a carico più basso → rebase + advance;
3. meno del 75% valide → repeat-reduced;
4. retry dopo errore simulato → nessun doppio avanzamento.

- [ ] **Step 5: Verifica fine ciclo e +2%**

Usare fixture/test o dati controllati; confermare che nessuna settimana del nuovo ciclo resta identica alla corrispondente precedente per effetto dell'arrotondamento.

- [ ] **Step 6: Verifica deload**

Con `pendingDeload = true`:

- prescrizione derivata dal piano v2;
- completamento clear pending;
- piano/settimana invariati.

- [ ] **Step 7: Aggiornare `CLAUDE.md`**

Documentare:

- `waveCycleLoads` fonte autorevole v2;
- bootstrap lazy;
- carico consolidato al 75%;
- colonne da includere nella RPC (“tassa colonne”);
- settings legacy inerti;
- lock-step e test obbligatori.

- [ ] **Step 8: Aggiornare stato plan**

Spuntare task realmente completati, annotare commit, esito suite e gate manuali. Non dichiarare completato il lineare se Task 0/10 non sono chiusi.

- [ ] **Step 9: Commit finale**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-07-15-progressione-v2.md
git commit -m "docs(progression): completa handoff e verifiche v2"
```

---

## Ordine operativo e gate

```text
Task 1 → Task 2 → Task 3
  ↓
Task 4 migration SQL
  ↓
[GATE: applicazione Supabase + regen types]
  ↓
Task 5 → Task 6 → Task 7 → Task 8 → Task 9
  ↓
Task 10
  ↓
Task 11
```

Non unire in `main` una versione che include mapping/scrittura delle nuove colonne prima della chiusura del gate DB.

## Rischi di esecuzione

- **Migration applicata ma deploy non completato:** colonne additive e default v1 mantengono compatibilità col client vecchio.
- **Client nuovo prima della migration:** scritture esercizio/RPC falliscono; prevenuto dall'ordine vincolante.
- **Settings esistenti ancora a 2,5%:** la migration JSON forza 2%; verificare campione prima/dopo.
- **Bootstrap non persistito subito:** deve essere deterministico e idempotente; la prescrizione resta uguale fino al primo commit.
- **Piano v2 mutato in-place:** vietato nei helper puri; copiare array per evitare reattività Svelte invisibile o storico locale corrotto.
- **Ramo legacy rimosso troppo presto:** conservarlo per bootstrap e decodifica test finché tutti gli esercizi risultano v2.
- **Regressione lineare v1:** mantenere test legacy mirati e attivare le nuove regole solo dopo il cutover esplicito a `progressionVersion = 2`.
