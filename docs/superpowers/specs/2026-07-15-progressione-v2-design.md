# Progressione v2 — wave adattiva e revisione lineare — Design

> **Stato:** brainstorming wave e lineare approvato il 2026-07-15; pronto per il plan di implementazione.
> **Decisione lineare:** il precedente `+10%` è sostituito da incrementi basati sullo step minimo caricabile: `+2 step` con successo completo, `+1 step` con successo tollerato.
> **Spec correlate:** `2026-06-03-linear-increment-steps-design.md`, `2026-07-02-cambio-peso-seduta-design.md`, `2026-07-02-review-fixes-atomic-save-design.md`.

## Contesto e problema

La progressione corrente separa correttamente:

- lo **stato corrente** dell'esercizio nella tabella `exercises`;
- lo **storico immutabile** della seduta in `workout_entries.prescribed`, `actual_sets` e `result_info`;
- il commit atomico di seduta + avanzamento esercizi tramite la RPC `commit_workout`.

Il problema wave non è corruzione dei dati: è l'interazione tra formula percentuale e arrotondamento al peso caricabile.

Oggi il carico wave (escluso il bilanciere) è:

```text
roundTo(
  waveBaseLoad
  × (1 + waveCycleIncrementPct)^(cycle - 1)
  × weekMultiplier,
  effectiveStep
)
```

con `weekMultiplier = [1, 1.05, 1.10, 1.15, 1.20]` e arrotondamento al più vicino. Un incremento positivo può quindi essere riassorbito completamente dallo step.

### Evidenza sui dati reali

Configurazioni wave presenti al 2026-07-15:

| Esercizio | Base totale | Step effettivo | Stato |
|---|---:|---:|---|
| Rematore T-bar | 60 | 2,5 | W4 C1 |
| Spinte manubri panca piana | 14 | 2 | W1 C2 |
| Squat bilanciere | 50 | 5 | W1 C2 |
| Stacco rumeno bilanciere | 60 | 5 | W4 C1 |

Prescrizioni prodotte dall'algoritmo corrente:

| Esercizio | Ciclo 1 (W1→W5) | Ciclo 2 (W1→W5) |
|---|---|---|
| Rematore T-bar | 60 / 62,5 / 65 / 65 / 67,5 | 60 / 62,5 / 65 / 67,5 / 70 |
| Spinte manubri | 14 / 14 / 16 / 16 / 16 | 14 / 16 / 16 / 16 / 18 |
| Squat bilanciere | 50 / 50 / 55 / 55 / 55 | 50 / 50 / 55 / 55 / 55 |
| Stacco rumeno | 60 / 60 / 65 / 65 / 70 | 60 / 65 / 65 / 65 / 70 |

La stessa configurazione percentuale ha quindi effetti diversi in base al rapporto `step / carico`; in alcuni casi il ciclo successivo è identico al precedente.

## Obiettivi

1. La wave prescrive una sequenza caricabile e comprensibile:
   `3×8`, `4×6`, `5×5`, `6×4`, `8×3`, con carico crescente di almeno uno step quando c'è progressione.
2. Il peso wave è modificabile durante la seduta e il peso realmente consolidato influenza la settimana successiva.
3. Più del 25% di serie non riuscite significa che non c'è progressione: si ripete la stessa settimana a carico ridotto.
4. Un abbassamento sostenuto del peso ricalibra il resto della wave senza cancellare lo storico.
5. Ogni settimana del ciclo successivo parte dal `+2%` della corrispondente settimana precedente, quantizzato su un peso realmente caricabile.
6. La transizione è additiva: nessuna riscrittura o cancellazione delle vecchie sedute.
7. Le vecchie configurazioni hold/reset e la scelta manuale ripeti/avanza vengono rimosse dall'interfaccia.
8. La lineare distingue successo completo, successo tollerato e fallimento usando carico e ripetizioni effettivi, senza incrementi percentuali aggressivi.
9. La tolleranza del 25% è una regola fissa del dominio, condivisa da wave e lineare e non configurabile dall'utente.

## Non-obiettivi

