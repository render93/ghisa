# Design — Salto allenamento + Arrotondamento ibrido

Data: 2026-06-03
Stato: approvato in brainstorming, pronto per il piano di implementazione

## Contesto

Due feature indipendenti sul motore di allenamento di Ghisa, da realizzare come **due
milestone separate** (stop a fine di ciascuna per ok, da preferenza utente):

- **Milestone B — Arrotondamento ibrido**: il passo di arrotondamento dei carichi diventa
  differenziato per schema (wave/linear) con override opzionale per singolo esercizio.
- **Milestone A — Salto allenamento**: poter registrare il salto di un'intera seduta e/o
  di singoli esercizi, in modalità *solo registrazione* (nessun effetto sui pesi).

Ordine di implementazione: **prima B** (più piccola, basso rischio), poi **A**.

### Decisioni di design raccolte in brainstorming

| Tema | Scelta |
|------|--------|
| Effetto del salto sui pesi | **Solo registrazione** — nessun effetto, stato esercizio congelato |
| Granularità del salto | **Entrambi** — intera seduta + singolo esercizio |
| Dati del salto-seduta | **Nota + data** (entrambi) |
| Asse arrotondamento | **Ibrido** — default per schema in Impostazioni + override per esercizio |

### Stato del codice rilevante (pre-feature)

- La progressione avanza **solo** al commit del summary (`workout/summary/+page.svelte` →
  `applyEntryResult` → `exercisesStore.update` → `workoutsStore.commit`). È l'unico punto.
- `nextPrescription(ex, settings)` e `applyEntryResult(ex, entry, action, settings)` sono
  funzioni pure in `src/lib/domain/progression.ts`; ricevono già `ex` e `settings`.
- `plateRounding` è **un solo** valore globale in `Settings`, usato in 6 `roundTo(...)` dentro
  `progression.ts` e come `step` negli input carico (`ExerciseForm.svelte`, `workout/new`).
- `Settings` è persistito come blob **JSONB** (`user_settings.data`) e idratato con
  `{ ...DEFAULT_SETTINGS, ...stored }` → aggiungere campi NON richiede migration SQL.
- `exercises`, `workouts`, `workout_entries` sono tabelle **colonnari** → modifiche allo
  schema richiedono migration SQL (file in `supabase/migrations/`, applicata a mano nello
  SQL Editor, poi `npx supabase gen types typescript ... > src/lib/database.types.ts`).
- Lo storico (`storico/`) legge esclusivamente `workouts` + `workout_entries`.
- Un esercizio "non toccato" durante una seduta viene già salvato come entry con set nulli e
  non produce progressione (`anyLogged` è falso → `applyEntryResult` ritorna `noop`).

---

## Milestone B — Arrotondamento ibrido

### Obiettivo

Multiarticolari (tipicamente wave, dischi da 1,25 kg → passo 2,5) e altri esercizi
(tipicamente linear, manubri → passo 1–2 kg) possono avere passi diversi. Default per schema,
con override fine per esercizio quando l'euristica "schema = attrezzo" non regge.

### Modello dati

**Settings (nessuna migration — JSONB)**

In `src/lib/domain/types.ts`:
- Rimuovere `plateRounding: number` da `Settings`.
- Aggiungere `plateRoundingWave: number` e `plateRoundingLinear: number`.
- In `DEFAULT_SETTINGS`: `plateRoundingWave: 2.5`, `plateRoundingLinear: 2`.

Backfill: nessun codice dedicato. Il merge `{ ...DEFAULT_SETTINGS, ...stored }` fornisce i
default ai due nuovi campi; un eventuale vecchio `plateRounding` salvato resta come proprietà
ignorata. L'utente ritara i due valori in Impostazioni (one-time).

**Exercise (migration SQL)**

Nuova colonna nullable su `exercises`:
```sql
alter table exercises add column plate_rounding numeric;
```
`NULL` = usa il default dello schema. Aggiornare in `src/lib/stores/exercises.svelte.ts`:
- `DbExercise`: `plate_rounding: number | null`
- `dbToDomain`: `plateRounding: row.plate_rounding ?? undefined`
- `domainToDb`: `plate_rounding: ex.plateRounding ?? null`

In `types.ts` aggiungere a `Exercise`: `plateRounding?: number` (override; assente = default schema).

Rigenerare `src/lib/database.types.ts` dopo la migration.

### Dominio

Nuova funzione pura esportata in `progression.ts`:
```ts
export function effectiveRounding(ex: Exercise, settings: Settings): number {
  return ex.plateRounding ?? (ex.scheme === 'wave'
    ? settings.plateRoundingWave
    : settings.plateRoundingLinear);
}
```
Sostituire tutti i 6 usi di `settings.plateRounding` dentro i `roundTo(...)` di
`nextPrescription` e `applyEntryResult` con `effectiveRounding(ex, settings)`. Nessun cambio
di firma (entrambe ricevono già `ex` e `settings`).

### UI

- **Impostazioni** (`impostazioni/+page.svelte`): rimuovere il campo "Arrotondamento dischi"
  da "Generale". Aggiungere un campo "Arrotondamento dischi" nella card **Wave** (lega a
  `editing.plateRoundingWave`) e uno nella card **Linear** (`editing.plateRoundingLinear`),
  con i rispettivi testi `HELP`.
- **ExerciseForm** (`ui/ExerciseForm.svelte`): nuovo campo numerico opzionale "Arrotondamento
  dischi (vuoto = default schema)" che mappa su `plateRounding` (vuoto/0 → `undefined`). Lo
  `step` degli input carico usa il rounding effettivo (override se presente, altrimenti
  default dello schema selezionato nel form).
