# Cambio peso in seduta + ricalibro progressione lineare — Design

> **Stato:** approvato in brainstorming il 2026-07-02, pronto per il plan di implementazione.
> **Spec di riferimento correlate:** `2026-06-03-linear-increment-steps-design.md`, `2026-06-03-salto-e-arrotondamento-ibrido-design.md`.

## Contesto e problema

Durante una seduta (`src/routes/workout/new/+page.svelte`, righe 107-149) il peso di ogni serie è un campo editabile, **per tutti gli esercizi indistintamente** (wave e lineare). Ma il motore di progressione ignora il peso effettivamente usato:

- `applyEntryResult` (`src/lib/domain/progression.ts`) fa avanzare il lineare solo se `allCompleted = every(status==='ok' && reps>=target)`, ricalcolando `linearCurrentLoad` dal carico **memorizzato**, non da quello sollevato.
- Nel wave `weekWasFailed` guarda solo status/reps.

Conseguenza: se abbassi o alzi il peso in seduta, la modifica finisce solo nello storico e non ha alcun effetto sulla traiettoria. Vogliamo che, **nel solo schema lineare**, il peso effettivo guidi un ricalibro automatico del carico; e che nel **wave** il peso non sia proprio modificabile, perché lì il carico è derivato dalla macchina ripeti/hold/reset/deload e non è un valore diretto.

Questo lavoro chiude anche due finding della review del 2026-07-02:
- **A3-04** — nel lineare le serie non loggate contano come fallimento (asimmetria col wave).
- **R7** — la soglia di deload lineare è il letterale `fails >= 2` (progression.ts:107) invece di un valore in `Settings`.

## Requisiti funzionali

### Lineare — regola "del 25%"
- Una serie è **abbassata** se `load < prescritto`, **alzata** se `load > prescritto` (confronto sul peso dischi; il bilanciere è a parte).
- Soglia: **più del** `linearLoadShiftPct`% delle serie (frazione del numero di serie), configurabile in Impostazioni, default **25%**.
- **> soglia serie abbassate** → il carico scende al peso usato **più basso**; si riparte da lì.
- **> soglia serie alzate e completate** → il carico sale al peso usato **più alto** (nessuno step aggiuntivo).
- Il **completamento si valuta sul peso effettivo** usato, non sul prescritto.
- Se sia abbassate sia alzate superassero la soglia (raro): **precede il ribasso**.
- Sotto soglia → comportamento attuale (avanza di uno step se completi, altrimenti fallimento → deload).

### Wave
- La regola del 25% **non** si applica: resta intatta la macchina ripeti-settimana / hold / reset / deload.
- In seduta il peso **non è modificabile**: la riga-serie mostra solo reps + ✓/✗. Il motore wave usa già le reps (`weekWasFailed`, progression.ts:65-70), quindi l'informazione è sfruttata.

### Serie non loggate (chiude A3-04)
- Non si può concludere finché ogni serie non è marcata ✓/✗ (salvo esercizio saltato). Così il denominatore della soglia è sempre pieno e i calcoli sono deterministici.

## Design tecnico

### 1. Dominio — `resolveLinearOutcome` (funzione pura)