- Riscrivere `prescribed`, `actual_sets` o `result_info` delle sedute già salvate.
- Cancellare subito colonne o chiavi JSON legacy.
- Rendere configurabile il pattern serie/reps della wave.
- Riprogettare il deload programmato: resta disponibile e viene adattato al nuovo piano, ma le sue regole non cambiano in questo lavoro.

## Decisioni funzionali wave

### Pattern fisso

| Settimana | Serie × reps |
|---|---:|
| W1 | 3×8 |
| W2 | 4×6 |
| W3 | 5×5 |
| W4 | 6×4 |
| W5 | 8×3 |

### Piano caricabile del primo ciclo v2

`effectiveStep` resta quello già esistente:

```text
exercise.plateRounding ?? settings.plateRoundingWave
```

Il piano iniziale usa uno step per settimana:

```text
W1 = baseLoad
W2 = baseLoad + 1 × effectiveStep
W3 = baseLoad + 2 × effectiveStep
W4 = baseLoad + 3 × effectiveStep
W5 = baseLoad + 4 × effectiveStep
```

I carichi sono memorizzati internamente **senza bilanciere**, come oggi; la UI mostra sempre il totale `load + barWeight`.

Esempi risultanti:

| Esercizio | Piano C1 v2 |
|---|---|
| Rematore T-bar | 60 / 62,5 / 65 / 67,5 / 70 |
| Spinte manubri | 14 / 16 / 18 / 20 / 22 |
| Squat bilanciere | 50 / 55 / 60 / 65 / 70 |
| Stacco rumeno | 60 / 65 / 70 / 75 / 80 |

Uno step per settimana è il minimo compatibile con la richiesta “carico crescente”. Se il minimo fisico è 5 kg, quattro aumenti richiedono almeno 20 kg tra W1 e W5. L'autoregolazione descritta sotto permette di ridurre la curva quando la prestazione reale non la sostiene.

### Ciclo successivo: +2% sul totale

Per ogni posizione `i` del piano completato:

```text
rawTotal[i] = (previousPlateLoad[i] + barWeight) × 1.02
candidatePlateLoad[i] = ceilToStep(rawTotal[i] - barWeight, effectiveStep)
```

L'incremento percentuale si applica al **peso totale percepito dall'utente**, non soltanto ai dischi. Per un aumento si usa il prossimo peso caricabile (`ceilToStep`), non l'arrotondamento al più vicino.

Dopo la quantizzazione si applica il vincolo di monotonia interna:

```text
next[i] = max(candidate[i], next[i - 1] + effectiveStep)
```

Il vincolo vale nella generazione del nuovo ciclo; una ricalibrazione in corso può invece produrre temporaneamente valori uguali o inferiori alle settimane già svolte, perché rappresenta esplicitamente un mancato progresso.

### Peso modificabile in seduta

Il campo peso viene mostrato sia per lineare sia per wave. L'utente inserisce il peso totale; il draft continua a memorizzare `load` senza bilanciere.

Ogni serie ha una sola azione di conferma. Confermare significa “serie eseguita”, non “obiettivo raggiunto”: reps e carico registrati determinano automaticamente se la serie è valida. Non sono presenti né un pulsante manuale di fallimento né un'azione “applica alle serie successive”.

### Serie valida e carico consolidato

Una serie è valida se:

```text
status === 'ok' && reps >= prescribed.reps
```

Con `N = prescribed.sets`, il numero minimo di serie valide è:

```text
required = ceil(N × 0.75)
```

| Settimana | Serie | Minimo valido |
|---|---:|---:|
| W1 | 3 | 3 |
| W2 | 4 | 3 |
| W3 | 5 | 4 |
| W4 | 6 | 5 |
| W5 | 8 | 6 |

Esattamente il 25% di serie non riuscite è tollerato; il fallimento scatta solo quando la quota è maggiore del 25%.

Se esistono almeno `required` serie valide, il **carico consolidato** è il massimo carico sostenuto da almeno quel numero di serie:

```text
validLoadsDescending.sort(desc)
consolidatedLoad = validLoadsDescending[required - 1]
```

Esempio `5×5 @ 70`, `required = 4`:

