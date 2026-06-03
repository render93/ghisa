# Design — Incremento lineare a "passi di arrotondamento" (opzione C)

Data: 2026-06-03
Stato: **APPROVATO in brainstorming** — pronto per il plan di implementazione
Risolve: `docs/superpowers/specs/2026-06-03-known-issue-linear-increment-rounding.md`

## Decisione

Adottata l'**opzione C** del known-issue: l'incremento lineare smette di essere un valore in kg e diventa **"N passi dello step di arrotondamento"** (default N=1).

Razionale: step (griglia su cui atterra il carico) e incremento (di quanto sale) sono due metà della stessa grandezza fisica — "il disco più piccolo che riesci ad aggiungere". Esprimere l'incremento come multiplo intero dello step:

- elimina il bug **per costruzione**: il nuovo carico è sempre `vecchio + N×step`, mai arrotondabile all'indietro;
- risolve **entrambi** i casi del known-issue senza toccare i dati esercizi:
  - **caso 1** (progressione bloccata): Hip thrust / Lat machine con `step = 5` ripartono a +5;
  - **caso 2** (incremento inadatto ai leggeri): Alzate laterali con `step = 1` salgono di +1, non più di +2;
- rende l'esito `linear-advance` **sempre veritiero** (vedi §Motore), quindi niente più "avanzamento che non avanza".

L'unica flessibilità che C toglie — configurare `step > incremento` — è esattamente la configurazione rotta, che fisicamente non esiste (non puoi aggiungere 2,5 kg a una macchina con scatti da 5).

È stato scelto di supportare anche un **override per-esercizio** del numero di passi (oltre al default globale), simmetrico all'override di `plateRounding` già esistente. Serve quando si vuole forzare una salita più rapida su un esercizio tenendo però la griglia fine (es. `step = 2,5`, `passi = 2` ⇒ +5 a sessione restando su multipli di 2,5).

## Modello dati

### Settings (`src/lib/domain/types.ts`)
- **Rimuovi** `linearIncrementKg: number`.
- **Aggiungi** `linearIncrementSteps: number` (intero ≥ 1).
- In `DEFAULT_SETTINGS`: `linearIncrementSteps: 1`.

Le `Settings` sono persistite come blob JSON nella colonna `user_settings.data` e fuse al load con `{ ...DEFAULT_SETTINGS, ...stored }` (`settings.svelte.ts:20`). Conseguenze:
- **Nessuna migration SQL** per le settings.
- Il blob saldato dell'utente non ha la chiave `linearIncrementSteps` → la eredita dal default (= 1) automaticamente.
- La vecchia chiave `linearIncrementKg` resta inerte nel blob (TS non la conosce più, runtime la ignora). Residuo innocuo, **non** lo ripuliamo (non vale una migration).

### Exercise (`src/lib/domain/types.ts`)
- **Aggiungi** `linearIncrementSteps?: number` (override per-esercizio; assente = usa il globale). Posizionarlo accanto a `plateRounding` con commento gemello.

### Migration SQL (`supabase/migrations/`)
Nuova colonna sulla tabella `exercises` (colonnare — vedi `exercises.svelte.ts` `DbExercise`). Da lanciare **a mano** nel SQL Editor Supabase, poi rigenerare `database.types.ts` (il repo non applica le migration automaticamente).

```sql
-- Override opzionale del numero di passi di incremento per advance, per singolo esercizio.
-- NULL = usa il default globale (settings.linearIncrementSteps).
alter table exercises add column linear_increment_steps integer;
```

Mappatura in `src/lib/stores/exercises.svelte.ts`:
- `DbExercise`: aggiungi `linear_increment_steps: number | null;`
- `dbToDomain`: `linearIncrementSteps: row.linear_increment_steps ?? undefined,`
- `domainToDb`: `linear_increment_steps: ex.linearIncrementSteps ?? null,`

## Motore (`src/lib/domain/progression.ts`)

Nuovo helper, gemello di `effectiveRounding`:

```ts
export function effectiveIncrementSteps(ex: Exercise, settings: Settings): number {
  return ex.linearIncrementSteps ?? settings.linearIncrementSteps;
}
```

Ramo advance lineare in `applyEntryResult` (oggi `progression.ts:90-93`):

```ts
const step = effectiveRounding(ex, settings);
const n = effectiveIncrementSteps(ex, settings);
updated.linearCurrentLoad = roundTo((ex.linearCurrentLoad ?? 0) + n * step, step);
```

Il `roundTo` finale resta come **auto-correzione**: se il carico di partenza è fuori griglia (es. 42 con step 5) la prima salita lo riallinea (42 → 45), poi prosegue pulito. Garanzia di monotonia anche con arrotondamento:

