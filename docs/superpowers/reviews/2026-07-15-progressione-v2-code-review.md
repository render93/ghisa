# Code review — Progressione v2 (wave adattiva + revisione lineare)

> **Branch:** `feature/progression-v2` · **Data:** 2026-07-15
> **Scope:** working tree di `feature/progression-v2` (allineato a `main`; tutto il lavoro v2 è non committato)
> **Riferimenti:** `docs/superpowers/plans/2026-07-15-progressione-v2.md`, `docs/superpowers/specs/2026-07-15-progressione-v2-design.md`
> **Tipo:** review a sola lettura — nessun commit, merge o push.

---

## Verdetto

Implementazione **solida e aderente alla spec**. Nessun bug di correttezza che produca risultati sbagliati nel flusso normale. Le finding sono robustezza, dead-code e fedeltà dello storico.

| Controllo | Esito |
|---|---|
| `npm test` | ✅ **167/167** verdi |
| `npm run check` | ✅ **0 errori** (9 warning Svelte in `ExerciseForm`, **preesistenti** al diff) |
| Bug di correttezza in flusso normale | ✅ nessuno |

---

## Conformità ai documenti

Verificata riga per riga contro spec e plan.

| Requisito | Stato | Note |
|---|---|---|
| Piano wave caricabile a 5 pesi (`buildWavePlan`) | ✅ | valori identici alle tabelle spec sui 4 esercizi reali |
| Ciclo successivo **+2% sul totale**, `ceilToStep` + monotonia | ✅ | `nextWaveCyclePlan` verificata su T-bar/manubri/squat/stacco |
| Carico consolidato = `validLoadsDescending[required-1]`, `required = ceil(N×0.75)` | ✅ | esclude reps sotto target e serie `fail` |
| advance / rebase-advance (su e giù) / repeat-reduced | ✅ | traslazione corrente+future, settimane svolte non riscritte |
| Lineare v2: +2 / +1 step, hold, −5% quantizzato al 2° fallimento consecutivo | ✅ | validità serie su status + reps + carico prescritto |
| Tolleranza 25% fissa nel dominio, non configurabile | ✅ | nessun `progressionFailurePct`; controlli hold/reset rimossi dalla UI |
| Bootstrap lazy v1→v2 che preserva la prossima prescrizione normale | ✅ | cutover lineare azzera il contatore fallimenti |
| Commit atomico con `progression_version` + `wave_cycle_loads` | ✅ | `domainToDb` → RPC → `applyLocal` senza round-trip extra |
| Trigger deload a fine ciclo (`completedCycle % N === 0`) | ✅ | identico alla logica legacy, nessuna regressione |
| Storico legacy preservato (union `ProgressionResult` intatta) | ✅ | migration additiva, nessun `DROP` |

---

## Findings

Ordinate per severità. Nessuna è un crash live in flusso normale: sono latenti / pulizia / fedeltà storico.

### 🟠 1 — Robustezza · `throw` sul percorso di render del riepilogo
**File:** `src/lib/domain/progression.ts:357` (invocata da `src/routes/workout/summary/+page.svelte:93`)

`resolveWaveV2Outcome` lancia `RangeError` su mismatch di settimana o piano non valido, ma è chiamata da un `{@const}` durante il render del riepilogo.

- **Rischio:** se `entry.prescribed.week !== exercise.waveCurrentWeek` (riga DB corrotta, edit manuale, o un futuro off-by-one) oppure `waveBaseLoad` non finito/negativo che fa lanciare `buildWavePlan`, l'eccezione propaga durante il render → **l'intera pagina Riepilogo non si renderizza → l'utente non può salvare la seduta** (perdita dati).
- **Fix consigliato:** far degradare `progressionPreview()` a `null` invece di propagare l'eccezione (try/catch o guardia non-throwing sul percorso di render).

### 🟡 2 — Correttezza (latente) · `predominantAttemptedLoad` non fa lo slice
**File:** `src/lib/domain/progression.ts:339`

Itera su tutto `entry.actualSets` senza `slice(0, entry.prescribed.sets)`, a differenza di `validLoads` (riga 363) che invece taglia.

