# Bug noto — Disaccoppiamento incremento/arrotondamento nel lineare

Data: 2026-06-03
Stato: **RISOLTO** (2026-06-03) — implementata l'opzione C; vedi `2026-06-03-linear-increment-steps-design.md` e il plan `docs/superpowers/plans/2026-06-03-linear-increment-steps.md`. L'incremento lineare è ora "N passi dello step di arrotondamento" (default 1, override per-esercizio): il blocco è impossibile per costruzione.
Emerso durante: collaudo della Milestone B (arrotondamento ibrido)
Impatto: **medio-alto** (un esercizio lineare può smettere di progredire in silenzio)
Indipendenza: **non blocca la Milestone A** (il salto non tocca il motore di progressione)

## Sintesi

Dopo la Milestone B l'**arrotondamento dischi** è configurabile per-schema e con override per-esercizio, ma l'**incremento lineare** (`linearIncrementKg`) è rimasto un **unico valore globale**. Questi due parametri sono in realtà due metà della stessa grandezza fisica — "il peso minimo che riesci ad aggiungere" — e averli disaccoppiati produce due malfunzionamenti:

1. **Progressione bloccata** quando `step di arrotondamento > incremento`: un avanzamento calcolato viene arrotondato all'indietro sul carico di partenza. L'esercizio non sale **mai**, pur completando tutte le serie.
2. **Incremento inadatto** ai pesi leggeri quando l'unico incremento globale è troppo grosso (es. alzate laterali a cui vorresti aggiungere +1 kg, ma il globale è +2).

In più, quando scatta il caso (1), `applyEntryResult` registra comunque `result_info = { kind: "linear-advance", newLoad: <invariato> }` — un "avanzamento" che non avanza: **fuorviante**.

## Riproduzione reale (dal collaudo)

Esercizio **Hip thrust** (scheme `linear`):
- `linear_current_load = 40`
- `plate_rounding = 5` (override per-esercizio impostato in Milestone B)
- `linearIncrementKg` globale: < 2,5 (dedotto dal risultato; verosimilmente 2)

Seduta eseguita: 4×8 @ 40 kg, tutti i set `status: "ok"`, reps 8 (≥ target). Quindi `applyEntryResult` entra nel ramo "all completed → advance".

Calcolo eseguito dal motore:
```
newLoad = roundTo(linear_current_load + linearIncrementKg, effectiveRounding(ex, settings))
        = roundTo(40 + 2, 5)            // effectiveRounding = ex.plateRounding = 5
        = Math.round(42 / 5) * 5
        = Math.round(8.4) * 5
        = 8 * 5
        = 40                            // ← invariato
```

`result_info` salvato per quella entry:
```json
{ "kind": "linear-advance", "newLoad": 40 }
```

Risultato osservato: completata la seduta, al giro successivo la prescrizione è di nuovo **4×8 @ 40 kg**. Bloccata all'infinito finché la coppia (step, incremento) resta così.

### Esercizi attualmente a rischio nel DB dell'utente
- **Hip thrust** — `plate_rounding = 5` → bloccato (caso 1).
- **Lat machine presa larga** — `plate_rounding = 5` → bloccato uguale se l'incremento è < 2,5.
- **Leg curl prono** — `plate_rounding = 2.5` → ok finché incremento > 1,25.
- **Alzate laterali** — `plate_rounding = 1` → avanza, ma con incremento globale 2 sale di +2: probabilmente più di quanto vorresti su un esercizio così leggero (caso 2).

## Causa radice

`effectiveRounding(ex, settings)` (in `src/lib/domain/progression.ts`) determina la griglia su cui il carico può atterrare. `applyEntryResult` calcola `vecchio + incremento` e poi lo arrotonda a quella griglia. Se l'incremento è **inferiore a metà dello step**, l'arrotondamento al multiplo più vicino lo riporta sul valore di partenza.

Regola generale:
- per **avanzare sempre** serve `incremento ≥ step` (idealmente `incremento` multiplo di `step`);
- con `step/2 ≤ incremento < step` si avanza ma "a scatti di step" (overshoot);
- con `incremento < step/2` si resta **bloccati**.

La Milestone B ha reso lo `step` per-esercizio ma ha lasciato l'incremento globale, rompendo l'accoppiamento. Inoltre **nulla in UI o nel motore impedisce** di configurare `step > incremento`.

> Nota collaterale: il **wave** usa una percentuale (`waveCycleIncrementPct`) sul carico base e poi arrotonda. In teoria ha lo stesso rischio di "swallow" a carichi base molto bassi, ma è pensato per i fondamentali pesanti → rischio basso. Il problema acuto è sul **lineare**.

## Opzioni di fix (da decidere in brainstorming — NON ancora implementate)

**A) Override per-esercizio anche dell'incremento (in kg)**
Simmetrico all'override di arrotondamento già esistente; default = valore globale.
- ✅ Prevedibile, rispecchia i dischi reali, modello mentale semplice, intervento minimo.
- ❌ Due campi da tenere coerenti a mano; di per sé non impedisce `step > incremento` (servirebbe una validazione).

**B) Incremento percentuale (es. % del carico corrente)**
- ✅ Si auto-scala con il carico; niente config per-esercizio.
- ❌ **Sui pesi bassi peggiora il blocco** (alzate laterali 6 kg × 2,5% = 0,15 kg → arrotondato a 0). Poco prevedibile e concettualmente estraneo al lineare (che *è* un passo assoluto fisso). **Sconsigliata per il lineare.**

**C) Incremento espresso come "N passi di arrotondamento" (default 1)** ← più robusta
`newLoad = vecchio + N × step`, già allineato alla griglia.
- ✅ Il bug **sparisce per costruzione** (l'incremento è sempre multiplo dello step, non arrotondabile all'indietro), sia sui pesanti sia sui leggeri. Un solo parametro fisico per-esercizio (lo step) + un opzionale "quanti passi".
- ❌ Riformula il concetto di "incremento in kg" e la UI delle impostazioni; modello leggermente diverso da spiegare.

**Trasversale a tutte:** correggere anche il `result_info` fuorviante — un avanzamento che non muove il carico non dovrebbe essere etichettato `linear-advance` (es. emettere un `linear-repeat`/`noop` o un nuovo esito esplicito, e/o avvisare l'utente).

### Raccomandazione
Scartare **B** per il lineare. Tra **A** (minimo, simmetrico, + validazione `step ≤ incremento`) e **C** (elimina il footgun per costruzione). C è la più solida; A la più rapida.

## Workaround immediato (solo configurazione, nessun codice)

Per gli esercizi bloccati, rendere coerente la coppia (step, incremento) dal form esercizio / Impostazioni:
- **Hip thrust / Lat machine**: o incremento 2,5 + arrotondamento 2,5 (`40 → 42,5 → 45…`), o incremento 5 + arrotondamento 5 (`40 → 45 → 50…`). In generale: `step ≤ incremento`.
- In attesa del fix, evitare di impostare un override di arrotondamento più grande dell'incremento lineare.

## File coinvolti (per il futuro intervento)
- `src/lib/domain/types.ts` — `Settings.linearIncrementKg`, eventuale nuovo campo su `Exercise`.
- `src/lib/domain/progression.ts` — `applyEntryResult` ramo lineare (calcolo + `result_info`), `effectiveRounding`.
- `src/lib/domain/progression.test.ts` — casi di blocco/overshoot.
- `src/lib/ui/ExerciseForm.svelte` + `src/routes/impostazioni/+page.svelte` — eventuali nuovi campi / validazione.
- Se si aggiunge un campo su `exercises`: nuova migration + `database.types.ts`.