| Serie valide | Consolidato |
|---|---:|
| 5×70 | 70 |
| 4×70 + 1×65 | 70 |
| 3×70 + 2×65 | 65 |
| 5×65 | 65 |

### Esiti della seduta wave

| Condizione | Esito | Settimana successiva | Piano carichi |
|---|---|---|---|
| `validSets >= required`, consolidato = prescritto | advance | `week + 1` | invariato |
| `validSets >= required`, consolidato ≠ prescritto | rebase + advance | `week + 1` | corrente e future traslate della differenza |
| `validSets < required` | repeat-reduced | stessa settimana | corrente e future traslate verso il carico ridotto |
| esercizio saltato / nessun tentativo | noop | invariata | invariato |

La traslazione è:

```text
delta = resolvedLoad - prescribedLoad
for i from currentWeekIndex to 4:
  plan[i] = max(0, plan[i] + delta)
```

Ogni valore viene riallineato alla griglia dello step. Le settimane già completate non vengono riscritte.

### Carico ridotto su fallimento

Quando `validSets < required`, non esiste progressione. Si ripete la stessa settimana.

Il carico predominante è il valore usato nel maggior numero di serie tentate; in caso di parità vince il più basso. Il nuovo carico è:

```text
reducedLoad = floorToStep(
  min(prescribedLoad - effectiveStep, predominantActualLoad),
  effectiveStep
)
```

Il risultato è sempre almeno uno step sotto il prescritto e può scendere ulteriormente se la maggioranza della seduta è già stata svolta più in basso.

Esempio `@70`, step 5:

- tutte a 70 ma troppe serie fallite → ripeti a 65;
- maggioranza delle serie a 65 → ripeti a 65;
- maggioranza a 60 → ripeti a 60.

Quando la ripetizione viene consolidata, si avanza dalla nuova curva: W3 consolidata a 65 → W4 a 70.

### Fine ciclo

Alla conclusione riuscita di W5:

1. il piano corrente contiene già tutti gli eventuali rebase;
2. viene generato il nuovo array di cinque carichi con `+2%` e quantizzazione crescente;
3. `waveCurrentWeek` torna a 1;
4. `waveCurrentCycle` aumenta di 1;
5. le vecchie logiche hold/reset non vengono eseguite;
6. il deload programmato può impostare `pendingDeload` come oggi.

### Deload programmato

`deloadEveryNCycles`, `deloadLoadPct`, `deloadSetsMult` e `deloadRepsMult` restano configurabili.

Il deload legge il carico della settimana corrente dal piano v2 e applica la riduzione con l'arrotondamento al passo più vicino già usato dal motore legacy (`roundTo`). Questo evita un'ulteriore riduzione non prevista durante la transizione. Al completamento:

- `pendingDeload` viene azzerato;
- il piano e la settimana non avanzano;
- la seduta normale successiva usa la stessa settimana pianificata.

## Modello dati

### Exercise/domain

Si aggiungono:

```ts
progressionVersion?: number; // legacy assente/1; nuovo motore = 2
waveCycleLoads?: number[];   // esattamente 5 carichi, escluso bilanciere
```

`waveCycleLoads` è la fonte autorevole della prescrizione v2. `waveBaseLoad` resta durante la transizione e per compatibilità con record legacy, ma non guida più `nextPrescription` quando `progressionVersion === 2`.

### Database

Migration additiva su `exercises`:

```sql
alter table exercises
  add column progression_version integer not null default 1,
  add column wave_cycle_loads numeric[];
```

Vincoli applicativi:

- versione 2 wave → array presente, lungo 5, valori `>= 0`;
- versione 1 / array nullo → bootstrap legacy;
- nessun `DROP COLUMN` in questa fase.

La RPC `commit_workout` deve aggiornare anche `progression_version` e `wave_cycle_loads`, mantenendo il commit atomico già esistente.

### Settings

Modifiche v2:

- `waveCycleIncrementPct`: default da `2.5` a `2`;
- non utilizzati dal motore v2 e rimossi dall'interfaccia:
  - `cycleHoldThreshold`;
  - `cycleResetThreshold`;
  - `cycleResetPct`;
  - `linearIncrementSteps`;
  - `linearResetPct`;
  - `linearLoadShiftPct`;
  - `linearFailThreshold`.