Nuova funzione pura in `progression.ts`, chiamata dal ramo lineare di `applyEntryResult` (che oggi occupa le righe 91-119 e diventa: calcola l'esito → applicalo).

```ts
type LinearOutcome =
  | { kind: 'advance';   newLoad: number }  // completato, nessuna divergenza rilevante → +step
  | { kind: 'downshift'; newLoad: number }  // completato, > soglia serie abbassate → min(load usati)
  | { kind: 'upshift';   newLoad: number }  // completato, > soglia serie alzate → max(load usati)
  | { kind: 'repeat';    newLoad: number }  // non completato, sotto la soglia di deload
  | { kind: 'deload';    newLoad: number }; // non completato, raggiunta la soglia di fallimenti
```

**Precondizione** (garantita dalla UI, vedi §2): tutte le `N` serie sono loggate (`status` ≠ null), quindi `N = actualSets.length`.

**Definizioni** — `P` = `prescribed.load`; `R` = `prescribed.reps`; per la serie `i`: `Li` = peso usato, `ri` = reps, `si` = stato.
- `lowered` = #{ `Li < P` }; `raised` = #{ `Li > P` }.
- `completato` = tutte le serie hanno `si === 'ok'` **e** `ri >= R`.
- soglia `t` = `settings.linearLoadShiftPct / 100`.

**Tabella dei casi:**

| Completato? | Condizione peso | Esito | `newLoad` | `consecutiveFails` |
|---|---|---|---|---|
| Sì | `lowered/N > t` | `downshift` | `min(Li)` | → 0 |
| Sì | `raised/N > t` | `upshift` | `max(Li)` | → 0 |
| Sì | altrimenti | `advance` | `roundTo(linearCurrentLoad + steps×step)` | → 0 |
| No | `lowered/N > t` | `repeat` / `deload` | `min(Li)` | +1 → `deload` a soglia |
| No | altrimenti | `repeat` / `deload` | `linearCurrentLoad` (invariato) | +1 → `deload` a soglia |

Note:
- Precedenza al **ribasso** se sia `lowered` sia `raised` superano `t`.
- **Caso confermato (abbassi ma non chiudi le reps):** il carico scende **comunque** a `min(Li)` **e** il fallimento è contato (verso il deload). Motivo: se non reggi nemmeno il peso ridotto, la prossima deve ripartire da quel peso, non restare a quello alto.
- `deload` scatta quando `consecutiveFails` raggiunge `settings.linearFailThreshold` (vedi §3), e riduce il `newLoad` di riga di `linearResetPct%`.
- `step` = `effectiveRounding(ex, settings)`; `steps` = `effectiveIncrementSteps(ex, settings)` (invariati).

**Integrazione:** `applyEntryResult` traduce `LinearOutcome` nel `ProgressionResult` finale. Si aggiungono due varianti al discriminated union (`types.ts`, righe 70-86): `{ kind: 'linear-downshift'; newLoad }` e `{ kind: 'linear-upshift'; newLoad }`, così il riepilogo e lo storico possono descrivere l'evento.

**Lock-step:** `nextPrescription` (ramo lineare, progression.ts:57-62) resta invariata — legge `linearCurrentLoad`. Poiché `applyEntryResult` aggiorna quel campo, la prescrizione successiva riflette automaticamente ribasso/rialzo. Le due funzioni restano in lock-step (regola di progetto): la suite `progression.test.ts` va eseguita interamente.

### 2. UI seduta — `src/routes/workout/new/+page.svelte`

- **Riga-serie condizionale allo schema** (oggi righe 107-149, identiche per tutti):
  - **Wave** → solo `REPS` + ✓/✗; il campo `KG` non viene renderizzato. Il draft continua a salvare `load = prescribed.load` (storico corretto), semplicemente non editabile.
  - **Lineare** → invariato: `KG` + `REPS` + ✓/✗.
- **Obbligo di logging (chiude A3-04):** `Succ →` e, sull'ultimo esercizio, `Concludi seduta →` restano **disabilitati** finché ogni serie dell'esercizio corrente non è marcata (`status` ≠ null), a meno che l'esercizio sia *saltato*.

### 3. Settings

- Nuovo campo `linearLoadShiftPct: number` in `Settings` (`types.ts`, righe 3-19) e in `DEFAULT_SETTINGS`, default **25**.
- Nuovo campo `linearFailThreshold: number` (default **2**) — **chiude R7**: sostituisce il letterale `fails >= 2` (progression.ts:107) con `fails >= settings.linearFailThreshold`.
- Nessuna migration SQL: i settings sono JSONB e `settingsStore.load` fa già merge con `DEFAULT_SETTINGS`, quindi le righe esistenti ereditano i default.
- Due nuovi controlli nel form di `/impostazioni/` (label italiane, es. "Soglia ricalibro peso lineare (%)" e "Fallimenti prima del deload (lineare)").

### 4. Testing

- Suite dedicata a `resolveLinearOutcome`, una riga per cella della tabella: completato+giù (l'esempio 4×12 → 8), completato+su, completato-neutro (advance classico), non-completato+giù (scende a min e conta il fallimento), non-completato-neutro → repeat, ripetuti fino al `deload`, mix giù+su (precede il ribasso), soglia esatta al 25% (non scatta), pesi misti (min/max corretti).
- Aggiornamento dei test esistenti di `applyEntryResult` lineare dove il comportamento cambia, e dei test che usavano la soglia deload hardcoded.
- Esecuzione dell'intera `progression.test.ts` per il lock-step `nextPrescription`/`applyEntryResult`.

## Decisioni chiave (con motivazione)

- **Solo lineare**: nel wave il carico è derivato (`base × incremento-ciclo × moltiplicatore-settimana`) e c'è già una macchina che lo aggiusta sui fallimenti; sovrapporre la regola-peso creerebbe due sistemi in conflitto.
- **Rialzo semplice (senza step)**: alzare e completare riparte da quel peso; non si somma lo step, per non accelerare troppo su una spinta occasionale.
- **Completamento sul peso effettivo**: valutare le reps rispetto al peso che hai davvero usato è la lettura coerente con l'autoregolazione.
- **Abbassi e non chiudi → scendi a min e conta il fallimento**: evita di restare bloccato su un peso che hai già dimostrato di non reggere.
- **Obbligo di logging**: rende la soglia del 25% deterministica ed elimina A3-04 alla radice.
- **R7 incluso qui**: il lavoro tocca già il ramo lineare e aggiunge un setting lineare; naturale rendere configurabile anche la soglia di deload.

## Fuori scope

- Applicazione della regola del 25% al **wave**.
- I finding di review **R1, R2, R3, R4, R5**: lavoro correlato ma separato (l'atomicità del salvataggio, il gate migration, gli SHA orfani). Solo **R7** è incluso qui perché insiste sullo stesso ramo di codice.

## File toccati

- `src/lib/domain/progression.ts` — nuova `resolveLinearOutcome`, refactor del ramo lineare di `applyEntryResult`, uso di `settings.linearFailThreshold`.
- `src/lib/domain/types.ts` — `LinearOutcome`, due varianti in `ProgressionResult`, due campi in `Settings` + `DEFAULT_SETTINGS`.
- `src/lib/domain/progression.test.ts` — nuovi casi + aggiornamenti.
- `src/routes/workout/new/+page.svelte` — riga-serie condizionale allo schema, gate di logging.
- `src/routes/impostazioni/+page.svelte` (o equivalente form settings) — due nuovi controlli.
