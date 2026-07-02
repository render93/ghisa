# Ghisa — Refactor a SvelteKit + Supabase

**Data:** 2026-05-28
**Stato:** Approvato in brainstorming, pronto per il piano di implementazione
**Autore:** Gerardo Greco (con Claude Code)

## Contesto

Ghisa è un diario di allenamento single-user, oggi implementato come singolo file `index.html` (~1685 righe, vanilla JS, persistenza via `window.storage` di Claude Artifacts). L'app funziona, ma:

- Il file singolo inizia a essere ingestibile.
- Si vogliono aggiungere feature (grafici di progressione, viste storiche più ricche, ecc.).
- La persistenza attuale è legata all'ambiente Claude Artifacts; serve una soluzione di storage indipendente che permetta sync trasparente tra cellulare e PC.

## Obiettivi

1. Riscrivere l'app come Single Page Application moderna, mantenendo l'attuale funzionalità.
2. Migrare la persistenza da `window.storage` a un backend cloud gratuito.
3. Abilitare sync trasparente tra dispositivi (cellulare + PC) per un singolo utente.
4. Predisporre l'app a crescere con nuove feature senza dover rifattorizzare di nuovo.
5. Deploy statico su GitHub Pages, build via GitHub Actions.

## Vincoli

- App sempre online (nessun requisito offline / PWA in questa fase).
- Single-user: solo l'autore deve poter accedere.
- Sync automatico (no export/import manuale).
- Login una tantum per dispositivo accettabile.
- Hosting deve essere statico e gratuito (GitHub Pages, eventualmente Azure Static Web Apps).
- Nessun layer server custom: solo frontend statico + BaaS.

## Out of scope

- Migrazione dei dati esistenti dal `localStorage` / `window.storage`: si parte da zero.
- Modalità offline e service worker.
- Multi-utente / condivisione schede tra utenti.
- Internazionalizzazione: l'app resta in italiano.
- Modifiche funzionali al motore di progressione: il comportamento di `wave` e `linear` deve rimanere identico.

## Decisioni tecniche

### Framework: SvelteKit 2 + Svelte 5 + TypeScript + Vite

**Rationale:**
- Bundle minimale (~10-20 KB runtime gzipped) — rilevante per uso mobile.
- Sintassi HTML-first: la transizione dalle attuali `renderXxx()` a componenti `.svelte` è quasi 1:1.
- Reattività esplicita con rune (`$state`, `$derived`) elimina il pattern attuale "muta stato → `render()` → `attachHandlers()`".
- File-based routing di SvelteKit mappa pulito sulle viste attuali, sostituendo il dispatcher `state.ui.view` con URL navigabili.
- `adapter-static` produce HTML+JS+CSS puri, perfetti per GitHub Pages.
- TypeScript fornisce la rete di sicurezza necessaria man mano che l'app cresce, in particolare sulla progression engine.

**Alternative valutate e scartate:**
- React + Vite: ecosistema più grande ma bundle più pesante e più boilerplate; overkill per single-user.
- Vanilla TS + ES modules: refactor minimo ma il pattern attuale "rebuild innerHTML" non scala con le feature pianificate.
- Blazor WebAssembly: runtime troppo pesante per uso mobile, prima paint lenta.

### Storage: Supabase (Postgres + Auth)

**Rationale:**
- Postgres relazionale fitta con il dominio (schede → days → exercises → workouts hanno foreign key naturali).
- Auth integrata con magic link / OAuth → flusso "login una tantum" richiesto.
- Free tier ampiamente sufficiente per single-user (500 MB DB, 5 GB bandwidth/mese, 50K MAU).
- Row Level Security permette di esporre la `anon key` nel bundle statico in sicurezza.
- Postgres è portabile: `pg_dump` → migrazione ad altro provider sempre possibile.

**Alternative valutate e scartate:**
- Firebase / Firestore: NoSQL forza denormalizzazione, lock-in più forte, modello dati meno naturale per Ghisa.
- Azure Cosmos DB: SDK più verbose, free tier in RU/s difficile da gestire mentalmente, legherebbe la scelta hosting ad Azure SWA.

**Limite noto:** il free tier di Supabase mette in pausa il progetto dopo 1 settimana di inattività. Mitigazione (non implementata in questa fase): GitHub Action schedulato settimanale che fa una richiesta `select 1` per tenere sveglio il progetto. Vedi "Future considerations".

### Hosting: GitHub Pages

**Rationale:**
- Setup zero, niente account Azure.
- Custom domain gratuito.
- L'unico vantaggio reale di Azure Static Web Apps sarebbe l'auth built-in, ma usiamo quella di Supabase.