Le chiavi legacy restano nei tipi e nei blob JSON esistenti finché il ramo v1 è necessario per bootstrap e test di compatibilità. Non serve cancellarle. `plateRoundingLinear` resta invece attivo: rappresenta lo step fisico, non il vecchio numero configurabile di step per avanzamento.

La soglia di fallimento non viene aggiunta ai settings: resta fissa al 25% nel dominio per wave e lineare. In questo modo non esistono combinazioni configurabili capaci di cambiare retroattivamente il significato di successo tollerato.

Poiché gli utenti esistenti hanno `waveCycleIncrementPct = 2.5` già persistito, cambiare solo `DEFAULT_SETTINGS` non basta. La migrazione deve aggiornare esplicitamente il JSON alla nuova regola del 2%, preservando le altre chiavi:

```sql
update user_settings
set data = jsonb_set(data, '{waveCycleIncrementPct}', '2'::jsonb, true),
    updated_at = now();
```

### ProgressionResult e snapshot storico

I vecchi `result_info` non vengono reinterpretati. Le nuove varianti includono dati sufficienti a spiegare l'esito senza ricalcolarlo con setting futuri:

```ts
| {
    kind: 'wave-v2-advance';
    algorithmVersion: 2;
    completedWeek: number;
    nextWeek: number;
    prescribedLoad: number;
    consolidatedLoad: number;
    requiredSets: number;
    validSets: number;
    nextLoad: number;
  }
| {
    kind: 'wave-v2-rebase-advance';
    algorithmVersion: 2;
    completedWeek: number;
    prescribedLoad: number;
    consolidatedLoad: number;
    oldPlan: number[];
    newPlan: number[];
  }
| {
    kind: 'wave-v2-repeat-reduced';
    algorithmVersion: 2;
    week: number;
    prescribedLoad: number;
    reducedLoad: number;
    requiredSets: number;
    validSets: number;
    oldPlan: number[];
    newPlan: number[];
  }
| {
    kind: 'wave-v2-cycle-end';
    algorithmVersion: 2;
    completedCycle: number;
    adjustmentKind: 'advance' | 'rebase';
    prescribedLoad: number;
    consolidatedLoad: number;
    requiredSets: number;
    validSets: number;
    oldPlan: number[];
    completedPlan: number[];
    nextPlan: number[];
    pendingDeload: boolean;
  }
```

`prescribed` continua a salvare `sets`, `reps`, `load`, `barWeight`, `week`, `cycle`, `isDeload`; per le nuove entries aggiunge `algorithmVersion: 2`.

## Transizione dei dati esistenti

### Storico

- `workouts` e `workout_entries` restano invariati.
- Le prescrizioni passate continuano a mostrare il peso realmente prescritto in quel momento.
- `result_info` legacy (`wave-advance-week`, `wave-repeat-week`, `wave-cycle-end`, ecc.) resta valido come dato storico v1.

### Bootstrap lazy degli esercizi wave

Per evitare salti immediati e non dipendere da un backfill complesso sullo storico, un esercizio wave v1 viene convertito quando viene caricato/usato dal client v2:

1. calcola la prossima prescrizione con l'algoritmo legacy e i setting legacy correnti;
2. usa quel carico come ancora della settimana corrente `k`;
3. costruisce il piano v2 attorno all'ancora:

```text
plan[i] = max(0, legacyCurrentLoad + (i - k) × effectiveStep)
```

4. imposta `progressionVersion = 2`;
5. persiste il piano al primo commit atomico utile o al salvataggio esplicito dell'esercizio.

Questa strategia garantisce che la **prima prescrizione dopo il deploy non cambi**. I valori del piano precedenti alla settimana corrente sono ancore tecniche v2 e non riscrivono lo storico. Il primo passaggio C1/C2 dopo il cutover è quindi una frontiera dichiarata tra algoritmi, non un tentativo di ricostruire retroattivamente v1.

### Linear

Gli esercizi lineari mantengono `linearCurrentLoad`, target e storico. Al passaggio v2 il contatore dei fallimenti viene azzerato, perché i fallimenti v1 sono stati classificati con regole diverse. Nessuna entry storica viene reinterpretata.