> `roundTo(old + n·step, step) ≥ old + (n − 0,5)·step > old` per ogni `n ≥ 1`.

Quindi `newLoad > old` **sempre** → l'esito `linear-advance` è sempre veritiero.

**`ProgressionResult` invariato**: nessun nuovo esito, nessun guard difensivo (l'avanzamento nullo è impossibile per costruzione). Gli altri rami lineari (`linear-repeat`, `linear-deload`) restano identici.

## UI

### Impostazioni — card "Linear" (`src/routes/impostazioni/+page.svelte`)
Il campo oggi etichettato "Incremento per advance (kg)" diventa a passi:

- **Label**: `Incremento per advance (passi)`
- **Input**: `bind:value={editing.linearIncrementSteps}`, `type="number"`, `min="1"`, `step="1"`
- **Help** (record `HELP`, chiave `linearIncrementSteps`, sostituisce la voce `linearIncrementKg`):

  > `Di quanti passi di arrotondamento sale il carico dopo una sessione completata pienamente (1 = un passo). Lo "step" è l'arrotondamento dischi, globale o per-esercizio.`

### Form esercizio — solo schema linear (`src/lib/ui/ExerciseForm.svelte`)
Nuovo campo opzionale dentro il blocco `{:else}` (linear), pattern identico a `plateRounding`:

- stato `let linearIncrementSteps = $state<number | undefined>(exercise.linearIncrementSteps);`
- in `submit`, ramo linear: `linearIncrementSteps: linearIncrementSteps && linearIncrementSteps > 0 ? linearIncrementSteps : undefined`
- markup:

  > Label: `Passi per advance (vuoto = default impostazioni)`
  > `<input type="number" min="1" step="1" placeholder={String(settingsStore.data.linearIncrementSteps)} bind:value={linearIncrementSteps} />`

Il campo `Arrotondamento dischi` esistente resta dov'è (vale per entrambi gli schemi).

## Test (`src/lib/domain/progression.test.ts`)

- Aggiorna il test advance esistente (`progression.test.ts:158`): con i default (step 2, N=1) il risultato resta **62** (`60 + 1×2`); cambia solo nome/commento.
- **Regressione del bug**: `linearCurrentLoad = 40`, `plateRounding = 5`, N globale 1 → atteso **45**.
- **Override per-esercizio**: `linearIncrementSteps = 2`, `plateRounding = 2,5`, load 50 → atteso **55**.
- **Precedenza**: override per-esercizio vince sul globale; assente ⇒ usa globale.
- **Self-heal fuori griglia**: load 42, step 5, N=1 → **45**.
- (Opzionale) proprietà anti-blocco: per `n ≥ 1` e `step > 0`, `newLoad > old`.

## Fuori scope

- **Nessun backfill** dello storico: il record `result_info = { kind: "linear-advance", newLoad: 40 }` già salvato per la seduta Hip thrust bloccata resta com'è (dato passato, non renderizzato in nessuna UI).
- **Nessuna validazione** `step ≤ incremento`: con C è strutturalmente impossibile sbagliare.
- **Wave invariato**: il rischio teorico di "swallow" della percentuale `waveCycleIncrementPct` a carichi base molto bassi resta solo annotato (rischio basso, fondamentali pesanti); non lo tocchiamo qui.

## File coinvolti

| File | Modifica |
|---|---|
| `supabase/migrations/20260603000002_add_linear_increment_steps_to_exercises.sql` | nuova migration (1 riga) |
| `src/lib/database.types.ts` | rigenerare dopo la migration |
| `src/lib/domain/types.ts` | `Settings` (swap campo) + `DEFAULT_SETTINGS` + `Exercise` (nuovo campo opzionale) |
| `src/lib/domain/progression.ts` | `effectiveIncrementSteps` + ramo advance |
| `src/lib/stores/exercises.svelte.ts` | `DbExercise` + `dbToDomain` + `domainToDb` |
| `src/routes/impostazioni/+page.svelte` | label + binding + help text |
| `src/lib/ui/ExerciseForm.svelte` | nuovo campo per-esercizio (linear) |
| `src/lib/domain/progression.test.ts` | test aggiornati + nuovi |

### Ordine operativo
1. Codice (types → motore → store → UI → test), `npm run check` + `npm test` verdi sul nuovo modello.
2. Lanciare la migration SQL a mano in Supabase.
3. `npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`.
4. Verifica runtime: una seduta Hip thrust completata → la prescrizione successiva sale da 40 a 45.