## Modello dati

### Schema Postgres

Sei tabelle, una riga per entità tranne `actual_sets` e `prescribed` che restano JSONB perché nested e letti sempre insieme al loro entry padre.

```sql
-- Impostazioni utente: una riga per utente, tutto in JSONB
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Esercizi con stato di progressione
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scheme text not null check (scheme in ('wave','linear')),
  rest_seconds int not null default 180,
  -- wave fields
  wave_base_load numeric,
  wave_current_week int,
  wave_current_cycle int,
  cycle_failures int not null default 0,
  pending_deload boolean not null default false,
  -- linear fields
  linear_current_load numeric,
  linear_target_sets int,
  linear_target_reps int,
  linear_consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Schede di allenamento
create table schede (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Giorni dentro una scheda
create table scheda_days (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references schede(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  exercise_ids uuid[] not null default '{}'::uuid[]
);

-- Sedute registrate
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheda_id uuid references schede(id) on delete set null,
  day_id uuid references scheda_days(id) on delete set null,
  performed_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Una riga per esercizio dentro una seduta
create table workout_entries (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  position int not null,
  prescribed jsonb not null,
  actual_sets jsonb not null,
  user_action text,
  result_info jsonb,
  is_deload_session boolean not null default false
);

create index on workouts (user_id, performed_at desc);
create index on workout_entries (user_id, exercise_id);
```

### Note di design

- **`user_id` su ogni tabella** (anche su `workout_entries` e `scheda_days` che potrebbero derivarlo via join): ridondante per design, necessario perché RLS opera a livello di riga senza join.
- **`exercise_ids` come `uuid[]`** in `scheda_days`: tiene l'ordine senza tabella di join. Postgres non garantisce integrità referenziale sugli array — la pulizia è responsabilità dell'app (come oggi avviene con `exerciseUsedInSchede`).
- **`on delete restrict` su `workout_entries.exercise_id`**: lo storico è sacro. L'UI dovrà archiviare invece di cancellare esercizi con storico.
- **`actual_sets` JSONB**: letto sempre insieme all'entry, nessun caso d'uso per query sui singoli set in questa fase.

### Row Level Security

Una sola policy per tabella, identica per tutte le sei tabelle:

```sql
alter table exercises enable row level security;
create policy "user owns row" on exercises
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Senza JWT valido, `auth.uid()` è `null` e tutto viene bloccato.

## Auth

- **Signup disabilitato** dal dashboard Supabase (`Authentication → Providers → Email → Allow new users to sign up = OFF`).
- **Account utente creato manualmente** una volta dal dashboard (`Authentication → Users → Add user`).
- **Login con magic link via email**: l'utente inserisce email, riceve un link, clicca, è dentro. Niente password.
- **Sessione persistente**: supabase-js gestisce refresh token automatico, sessione resta attiva per settimane sui dispositivi.

### Difesa a strati

1. **Signup disabilitato** = lucchetto: nessun account creabile senza accesso al dashboard.
2. **RLS** = caveau: anche se un account venisse creato, vedrebbe solo le sue righe (zero righe).

### SMTP custom (obbligatorio)

Il servizio SMTP **built-in** di Supabase ha rate limit molto stretti (~3-4 email/ora) ed è esplicitamente "solo per development". Con il login esclusivamente via magic link, anche un singolo utente che fa qualche tentativo nella stessa ora si trova subito bloccato dal messaggio "Email rate limit exceeded".

**Soluzione:** configurare un SMTP custom nel dashboard Supabase. Provider scelto: **Resend** con dominio condiviso.

- Account Resend free (https://resend.com) → 100 email/giorno, 3000/mese.
- Mittente: `onboarding@resend.dev` (dominio condiviso di Resend, zero setup DNS).
- API key Resend usata come password SMTP in Supabase (`Project Settings → Authentication → SMTP Settings`, host `smtp.resend.com`, porta `465`, user `resend`).
- Sender name: `Ghisa`.
- "Minimum interval between emails" in Supabase: `60` secondi (protezione anti-spam personale).
- (Opzionale) `Authentication → Rate Limits` → "Rate limit for sending emails" → portare a `30` per ora.

**Trade-off del dominio condiviso:** la prima magic link potrebbe finire in Promozioni o Spam su Gmail/Outlook. Si risolve marcando "Non è spam" la prima volta; le successive arrivano in inbox normalmente.

**Alternative scartate:**
- *Gmail App Password*: tecnicamente più semplice, ma usare un Gmail personale come SMTP di sistema sporca la posta inviata personale e Google a volte bloccava login da "app insicure" senza preavviso.
- *Resend con dominio proprio*: setup DNS aggiuntivo non giustificato per un app single-user.

## Architettura frontend

### Struttura cartelle

```
ghisa/
├── package.json
├── vite.config.ts
├── svelte.config.js
├── tsconfig.json
├── .github/workflows/
│   └── deploy.yml
├── supabase/
│   ├── migrations/
│   │   └── 20260528000000_initial_schema.sql
│   └── config.toml
├── src/
│   ├── app.html
│   ├── lib/
│   │   ├── supabase.ts              # client + tipi generati
│   │   ├── stores/                  # store reattivi con runes
│   │   │   ├── auth.svelte.ts
│   │   │   ├── exercises.svelte.ts
│   │   │   ├── schede.svelte.ts
│   │   │   ├── workouts.svelte.ts
│   │   │   └── settings.svelte.ts
│   │   ├── domain/                  # logica pura, no UI, no Supabase
│   │   │   ├── progression.ts
│   │   │   ├── progression.test.ts
│   │   │   └── types.ts
│   │   └── ui/
│   │       ├── utils.ts             # fmtKg, fmtDate, fmtSec
│   │       └── icons.ts             # SVG inline
│   ├── routes/
│   │   ├── +layout.svelte           # tabbar, topbar, host modali
│   │   ├── +page.svelte             # home: lista schede
│   │   ├── login/+page.svelte
│   │   ├── schede/[id]/+page.svelte
│   │   ├── schede/[id]/days/[dayId]/+page.svelte
│   │   ├── workout/[id]/+page.svelte
│   │   ├── esercizi/+page.svelte
│   │   ├── esercizi/[id]/+page.svelte
│   │   ├── storico/+page.svelte
│   │   └── impostazioni/+page.svelte
│   └── styles/
│       └── globals.css
└── docs/superpowers/specs/
    └── 2026-05-28-ghisa-framework-storage-design.md