## UI

### Seduta

- Il campo KG torna visibile anche per wave.
- L'input mostra il totale e salva il carico senza bilanciere.
- Ogni serie viene chiusa con un'unica conferma; una serie confermata sotto target resta non valida per il motore.
- Tutte le serie devono essere confermate prima di avanzare, salvo esercizio saltato.

### Riepilogo

Rimuovere la scelta manuale wave “Ripeti settimana / Avanza”. Mostrare invece l'esito calcolato:

```text
Prescritto: 70 kg
Consolidato: 65 kg
Prossima settimana: 70 kg
```

oppure:

```text
Settimana non consolidata
Ripeti 5×5 a 65 kg
```

### Impostazioni

Rimuovere dalla card Wave:

- soglia hold;
- soglia reset;
- riduzione reset.

Mantenere:

- step wave globale;
- incremento ciclo, ora 2%;
- configurazioni del deload.

Non esporre una soglia di fallimento: la tolleranza del 25% è fissa e condivisa da wave e lineare.

### Form esercizio

- Chiarire che `plateRounding` è lo “step minimo caricabile”.
- Mostrare sempre il valore effettivo risolto (override o globale).
- Aggiungere un'anteprima dei cinque carichi del piano corrente e del ciclo successivo.
- In creazione, schema, carico iniziale/base e step minimo sono modificabili.
- Dopo la creazione, schema, carico iniziale/base e step minimo restano visibili ma sono bloccati: rappresentano la configurazione iniziale e non devono bypassare la progressione. Nome, recupero e peso del bilanciere restano modificabili.

## Testing

### Funzioni pure

- `ceilToStep` e `floorToStep`, inclusi decimali 2,5 e valori fuori griglia.
- piano iniziale per step 2 / 2,5 / 5.
- generazione ciclo successivo al 2% sul totale con bilanciere.
- monotonia del nuovo ciclo.
- bootstrap v1→v2 che preserva la prossima prescrizione.
- calcolo `required = ceil(N × 0.75)` per 3/4/5/6/8 serie.
- carico consolidato con carichi misti.
- fallimento e calcolo del carico predominante sulle sole serie prescritte (tie → più basso).
- rebase verso il basso e verso l'alto.
- fine ciclo, snapshot autosufficiente dell'eventuale rebase W5 e piano successivo.
- deload su piano v2, incluso un caso al confine che distingua `roundTo` da `floorToStep`.
- stato wave non valido o prescrizione week/cycle incoerente gestiti senza crash del rendering e rifiutati al commit.
- validità serie lineare: status, reps e carico prescritto raggiunti.
- lineare completa `+2 step`, tollerata `+1 step`, con soglia esatta al 25%.
- primo fallimento lineare in hold, secondo consecutivo al `−5%` quantizzato e reset del contatore.

### Integrazione

- `nextPrescription` legge `waveCycleLoads[currentWeek - 1]` in v2.
- `applyEntryResult` produce ogni nuova variante `ProgressionResult`.
- `commit_workout` persiste entry e piano v2 atomicamente.
- retry dopo errore RPC non modifica lo stato locale.
- storico v1 continua a caricarsi con union legacy.

### Runtime sui dati reali

- Rematore T-bar: step 2,5.
- Spinte manubri: step 2.
- Squat e stacco rumeno: step 5.
- Modifica del peso su tutte o parte delle serie.
- Fallimento oltre 25% e ripetizione ridotta.
- Ciclo successivo +2% senza incremento riassorbito.

## Rischi e mitigazioni

- **Wave troppo aggressiva con step grandi:** è il minimo fisico per avere cinque carichi strettamente crescenti; il rebase usa la prestazione reale. L'anteprima rende il piano esplicito prima dell'uso.
- **Cambio setting a metà ciclo:** il piano memorizzato non viene ricalcolato automaticamente; lo step nuovo vale solo su rebase/ciclo successivo o su conferma esplicita dell'utente.
- **Array mancante o invalido:** fallback al bootstrap legacy; mai prescrivere `undefined`/`NaN`.
- **Concorrenza tra dispositivi:** mantenere il commit atomico; un eventuale `state_revision` ottimistico è raccomandato ma fuori scope di questo documento.
- **Residui legacy:** vecchie colonne e chiavi restano intenzionalmente; rimozione fisica solo dopo almeno una release stabile e audit dei record v1 rimasti.