- **workout/new** (`workout/new/+page.svelte`): lo `step` dell'input KG usa
  `effectiveRounding(currentExercise, settingsStore.data)`.

### Test

In `src/lib/domain/progression.test.ts`:
- aggiornare i riferimenti esistenti a `plateRounding` (es. il commento/setup del test wave);
- aggiungere casi: default per schema (wave usa `plateRoundingWave`, linear usa
  `plateRoundingLinear`) e override per-esercizio (`ex.plateRounding` ha precedenza su entrambi).

---

## Milestone A — Salto allenamento

### Obiettivo

Registrare quando una seduta intera o singoli esercizi vengono saltati, in modalità *solo
registrazione*: lo stato di progressione **non** si muove. La correttezza è **strutturale** —
si ottiene non invocando mai `applyEntryResult`, non con logica condizionale nel motore.

### Modello dati (migration SQL)

Riuso delle tabelle esistenti (lo storico già legge `workouts`):
```sql
alter table workouts add column skipped boolean not null default false;
alter table workouts add column note text;
alter table workout_entries add column skipped boolean not null default false;
```
- `performed_at` esiste già → riusata per la **data selezionabile** del salto-seduta.
- RLS invariate (policy row-level: le nuove colonne ereditano).
- Rigenerare `database.types.ts` dopo la migration.

**Definizione "salto-seduta"**: una riga `workouts` con `skipped=true`, `note` (opzionale),
`performed_at` (data scelta) e **zero** righe `workout_entries`.

**Definizione "salto-esercizio"**: una riga `workout_entries` con `skipped=true` dentro una
seduta normale; non passa da `applyEntryResult`, quindi `result_info` e `user_action` restano
`null` e nessun avanzamento avviene.

### Store — workouts (`workouts.svelte.ts`)

- Estendere il tipo `Workout` con `skipped: boolean` e `note: string | null`; estendere
  `WorkoutEntryRecord` con `skipped: boolean`. Aggiornare i mapping in `load()` e `commit()`.
- `commit()`: includere `skipped` nella riga entry (`skipped: e.skipped`); le righe `workouts`
  normali hanno `skipped: false`, `note: null`.
- Nuovo metodo `commitSkip(schedaId, dayId, performedAt, note)`: inserisce una sola riga
  `workouts` con `skipped=true`, `note`, `performed_at`, **senza** entries; la prepende a
  `state.items`. Double-check sessione live via `supabase.auth.getUser()` (pattern esistente).

### Store — draft (`workout-draft.svelte.ts`)

- `DraftEntry`: aggiungere `skipped: boolean` (init `false` in `start()`).
- Nuovo metodo `setSkipped(exIdx, value)` (toggle del flag sull'entry).

### Flusso — salto del singolo esercizio

- **workout/new**: sull'esercizio corrente, azione "Salta esercizio" (toggle). Quando saltato:
  le set-row si mostrano disattivate/collassate e compare "Annulla salto". Il flag `skipped`
  **ha precedenza** sui set: eventuali set loggati vengono ignorati ai fini progressione.
- **summary** (`workout/summary/+page.svelte`): gli entry `skipped` mostrano un badge
  "saltato" e **non** mostrano il blocco "ripeti settimana".
- **commit** (in summary): per un entry con `de.skipped === true` → **non** chiamare
  `applyEntryResult` (nessun `exercisesStore.update`), `resultInfo = null`, `userAction = null`,
  e push dell'entry con `skipped: true`. Gli entry vuoti *non* marcati esplicitamente restano
  come oggi ("non eseguito"), semanticamente distinti dal "saltato".

### Flusso — salto dell'intera seduta

- **Pagina giorno** (`schede/[id]/days/[dayId]/+page.svelte`): accanto a "Inizia seduta" un
  bottone secondario "Salta seduta". Apre un **pannello inline espandibile** (stesso pattern di
  `pickerOpen` già presente — niente nuovo componente modale, coerente con la convenzione
  "niente toast/modal a pezzi"): textarea nota opzionale + input `date` (default oggi) →
  "Conferma salto" → `workoutsStore.commitSkip(...)` → `nav('/storico/')`.

### UI — storico

- **Lista** (`storico/+page.svelte`): le sedute `skipped` mostrano un badge "saltata" + nota;
  nascondere il conteggio esercizi.
- **Dettaglio** (`storico/[id]/+page.svelte`): per una seduta saltata mostrare nota + data al
  posto degli entry; per una seduta normale, gli entry con `skipped=true` mostrano il badge
  "saltato".

### Dominio e test

`progression.ts` **non cambia** per il salto. La garanzia "i pesi non si muovono" è data dal
non invocare `applyEntryResult` (salto-esercizio) e dal non creare entries (salto-seduta).
Nessun nuovo `ProgressionResult`. La copertura del salto è strutturale; i test puri di
dominio aggiunti in questo lavoro riguardano solo la Milestone B (arrotondamento).

---

## Migration files

Due file separati in `supabase/migrations/`, uno per milestone, applicati a mano nello SQL
Editor + `gen types` dopo ciascuno:

1. `<ts>_add_plate_rounding_to_exercises.sql` — `alter table exercises add column plate_rounding numeric;`
2. `<ts>_add_skip_columns.sql` — le tre `alter table` di cui sopra (workouts ×2, workout_entries ×1).

## Fuori scope (YAGNI)

- Detraining / decadimento dei carichi dopo N salti (scelta esplicita: solo registrazione).
- Snapshot degli esercizi pianificati dentro un salto-seduta (il giorno della scheda li elenca già).
- Migrazione del vecchio valore `plateRounding` salvato (default sensati + ritaratura manuale).
- Trasformare gli entry vuoti "non eseguiti" in "saltati" automaticamente (solo salto esplicito).
