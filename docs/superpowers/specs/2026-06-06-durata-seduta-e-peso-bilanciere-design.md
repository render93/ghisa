# Design — Durata seduta + Peso bilanciere

Data: 2026-06-06

Due feature **indipendenti**, da implementare come due milestone separate. Nessuna
dipendenza reciproca: la prima tocca lo schema `workouts`, la seconda `exercises` + il
layer di visualizzazione dei carichi.

---

## Milestone 1 — Durata totale della seduta

### Obiettivo
Salvare e mostrare la durata totale di ogni seduta, calcolata in automatico (wall-clock)
dall'avvio della seduta alla conferma di salvataggio. Nessun timer a schermo durante
l'allenamento.

### Modello dati
- Nuova colonna `workouts.duration_sec` — `integer`, **nullable**.
- Le sedute saltate (`commitSkip`) restano `null` (nessun allenamento → nessuna durata).
- Migration SQL in `supabase/migrations/` (hand-run nell'SQL Editor di Supabase) +
  regen di `src/lib/database.types.ts`.

### Calcolo
- L'istante di inizio è già catturato: `draft.date`, impostato in
  `workoutDraftStore.start()` (`new Date().toISOString()`).
- In `src/routes/workout/summary/+page.svelte → commit()`:
  ```ts
  const durationSec = Math.max(
    0,
    Math.round((Date.now() - new Date(draft.date).getTime()) / 1000)
  );
  ```
- Passato come nuovo parametro a `workoutsStore.commit(...)` e scritto su `duration_sec`.

### Modifiche store (`src/lib/stores/workouts.svelte.ts`)
- Tipo `Workout`: aggiungere `durationSec: number | null`.
- `commit(...)`: nuovo parametro `durationSec: number`, incluso nell'insert della riga
  `workouts` e mappato nel `Workout` di ritorno.
- `commitSkip(...)`: `duration_sec` non impostato → resta `null`. Il `Workout` di ritorno
  ha `durationSec: null`.
- `load()`: mappare `w.duration_sec` → `durationSec` (può essere `null`).

### Visualizzazione
- Nuovo helper in `src/lib/ui/utils.ts`:
  ```ts
  export function fmtDuration(sec: number): string {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  ```
- **Dettaglio storico** (`src/routes/storico/[id]/+page.svelte`): nel sottotitolo, dopo
  `{N} esercizi`, aggiungere ` · {fmtDuration(durationSec)}` quando `durationSec != null`.
- **Lista storico** (`src/routes/storico/+page.svelte`): nella riga della card (ramo non
  saltato), aggiungere ` · {fmtDuration(durationSec)}` quando presente.

### Edge case noto (accettato)
- Se l'app resta aperta durante una pausa lunga (es. pranzo) la durata si gonfia. Scelta
  confermata: auto wall-clock, nessuna modifica manuale.
- Il draft è in-memory: ricaricando l'app la seduta si perde, quindi la durata è sempre
  confinata a una singola sessione dell'app.

---

## Milestone 2 — Peso bilanciere (esente da arrotondamento dischi)

### Obiettivo
Per determinati esercizi, registrare il peso del bilanciere come costante che concorre al
**peso totale** ma **non** è soggetta all'arrotondamento dischi. Il carico mostrato come
numero primario diventa il totale (dischi + bilanciere); i dischi restano come info
secondaria.

### Principio di fondo
Il motore di progressione e tutti i carichi persistiti restano in **spazio dischi**. Il
bilanciere è una costante per-esercizio che si somma solo per la visualizzazione del
totale. L'arrotondamento (`roundTo` / `effectiveRounding`) continua quindi ad applicarsi
ai soli dischi, **senza alcuna modifica alla matematica** di `progression.ts`.

### Modello dati
- `Exercise.barWeight?: number` (kg). Colonna `exercises.bar_weight` — `numeric`,
  **nullable** (`null` → nessun bilanciere → trattato come `0`). Stesso pattern di
  `plate_rounding`.
- Migration SQL + regen `database.types.ts` + mapping in
  `src/lib/stores/exercises.svelte.ts` (`DbExercise`, `dbToDomain`, `domainToDb`).
- **Nessuna modifica** allo schema `workouts` / `workout_entries`.

### Snapshot storico (scelta B — storico immutabile)
- Aggiungere `barWeight?: number` al tipo `Prescription` (`src/lib/domain/types.ts`).
- `nextPrescription(ex, settings)` riempie il campo come **pass-through** in entrambi i
  rami (wave e linear): `barWeight: ex.barWeight ?? 0`. Nessun calcolo cambia.
- Il campo `prescribed` di `workout_entries` è già una colonna JSON: lo snapshot del
  bilanciere viaggia dentro `prescribed`, **senza migration** su `workout_entries`.
- Lettura del totale **uniforme** sia in seduta live che nello storico via
  `prescribed.barWeight` → la modifica futura del `barWeight` dell'esercizio **non**
  altera i totali storici.
- Retrocompatibilità: le righe storiche pre-feature non hanno `barWeight` in `prescribed`
  → `undefined` → trattato come `0` → totale = dischi (corretto: erano senza bilanciere).

### Motore di progressione
- `nextPrescription`: unica aggiunta = il campo pass-through `barWeight` (nessuna
  modifica a `sets`/`reps`/`load`/`week`/`cycle`/`isDeload`/`consecutiveFails`).
- `applyEntryResult`, `roundTo`, `effectiveRounding`, `effectiveIncrementSteps`:
  **invariati**.

### Form esercizio (`src/lib/ui/ExerciseForm.svelte`)
- Nuovo campo "Peso bilanciere (vuoto = nessuno)", **generale** (vale sia per wave che
  per linear), posizionato accanto a "Arrotondamento dischi".
- `let barWeight = $state<number | undefined>(exercise.barWeight)`.
- In `submit`: includere nel `base` `barWeight: barWeight && barWeight > 0 ? barWeight : undefined`.

### Visualizzazione (totale primario ovunque)
Helper di display (in `utils.ts` o inline): `totalLoad = plateLoad + (barWeight ?? 0)`.
La parte secondaria "{dischi} dischi + {bar} bar" si mostra **solo se `barWeight > 0`**.

- **Target seduta** (`src/routes/workout/new/+page.svelte`): numero primario = totale
  (`@ {fmtKg(presc.load + bar)} {unit}`); secondario `{fmtKg(presc.load)} dischi + {fmtKg(bar)} bar`.
  Sorgente del `bar`: `currentEntry.prescribed.barWeight ?? 0`.
- **Input log set** (`workout/new`): il campo KG mostra/edita il **totale**:
  - `value = set.load + bar` (display);
  - `onInput`: `updateLoad(i, Math.max(0, enteredTotal - bar))` → a livello dati si
    salvano sempre i **dischi**;
  - `step` resta quello dischi (`effectiveRounding(currentExercise, settings)`).
  - Quando `bar = 0` il comportamento è identico a oggi.
- **Riepilogo** (`src/routes/workout/summary/+page.svelte`): totale primario, dischi
  secondari. Sorgente del `bar`: `de.prescribed.barWeight ?? 0`.
- **Dettaglio storico** (`src/routes/storico/[id]/+page.svelte`): totale primario nel
  `card-sub`; le righe per-set mostrano `{reps} × {fmtKg(s.load + bar)}`. Sorgente del
  `bar`: `entry.prescribed.barWeight ?? 0`.

### Note
- `actualSets[].load` non è letto dal motore di progressione (la progressione usa lo stato
  dell'esercizio, non il carico loggato): è dato puramente informativo, quindi mantenerlo
  in dischi è sicuro e non impatta l'avanzamento.

---

## Testing
- **Milestone 1**: test del solo helper `fmtDuration` (< 60 min, ≥ 60 min, 0). Il calcolo
  della durata è una sottrazione di timestamp in `commit()` — verificata manualmente a
  runtime.
- **Milestone 2** (`src/lib/domain/progression.test.ts`):
  - Aggiornare le aspettative esistenti su `nextPrescription` per includere il nuovo campo
    `barWeight` (default `0`) dove le asserzioni usano `toEqual` sull'intero oggetto
    prescrizione.
  - Nuovo test mirato: esercizio con `barWeight = 20` → `nextPrescription` ritorna
    `barWeight: 20` e `load` (dischi) **invariato** rispetto allo stesso esercizio con
    `barWeight` assente → conferma che il bilanciere è un pass-through e non tocca la
    matematica.
- `npm run check` + `npm test` verdi prima di chiudere ogni milestone.

## Fuori scope (YAGNI)
- Timer/cronometro live a schermo durante la seduta.
- Modifica manuale della durata.
- Breakdown dischi-per-lato (es. "2×20 + 1×10 per lato").
- Pausa/ripresa della seduta o persistenza del draft tra sessioni dell'app.

## Sequenza
Milestone indipendenti. Coerente con il flusso milestone-by-milestone: implementare M1,
fermarsi per ok, poi M2. Ogni milestone aggiorna il proprio stato nel plan per l'handoff.