## Decisioni funzionali lineare

### Validità della singola serie

Una serie lineare è valida soltanto quando soddisfa contemporaneamente tutti i requisiti:

```text
status = ok
actual reps >= target reps
actual load >= prescribed load
```

Il carico è confrontato al netto del bilanciere, come memorizzato nel dominio; il risultato è equivalente al confronto tra i due carichi totali perché il peso del bilanciere è costante. Fare le ripetizioni previste con un carico inferiore non rende valida la serie.

### Classificazione della seduta

Con `N` serie prescritte:

```text
required = ceil(N × 0.75)
```

Con la soglia fissa del 25%:

| Esito | Condizione | Prossimo carico | Contatore fallimenti |
|---|---|---|---|
| Successo completo | `validSets === N` | carico prescritto `+ 2 × effectiveStep` | azzerato |
| Successo tollerato | `required <= validSets < N` | carico prescritto `+ 1 × effectiveStep` | azzerato |
| Primo fallimento | `validSets < required` e contatore precedente 0 | invariato | portato a 1 |
| Secondo fallimento consecutivo | `validSets < required` e contatore precedente 1 | riduzione del 5% | azzerato |

Esattamente il 25% di serie non valide è tollerato; il fallimento scatta solo oltre il 25%. Di conseguenza, con tre serie prescritte una sola serie non valida rappresenta il 33,3% e non esiste il caso intermedio: servono tre serie valide.

### Quantizzazione della riduzione

Il `−5%` si applica al carico totale percepito dall'utente e deve produrre una riduzione reale di almeno uno step:

```text
rawReducedTotal = prescribedTotal × 0.95
reducedPlateLoad = min(
  prescribedPlateLoad - effectiveStep,
  floorToStep(rawReducedTotal - barWeight, effectiveStep)
)
reducedPlateLoad = max(0, reducedPlateLoad)
```

Gli aumenti non usano percentuali: aggiungono uno o due step direttamente al carico prescritto. Questo evita la crescita esponenziale del precedente `+10%` e rende il comportamento coerente con manubri, macchine e bilancieri con granularità diverse.

### Esempio

Con `4×8 @ 60 kg` e `effectiveStep = 2 kg`:

| Serie valide | Esito | Prossimo carico |
|---:|---|---:|
| 4/4 | successo completo | 64 kg |
| 3/4 | successo tollerato | 62 kg |
| 2/4, primo fallimento | mantenimento | 60 kg |
| 2/4, secondo fallimento consecutivo | riduzione del 5% quantizzata | 56 kg |

Una seduta non fallita interrompe sempre la consecutività. Il prossimo carico deriva dalla prescrizione corrente, non dal massimo peso eventualmente provato in una singola serie.

## File previsti

| File | Ruolo |
|---|---|
| `supabase/migrations/<timestamp>_progression_v2.sql` | colonne additive, update settings, RPC aggiornata |
| `src/lib/database.types.ts` | rigenerazione post-migration |
| `src/lib/domain/types.ts` | stato v2, settings e union risultati |
| `src/lib/domain/progression.ts` | piano wave, consolidamento, rebase, ciclo successivo |
| `src/lib/domain/progression.test.ts` | suite TDD completa |
| `src/lib/stores/exercises.svelte.ts` | mapping nuove colonne e bootstrap |
| `src/lib/stores/workouts.svelte.ts` | payload RPC con stato v2 |
| `src/lib/ui/ExerciseForm.svelte` | step chiarito + preview piano |
| `src/routes/workout/new/+page.svelte` | peso wave editabile + conferma neutra della serie eseguita |
| `src/routes/workout/summary/+page.svelte` | esito automatico, niente scelta manuale |
| `src/routes/impostazioni/+page.svelte` | rimozione hold/reset, incremento 2%, settings v2 |