- **Rischio:** con più serie loggate di `prescribed.sets` (il test *"ignores actual sets beyond the prescribed set count"* costruisce esattamente questo: 6 serie per 4 prescritte), il `reducedLoad` può essere calcolato da carichi già esclusi dallo slice dei validi.
- **Stato:** inerte oggi (il draft crea sempre esattamente `prescribed.sets` serie), ma divergenza latente.
- **Fix consigliato:** applicare lo stesso `slice(0, entry.prescribed.sets)` anche qui.

### 🟡 3 — Dead code · classificatore lineare legacy
**File:** `src/lib/domain/progression.ts:114`

`resolveLinearOutcome` + tipo `LinearOutcome` (106) + `effectiveIncrementSteps` (52, usata solo lì dentro) non hanno più chiamanti di produzione: `applyEntryResult` converte sempre a v2 e usa `resolveLinearV2Outcome`. Referenziati solo dai loro test.

- **Nota:** decodificare `result_info` storico **non** richiede il classificatore (basta la union `ProgressionResult`). ~35 righe di engine da tenere in lock-step senza beneficio a runtime.

### 🟡 4 — Dead code · `weekWasFailed`
**File:** `src/lib/domain/progression.ts:405`

Esportata ma zero chiamanti di produzione (solo il suo test). Sembra logica di progressione viva ma è orfana → trappola di manutenzione.

### 🟡 5 — Dead code · rami legacy nel riepilogo
**File:** `src/routes/workout/summary/+page.svelte:130`

I rami `info?.kind === 'wave-advance-week'` (130) e `'wave-cycle-end'` (132) sono irraggiungibili: `applyEntryResult` produce solo esiti `wave-v2-*` / `linear-v2-*` / `deload-completed` / `noop`. La copy "Progressione legacy" è morta e fuorviante.

### 🟢 6 — Fedeltà storico · rebase a W5 non tracciato
**File:** `src/lib/domain/progression.ts:466`

Su un rebase-advance in W5, lo snapshot `wave-v2-cycle-end` registra `oldPlan` **pre-rebase** mentre `nextPlan` è post-rebase +2%: la entry storica nasconde che a fine ciclo è avvenuto un rebase (il percorso non-W5 lo espone con `wave-v2-rebase-advance`).

### 🟢 7 — Robustezza · nessun clamp su `waveCycleLoads[week-1]`
**File:** `src/lib/domain/progression.ts:290`

`nextPrescription` legge `waveCycleLoads[week - 1]` senza bounds check: un `waveCurrentWeek` fuori 1..5 dà `load: undefined` → prescrizione `NaN`. Gap difensivo (non accade nel flusso attuale, ma manca la guardia `isFinite` che invece protegge l'array via `isWavePlan`).

### 🟢 8 — Da confermare (probabilmente voluto) · deload post-cutover `floorToStep`
**File:** `src/lib/domain/progression.ts:295`

Il deload v2 usa `floorToStep`, il legacy usava `roundTo`. Un esercizio v1 in `pendingDeload` al momento del cutover può ricevere un primo deload leggermente più basso di quanto avrebbe fatto v1 (es. valore 91.25, step 2.5: legacy → 92.5, v2 → 90). Coerente con lo spec ("arrotondamento verso il basso") → **da confermare come intenzionale**, non come mancata preservazione.

---

## Priorità operative

1. Valutare la **#1** (l'unica con impatto potenziale su salvataggio seduta).
2. Pulizia sicura: **#3, #4, #5** (mantenere però la union `ProgressionResult` legacy per tipare lo storico).
3. **#8**: solo una conferma di intenzionalità.

---

## Gate ancora aperto (non codice)

Coerente con lo *Stato esecuzione* del plan — **Task 4 e 11 non chiusi**:

- ⛔ Migration `supabase/migrations/20260715000000_progression_v2.sql` **non ancora applicata su Supabase**.
- ⛔ Verifica runtime sui dati reali **pendente**.

Come da `CLAUDE.md`: il codice che scrive le nuove colonne **non deve andare in produzione prima** dell'applicazione SQL + `npx supabase gen types` di rigenerazione dei tipi.