```

### Separazione dei concerns

- **`lib/domain/`** — Logica pura. La progression engine (`nextPrescription`, `applyEntryResult`, `weekWasFailed`, `entryStatus`) è qui dentro come funzioni pure. Zero dipendenze da Supabase, Svelte, DOM. Testata con Vitest.
- **`lib/stores/`** — Store reattivi (`$state` runes). Caricano da Supabase all'avvio, applicano mutazioni domain, scrivono su Supabase. Espongono lo stato corrente ai componenti.
- **`lib/ui/`** — Helper di formattazione e icone condivise.
- **`routes/`** — Componenti pagina. Leggono dagli store, emettono azioni. Dumb.

### Tipi generati

Dopo ogni modifica dello schema:

```bash
# <project-ref> = la stringa tipo "abcdefghijklmnop" letta da
# Supabase Dashboard → Project Settings → General → Reference ID
supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```

Il tipo `Database` esportato viene consumato da `createClient<Database>(...)` per type safety end-to-end: un disallineamento tra schema DB e codice TS rompe il build.

### Strategia di sync

**Optimistic write, no real-time subscription:**

1. Mutazione utente → aggiorno store locale immediatamente.
2. In background, scrivo su Supabase.
3. Se la write fallisce → toast errore + retry, store locale resta avanti finché il retry non succede.
4. All'avvio dell'app o al cambio device, fetch fresco di tutto lo stato.

Niente real-time subscription: overkill per single-user, fonte di complessità che non serve.

## Deploy

`.github/workflows/deploy.yml`:

1. Trigger: push su `main`.
2. Setup Node, `npm ci`.
3. `npm run build` con env vars iniettate da GitHub Actions secrets:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
4. Upload artifact da `build/`.
5. Deploy su GitHub Pages via `actions/deploy-pages@v4`.

Le secret `PUBLIC_*` sono pubbliche per design (sono nel bundle finale); RLS è il vero gate di sicurezza.

## Testing

- **Unit test** della progression engine con Vitest in `src/lib/domain/progression.test.ts`. La progression engine è la logica di cui un bug rompe il workout — copertura esplicita di tutti i casi:
  - `nextPrescription` per `wave` in settimana 1..5 con `cycle = 1, 2, 3` (verifica del moltiplicatore di ciclo).
  - `nextPrescription` per `wave` con `pendingDeload = true` (sets/reps/load scalati).
  - `nextPrescription` per `linear` (echo dei target).
  - `applyEntryResult` linear: tutti i set ok ai target → advance; un fail → repeat; due fail consecutivi → deload (azzera `linearConsecutiveFailures`).
  - `applyEntryResult` wave: settimana ok, no failure → `wave-advance-week`.
  - `applyEntryResult` wave: settimana con failure + `userAction = 'repeat'` → `wave-repeat-week`, `cycleFailures` incrementato.
  - `applyEntryResult` wave: fine ciclo (settimana 5+1) con `cycleFailures` sotto `cycleHoldThreshold` → `wave-cycle-end` normal, `waveCurrentCycle` incrementato.
  - `applyEntryResult` wave: fine ciclo con `cycleFailures >= cycleHoldThreshold` ma `< cycleResetThreshold` → `hold` (cycle non incrementato).
  - `applyEntryResult` wave: fine ciclo con `cycleFailures >= cycleResetThreshold` → `reset`, `waveBaseLoad` ridotto di `cycleResetPct`.
  - `applyEntryResult` wave: fine ciclo che attiva deload (cycle multiplo di `deloadEveryNCycles`) → `pendingDeload = true`.
  - `applyEntryResult` wave: completamento di una deload session → `deload-completed`, `pendingDeload = false`.
  - `weekWasFailed`: rileva fail per status 'fail' e per reps sotto target.
  - `entryStatus`: ok / partial / fail in base al numero di set completati ai reps target.
- **No E2E test in questa fase**. Smoke manuale post-deploy.
- **Type check** (`svelte-check`) in CI prima del build.

## Evoluzione dello schema

In questa fase iniziale lo schema cambierà con le nuove feature. Tutte le modifiche passano da:

1. Nuovo file in `supabase/migrations/<timestamp>_<descrizione>.sql`. Il timestamp può essere generato con `supabase migration new <descrizione>` oppure scritto a mano nel formato `YYYYMMDDHHMMSS`.
2. Applicato al progetto Supabase. Due modi accettati:
   - **Via dashboard**: incollare l'SQL nell'SQL Editor ed eseguirlo. Più rapido in questa fase iniziale, accettabile fino a quando le migration sono poche.
   - **Via CLI**: `supabase db push` (richiede `supabase link --project-ref <ref>` una volta).
3. Rigenerati i tipi TS (`supabase gen types`) e committati insieme al file di migration.

Nessuna modifica "ad hoc" dello schema senza file di migration committato — la dashboard accetta SQL ma il file `.sql` nel repo è la fonte di verità.

## Future considerations

Da NON implementare in questa fase ma da ricordare:

1. **Keep-alive del DB Supabase** — il free tier mette in pausa il progetto dopo 1 settimana di inattività, con ~30s di latenza al risveglio. Soluzione: GitHub Action schedulato (cron settimanale) che fa una richiesta a Supabase. Da aggiungere se mai notiamo il problema in uso reale.
2. **PWA installabile** — `manifest.json` + icone per "Aggiungi a schermata Home". Niente service worker (non serve, l'app è always-online). Quick win quando le feature core sono stabili.
3. **Grafici di progressione** — vista "esercizio nel tempo" con libreria chart leggera (es. uplot, ~40 KB). La struttura `workout_entries` separata è progettata per questo.
4. **Export JSON** — bottone "scarica backup" come safety net psicologico.
5. **Archiviazione esercizi** — UI per "archiviare" invece di cancellare esercizi con storico (sono protetti da `on delete restrict`).

## Criteri di successo

- L'app è raggiungibile a un URL GitHub Pages.
- Login con magic link funziona da cellulare e PC.
- Le funzionalità attuali (creare scheda, aggiungere giorni, aggiungere esercizi, registrare seduta, vedere storico, modificare impostazioni) sono replicate 1:1.
- Una seduta registrata sul cellulare appare sul PC al refresh dell'app.
- Il bundle iniziale è sotto i 100 KB gzipped.
- I test unitari della progression engine coprono i casi descritti in "Testing" e passano in CI.
- Build e deploy automatici al push su `main`.

## Domande aperte

Nessuna al momento. Tutto risolto in brainstorming.

## Stato implementazione

**2026-07-02 — Completato integralmente e in produzione.**

Il design descritto in questo documento è stato implementato per intero: SPA SvelteKit statica su GitHub Pages, persistenza + auth Supabase con RLS `auth.uid() = user_id` su tutte le tabelle, store a rune, motore di progressione wave + lineare testato. Riferimento autorevole per lo stato attuale: la storia di `main` e `CLAUDE.md`. Questa sezione chiude il Task 48 (mai eseguito) del plan associato.
