# Ghisa — Refactor a SvelteKit + Supabase: Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riscrivere l'app `index.html` come SPA SvelteKit (TypeScript + Vite + adapter-static) con persistenza su Supabase, mantenendo la funzionalità attuale 1:1 e abilitando sync trasparente tra dispositivi per un singolo utente, con deploy automatico su GitHub Pages.

**Architecture:** Frontend SvelteKit statico ↔ Supabase (Postgres + Auth) via `@supabase/supabase-js`. Logica di progressione come funzioni pure TS testate con Vitest; store reattivi con Svelte 5 runes che fanno optimistic write su Supabase. Row Level Security per single-tenant.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, Vite, `@supabase/supabase-js`, Vitest, GitHub Actions, GitHub Pages, Supabase (Postgres + Auth).

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md`
- App attuale: `index.html` (~1685 righe). Quando il piano cita righe di `index.html`, sono il punto di riferimento per il comportamento da preservare.
- `CLAUDE.md` alla radice del repo descrive la situazione "as-is".

---

## Pre-flight (manuale, una sola volta, prima di iniziare il codice)

Queste cose le fa l'**utente** dal dashboard. Non sono task automatizzabili dall'agent. L'agent deve verificare di averle prima di partire con la Milestone 2.

- [ ] **P1.** L'utente crea un account Supabase (free tier) su https://supabase.com.
- [ ] **P2.** L'utente crea un nuovo progetto Supabase. Annota:
  - **Project URL** (formato `https://<ref>.supabase.co`).
  - **`anon` public key** (Dashboard → Project Settings → API → "Project API keys" → `anon` / `public`).
  - **Project Reference ID** (Dashboard → Project Settings → General → Reference ID).
- [ ] **P3.** L'utente disabilita signup: Dashboard → Authentication → Providers → Email → toggle "Enable Email provider" ON, "Confirm email" può restare ON, "Allow new users to sign up" OFF.
- [ ] **P4.** L'utente crea il proprio account: Dashboard → Authentication → Users → "Add user" → "Create new user" → inserisce la propria email (es. `gerardo.greco@blexin.com`) + password temporanea + spunta "Auto Confirm User". L'account ora esiste; il login avverrà via magic link.
- [ ] **P5.** L'utente installa la Supabase CLI in locale (opzionale, ma utile): `brew install supabase/tap/supabase`.
- [ ] **P6.** L'utente crea un repository GitHub vuoto (es. `render93/ghisa`) e lo collega al working directory locale come `origin` (se non già fatto). GitHub Pages verrà abilitato più avanti come parte del deploy.

---

## Milestone 1 — Scaffolding SvelteKit (Tasks 1-5)

Imposta il progetto SvelteKit base con TS, Vite, adapter-static, Vitest e una struttura cartelle che rispetta la spec. Niente codice applicativo ancora.

### Task 1: Initialize SvelteKit project

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `src/app.html`, `src/app.d.ts`, `src/routes/+page.svelte`

- [ ] **Step 1:** Verifica versione Node (richiede ≥ 20):

  Run: `node --version`
  Expected: `v20.x.x` o superiore. Se inferiore, l'utente deve aggiornare prima di proseguire.

- [ ] **Step 2:** Crea il progetto SvelteKit via CLI ufficiale. Esegui dal working directory:

  Run: `npx sv@latest create . --template minimal --types ts --no-add-ons`
  Expected: prompt interattivo concluso, file generati. Se il working directory non è vuoto, lo strumento chiede conferma — rispondi "yes" per procedere.

  **Nota:** se `sv` non funziona o è cambiata interfaccia, usa il fallback: `npm create svelte@latest .` con risposte: template `Skeleton project`, type checking `TypeScript`, no Prettier/ESLint/Playwright/Vitest (Vitest lo aggiungiamo dopo manualmente).

- [ ] **Step 3:** Installa dipendenze:

  Run: `npm install`
  Expected: `node_modules/` creato, nessun errore.

- [ ] **Step 4:** Verifica dev server gira:

  Run: `npm run dev`
  Expected: server avviato su `http://localhost:5173`, pagina di default visibile. Stoppa con Ctrl+C.

- [ ] **Step 5:** Commit:

  ```bash
  git add -A
  git commit -m "feat: scaffold SvelteKit project"
  ```

### Task 2: Configure adapter-static for SPA mode

**Files:**
- Modify: `svelte.config.js`
- Create: `src/routes/+layout.ts`

- [ ] **Step 1:** Installa `@sveltejs/adapter-static`:

  Run: `npm install -D @sveltejs/adapter-static`
  Expected: pacchetto aggiunto a `devDependencies` di `package.json`.

- [ ] **Step 2:** Sostituisci il contenuto di `svelte.config.js`:

  ```javascript
  import adapter from '@sveltejs/adapter-static';
  import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

  /** @type {import('@sveltejs/kit').Config} */
  const config = {
    preprocess: vitePreprocess(),
    kit: {
      adapter: adapter({
        pages: 'build',
        assets: 'build',
        fallback: 'index.html',
        precompress: false,
        strict: true
      }),
      paths: {
        // base path per GitHub Pages: vuoto in dev, /<repo> in prod.
        // Configurato come env per evitare hardcoding del nome repo.
        base: process.env.BASE_PATH || ''
      }
    }
  };

  export default config;
  ```

- [ ] **Step 3:** Crea `src/routes/+layout.ts` per disabilitare SSR (siamo SPA puro):

  ```typescript
  export const ssr = false;
  export const prerender = false;
  export const trailingSlash = 'always';
  ```

- [ ] **Step 4:** Verifica build produce output statico:

  Run: `npm run build`
  Expected: directory `build/` creata con `index.html` + asset. Nessun errore.

- [ ] **Step 5:** Commit:

  ```bash
  git add svelte.config.js src/routes/+layout.ts package.json package-lock.json
  git commit -m "feat: configure adapter-static for SPA mode"
  ```

### Task 3: Set up Vitest

**Files:**
- Modify: `package.json`, `vite.config.ts`

- [ ] **Step 1:** Installa Vitest + jsdom (necessario per testare future utility legate al DOM, se servono):

  Run: `npm install -D vitest @vitest/ui jsdom`
  Expected: pacchetti aggiunti.

- [ ] **Step 2:** Aggiorna `vite.config.ts` per esporre la config Vitest. Sostituisci il contenuto con:

  ```typescript
  import { sveltekit } from '@sveltejs/kit/vite';
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    plugins: [sveltekit()],
    test: {
      include: ['src/**/*.{test,spec}.{js,ts}'],
      environment: 'node'
    }
  });
  ```

- [ ] **Step 3:** Aggiungi script `test` in `package.json` nel blocco `"scripts"`:

  ```json
  "test": "vitest run",
  "test:watch": "vitest"
  ```

- [ ] **Step 4:** Verifica Vitest gira (senza test ancora, deve dire "no tests found"):

  Run: `npm test`
  Expected: exit code 0 con messaggio "No test files found".

- [ ] **Step 5:** Commit:

  ```bash
  git add package.json package-lock.json vite.config.ts
  git commit -m "feat: add Vitest setup"
  ```

### Task 4: Create directory structure & placeholder files

**Files:**
- Create: `src/lib/domain/.gitkeep`, `src/lib/stores/.gitkeep`, `src/lib/ui/.gitkeep`, `src/styles/.gitkeep`, `supabase/migrations/.gitkeep`

- [ ] **Step 1:** Crea le directory previste dalla spec:

  Run: `mkdir -p src/lib/domain src/lib/stores src/lib/ui src/styles supabase/migrations`
  Expected: directory create.

- [ ] **Step 2:** Aggiungi `.gitkeep` in ciascuna per committarle vuote:

  Run: `touch src/lib/domain/.gitkeep src/lib/stores/.gitkeep src/lib/ui/.gitkeep src/styles/.gitkeep supabase/migrations/.gitkeep`
  Expected: file vuoti creati.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/lib supabase
  git commit -m "feat: create directory structure"
  ```

### Task 5: Verify clean baseline

- [ ] **Step 1:** Run dev server e check tutto parte:

  Run: `npm run dev`
  Expected: server su `http://localhost:5173`, pagina default carica. Stoppa.

- [ ] **Step 2:** Run build:

  Run: `npm run build`
  Expected: `build/` aggiornata, no errori.

- [ ] **Step 3:** Run test:

  Run: `npm test`
  Expected: exit 0 (nessun test ancora).

  Niente da committare; questa task è solo verifica.

---

## Milestone 2 — Setup Supabase: schema + RLS (Tasks 6-9)

Crea le tabelle e le policy. L'utente esegue manualmente l'SQL via dashboard; l'agent verifica generando i tipi TS.

### Task 6: Write initial migration SQL

**Files:**
- Create: `supabase/migrations/20260528000000_initial_schema.sql`

- [ ] **Step 1:** Crea il file con esattamente questo contenuto:

  ```sql
  -- Ghisa initial schema
  -- 2026-05-28

  -- Settings: una riga per utente, tutto in JSONB
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
    wave_base_load numeric,
    wave_current_week int,
    wave_current_cycle int,
    cycle_failures int not null default 0,
    pending_deload boolean not null default false,
    linear_current_load numeric,
    linear_target_sets int,
    linear_target_reps int,
    linear_consecutive_failures int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Schede
  create table schede (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    position int not null default 0,
    created_at timestamptz not null default now()
  );

  -- Giorni
  create table scheda_days (
    id uuid primary key default gen_random_uuid(),
    scheda_id uuid not null references schede(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    position int not null default 0,
    exercise_ids uuid[] not null default '{}'::uuid[]
  );

  -- Sedute
  create table workouts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    scheda_id uuid references schede(id) on delete set null,
    day_id uuid references scheda_days(id) on delete set null,
    performed_at timestamptz not null,
    created_at timestamptz not null default now()
  );

  -- Entries
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

  -- Indici
  create index on workouts (user_id, performed_at desc);
  create index on workout_entries (user_id, exercise_id);

  -- Row Level Security
  alter table user_settings enable row level security;
  alter table exercises enable row level security;
  alter table schede enable row level security;
  alter table scheda_days enable row level security;
  alter table workouts enable row level security;
  alter table workout_entries enable row level security;

  create policy "user owns row" on user_settings
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "user owns row" on exercises
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "user owns row" on schede
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "user owns row" on scheda_days
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "user owns row" on workouts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "user owns row" on workout_entries
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add supabase/migrations/20260528000000_initial_schema.sql
  git commit -m "feat: initial Supabase schema migration"
  ```

### Task 7: Apply migration to Supabase project (manual)

**Files:** none

- [ ] **Step 1:** L'utente apre Supabase Dashboard → SQL Editor → "New query".

- [ ] **Step 2:** Copia-incolla il contenuto di `supabase/migrations/20260528000000_initial_schema.sql` nell'editor.

- [ ] **Step 3:** Clicca "Run". Expected: "Success. No rows returned." Tutte le tabelle, indici e policy create.

- [ ] **Step 4:** Verifica nel Table Editor del dashboard: 6 tabelle visibili (`user_settings`, `exercises`, `schede`, `scheda_days`, `workouts`, `workout_entries`), tutte con icona "RLS enabled".

  Niente da committare; verifica manuale.

### Task 8: Generate TypeScript types from Supabase schema

**Files:**
- Create: `src/lib/database.types.ts`

- [ ] **Step 1:** L'utente verifica di avere la Supabase CLI installata e si logga (una sola volta):

  Run: `supabase login`
  Expected: apre browser, conferma login.

- [ ] **Step 2:** Genera i tipi (sostituisci `<project-ref>` con il Reference ID annotato in P2):

  Run: `npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts`
  Expected: file creato con type definitions per le 6 tabelle.

- [ ] **Step 3:** Verifica che il file contenga tipi sensati. Apri e controlla che ci sia almeno `export type Database = {` e che le tabelle elencate corrispondano alle 6 create.

- [ ] **Step 4:** Commit:

  ```bash
  git add src/lib/database.types.ts
  git commit -m "feat: generate Supabase TypeScript types"
  ```

### Task 9: Verify RLS denies anonymous access (manual sanity check)

**Files:** none

- [ ] **Step 1:** Dal Dashboard → SQL Editor, esegui questa query come "anonymous":

  ```sql
  select * from exercises;
  ```

  Expected: ritorna 0 righe (vuoto è OK perché non c'è niente; ma anche con dati ritornerebbe 0 perché senza JWT `auth.uid()` è null).

- [ ] **Step 2:** Conferma: nel pannello a destra dello SQL Editor c'è un selettore "Run as". Selezionando un user authenticated → la stessa query restituirebbe le sue righe. Senza autenticazione → 0.

  Niente da committare; verifica manuale che le RLS funzionino.

---

## Milestone 3 — Domain engine: porting + test (Tasks 10-15)

Porta la progression engine da `index.html` (lines 411-505) a `src/lib/domain/progression.ts` come **funzioni pure**: niente mutazione in-place, niente accesso a `state` globale, ogni settings/exercise/entry passato come argomento. TDD strict: test prima, implementazione dopo.

### Task 10: Define domain types

**Files:**
- Create: `src/lib/domain/types.ts`

- [ ] **Step 1:** Crea `src/lib/domain/types.ts` con:

  ```typescript
  export type Scheme = 'wave' | 'linear';

  export type Settings = {
    defaultRestSec: number;
    weightUnit: 'kg' | 'lb';
    waveCycleIncrementPct: number;
    linearIncrementKg: number;
    linearResetPct: number;
    plateRounding: number;
    notificationsEnabled: boolean;
    cycleHoldThreshold: number;
    cycleResetThreshold: number;
    cycleResetPct: number;
    deloadEveryNCycles: number;
    deloadLoadPct: number;
    deloadSetsMult: number;
    deloadRepsMult: number;
  };

  export type Exercise = {
    id: string;
    name: string;
    scheme: Scheme;
    restSeconds: number;
    // wave
    waveBaseLoad?: number;
    waveCurrentWeek?: number;
    waveCurrentCycle?: number;
    cycleFailures?: number;
    pendingDeload?: boolean;
    // linear
    linearCurrentLoad?: number;
    linearTargetSets?: number;
    linearTargetReps?: number;
    linearConsecutiveFailures?: number;
  };

  export type Prescription = {
    sets: number;
    reps: number;
    load: number;
    week?: number;
    cycle?: number;
    isDeload?: boolean;
    consecutiveFails?: number;
  };

  export type SetStatus = 'ok' | 'fail' | null;

  export type ActualSet = {
    status: SetStatus;
    reps: number;
    load: number;
    ts?: string;
  };

  export type Entry = {
    prescribed: Prescription;
    actualSets: ActualSet[];
    isDeloadSession?: boolean;
  };

  export type UserAction = 'repeat' | null;

  export type ProgressionResult =
    | { kind: 'noop' }
    | { kind: 'linear-advance'; newLoad: number }
    | { kind: 'linear-repeat' }
    | { kind: 'linear-deload'; newLoad: number }
    | { kind: 'wave-advance-week'; failed: boolean; week: number; cycleFailures: number }
    | { kind: 'wave-repeat-week'; cycleFailures: number }
    | { kind: 'wave-cycle-end';
        adjustmentKind: 'normal' | 'hold' | 'reset';
        fails: number;
        completedCycle: number;
        oldBase: number;
        newBase: number;
        pendingDeload: boolean;
        nextCycle: number;
      }
    | { kind: 'deload-completed' };

  export type EntryStatus =
    | { kind: 'ok'; text: string }
    | { kind: 'fail'; text: string }
    | { kind: 'partial'; text: string };

  export const WAVE_PATTERN = [
    { sets: 3, reps: 8, mult: 1.0 },
    { sets: 4, reps: 6, mult: 1.05 },
    { sets: 5, reps: 5, mult: 1.1 },
    { sets: 6, reps: 4, mult: 1.15 },
    { sets: 8, reps: 3, mult: 1.2 }
  ] as const;

  export const DEFAULT_SETTINGS: Settings = {
    defaultRestSec: 180,
    weightUnit: 'kg',
    waveCycleIncrementPct: 2.5,
    linearIncrementKg: 2.5,
    linearResetPct: 10,
    plateRounding: 2.5,
    notificationsEnabled: false,
    cycleHoldThreshold: 2,
    cycleResetThreshold: 3,
    cycleResetPct: 5,
    deloadEveryNCycles: 3,
    deloadLoadPct: 90,
    deloadSetsMult: 0.5,
    deloadRepsMult: 0.8
  };
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/domain/types.ts
  rm src/lib/domain/.gitkeep
  git add src/lib/domain/.gitkeep
  git commit -m "feat: define domain types for progression engine"
  ```

### Task 11: Write tests for nextPrescription

**Files:**
- Create: `src/lib/domain/progression.test.ts`

- [ ] **Step 1:** Crea il file di test con:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { nextPrescription } from './progression';
  import { DEFAULT_SETTINGS, type Exercise } from './types';

  const baseWave = (overrides: Partial<Exercise> = {}): Exercise => ({
    id: 'ex1',
    name: 'Test',
    scheme: 'wave',
    restSeconds: 180,
    waveBaseLoad: 100,
    waveCurrentWeek: 1,
    waveCurrentCycle: 1,
    cycleFailures: 0,
    pendingDeload: false,
    ...overrides
  });

  const baseLinear = (overrides: Partial<Exercise> = {}): Exercise => ({
    id: 'exL',
    name: 'Test Linear',
    scheme: 'linear',
    restSeconds: 120,
    linearCurrentLoad: 60,
    linearTargetSets: 3,
    linearTargetReps: 8,
    linearConsecutiveFailures: 0,
    ...overrides
  });

  describe('nextPrescription — wave', () => {
    it('week 1 cycle 1 returns base prescription', () => {
      const p = nextPrescription(baseWave(), DEFAULT_SETTINGS);
      expect(p).toMatchObject({ sets: 3, reps: 8, load: 100, week: 1, cycle: 1, isDeload: false });
    });

    it('week 5 cycle 1 uses pattern multiplier 1.20', () => {
      const p = nextPrescription(baseWave({ waveCurrentWeek: 5 }), DEFAULT_SETTINGS);
      // base 100 * 1.20 = 120, rounded to plateRounding 2.5 = 120
      expect(p).toMatchObject({ sets: 8, reps: 3, load: 120, week: 5 });
    });

    it('cycle 2 applies cycle increment 2.5%', () => {
      const p = nextPrescription(baseWave({ waveCurrentCycle: 2 }), DEFAULT_SETTINGS);
      // base 100 * 1.025 (cycle) * 1.00 (week 1) = 102.5
      expect(p.load).toBe(102.5);
    });

    it('cycle 3 applies cycle increment compounded', () => {
      const p = nextPrescription(baseWave({ waveCurrentCycle: 3 }), DEFAULT_SETTINGS);
      // base 100 * (1.025^2) = 105.0625 → rounded to 2.5 → 105
      expect(p.load).toBe(105);
    });

    it('pendingDeload scales load, sets, reps down', () => {
      const p = nextPrescription(baseWave({ pendingDeload: true }), DEFAULT_SETTINGS);
      // load: 100 * 1.00 (week 1 mult) * 0.90 (deloadLoadPct) = 90
      // sets: round(3 * 0.5) = 2 (min 1)
      // reps: round(8 * 0.8) = 6 (min 1)
      expect(p).toMatchObject({ load: 90, sets: 2, reps: 6, isDeload: true });
    });
  });

  describe('nextPrescription — linear', () => {
    it('returns target sets/reps and current load', () => {
      const p = nextPrescription(baseLinear(), DEFAULT_SETTINGS);
      expect(p).toMatchObject({ sets: 3, reps: 8, load: 60, consecutiveFails: 0 });
    });

    it('passes consecutiveFails through', () => {
      const p = nextPrescription(baseLinear({ linearConsecutiveFailures: 1 }), DEFAULT_SETTINGS);
      expect(p.consecutiveFails).toBe(1);
    });
  });
  ```

- [ ] **Step 2:** Run test to verify it fails (modulo non esiste):

  Run: `npm test`
  Expected: errore di import "Cannot find module './progression'" o simile.

- [ ] **Step 3:** Commit (TDD: anche il test che fallisce va committato così resta tracciabile):

  ```bash
  git add src/lib/domain/progression.test.ts
  git commit -m "test: nextPrescription specs"
  ```

### Task 12: Implement nextPrescription

**Files:**
- Create: `src/lib/domain/progression.ts`

- [ ] **Step 1:** Crea `src/lib/domain/progression.ts`:

  ```typescript
  import {
    WAVE_PATTERN,
    type Exercise,
    type Prescription,
    type Settings
  } from './types';

  function roundTo(value: number, step: number): number {
    return Math.round(value / step) * step;
  }

  export function nextPrescription(ex: Exercise, settings: Settings): Prescription {
    if (ex.scheme === 'wave') {
      const week = ex.waveCurrentWeek ?? 1;
      const cycle = ex.waveCurrentCycle ?? 1;
      const pattern = WAVE_PATTERN[week - 1];
      const cycleMult = Math.pow(1 + settings.waveCycleIncrementPct / 100, cycle - 1);
      const baseLoad = (ex.waveBaseLoad ?? 0) * cycleMult;
      if (ex.pendingDeload) {
        return {
          sets: Math.max(1, Math.round(pattern.sets * settings.deloadSetsMult)),
          reps: Math.max(1, Math.round(pattern.reps * settings.deloadRepsMult)),
          load: roundTo(baseLoad * pattern.mult * (settings.deloadLoadPct / 100), settings.plateRounding),
          week,
          cycle,
          isDeload: true
        };
      }
      return {
        sets: pattern.sets,
        reps: pattern.reps,
        load: roundTo(baseLoad * pattern.mult, settings.plateRounding),
        week,
        cycle,
        isDeload: false
      };
    }
    // linear
    return {
      sets: ex.linearTargetSets ?? 0,
      reps: ex.linearTargetReps ?? 0,
      load: ex.linearCurrentLoad ?? 0,
      consecutiveFails: ex.linearConsecutiveFailures ?? 0
    };
  }
  ```

- [ ] **Step 2:** Run test to verify passes:

  Run: `npm test`
  Expected: tutti i test di Task 11 verdi.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/lib/domain/progression.ts
  git commit -m "feat: implement nextPrescription"
  ```

### Task 13: Write tests for weekWasFailed and entryStatus

**Files:**
- Modify: `src/lib/domain/progression.test.ts`

- [ ] **Step 1:** Aggiungi in fondo a `progression.test.ts`:

  ```typescript
  import { weekWasFailed, entryStatus } from './progression';
  import type { Entry } from './types';

  const entry = (overrides: Partial<Entry> = {}): Entry => ({
    prescribed: { sets: 3, reps: 8, load: 100 },
    actualSets: [],
    ...overrides
  });

  describe('weekWasFailed', () => {
    it('returns false when all sets ok and reps >= target', () => {
      const e = entry({
        actualSets: [
          { status: 'ok', reps: 8, load: 100 },
          { status: 'ok', reps: 8, load: 100 },
          { status: 'ok', reps: 9, load: 100 }
        ]
      });
      expect(weekWasFailed(e)).toBe(false);
    });

    it('returns true when any set has status fail', () => {
      const e = entry({
        actualSets: [
          { status: 'ok', reps: 8, load: 100 },
          { status: 'fail', reps: 6, load: 100 }
        ]
      });
      expect(weekWasFailed(e)).toBe(true);
    });

    it('returns true when ok set has reps below target', () => {
      const e = entry({
        actualSets: [
          { status: 'ok', reps: 8, load: 100 },
          { status: 'ok', reps: 5, load: 100 }
        ]
      });
      expect(weekWasFailed(e)).toBe(true);
    });
  });

  describe('entryStatus', () => {
    it('ok when all prescribed sets completed at target reps', () => {
      const e = entry({
        prescribed: { sets: 3, reps: 8, load: 100 },
        actualSets: [
          { status: 'ok', reps: 8, load: 100 },
          { status: 'ok', reps: 8, load: 100 },
          { status: 'ok', reps: 8, load: 100 }
        ]
      });
      expect(entryStatus(e).kind).toBe('ok');
    });

    it('fail when zero sets completed', () => {
      const e = entry({
        prescribed: { sets: 3, reps: 8, load: 100 },
        actualSets: [
          { status: 'fail', reps: 5, load: 100 },
          { status: 'fail', reps: 4, load: 100 }
        ]
      });
      expect(entryStatus(e).kind).toBe('fail');
    });

    it('partial when some sets completed', () => {
      const e = entry({
        prescribed: { sets: 3, reps: 8, load: 100 },
        actualSets: [
          { status: 'ok', reps: 8, load: 100 },
          { status: 'fail', reps: 4, load: 100 }
        ]
      });
      const s = entryStatus(e);
      expect(s.kind).toBe('partial');
      expect(s.text).toContain('1/3');
    });
  });
  ```

- [ ] **Step 2:** Run test to verify fails (funzioni non ancora implementate):

  Run: `npm test`
  Expected: import error per `weekWasFailed` e `entryStatus`.

- [ ] **Step 3:** Implementa in `src/lib/domain/progression.ts` (aggiungi in fondo):

  ```typescript
  export function weekWasFailed(entry: Entry): boolean {
    const target = entry.prescribed.reps;
    return entry.actualSets.some(
      (s) => s.status === 'fail' || (s.status === 'ok' && (s.reps || 0) < target)
    );
  }

  export function entryStatus(entry: Entry): EntryStatus {
    const target = entry.prescribed.reps;
    const ok = entry.actualSets.filter((s) => s.status === 'ok' && (s.reps || 0) >= target).length;
    const total = entry.prescribed.sets;
    if (ok === total) return { kind: 'ok', text: 'Conclusa' };
    if (ok === 0) return { kind: 'fail', text: 'Fallita' };
    return { kind: 'partial', text: `Parziale ${ok}/${total}` };
  }
  ```

  E aggiungi gli import in cima al file:

  ```typescript
  import {
    WAVE_PATTERN,
    type Entry,
    type EntryStatus,
    type Exercise,
    type Prescription,
    type Settings
  } from './types';
  ```

- [ ] **Step 4:** Run test to verify passes:

  Run: `npm test`
  Expected: tutti i test verdi.

- [ ] **Step 5:** Commit:

  ```bash
  git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
  git commit -m "feat: implement weekWasFailed and entryStatus"
  ```

### Task 14: Write tests for applyEntryResult (linear)

**Files:**
- Modify: `src/lib/domain/progression.test.ts`

- [ ] **Step 1:** Aggiungi in fondo al test file:

  ```typescript
  import { applyEntryResult } from './progression';

  describe('applyEntryResult — linear', () => {
    it('all sets ok at target reps → advance load by linearIncrementKg', () => {
      const ex = baseLinear({ linearCurrentLoad: 60 });
      const e = entry({
        prescribed: { sets: 3, reps: 8, load: 60 },
        actualSets: [
          { status: 'ok', reps: 8, load: 60 },
          { status: 'ok', reps: 8, load: 60 },
          { status: 'ok', reps: 8, load: 60 }
        ]
      });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('linear-advance');
      expect(result.updatedExercise.linearCurrentLoad).toBe(62.5);
      expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
    });

    it('one fail → linear-repeat, increment counter', () => {
      const ex = baseLinear({ linearCurrentLoad: 60, linearConsecutiveFailures: 0 });
      const e = entry({
        prescribed: { sets: 3, reps: 8, load: 60 },
        actualSets: [
          { status: 'ok', reps: 8, load: 60 },
          { status: 'fail', reps: 5, load: 60 }
        ]
      });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('linear-repeat');
      expect(result.updatedExercise.linearCurrentLoad).toBe(60);
      expect(result.updatedExercise.linearConsecutiveFailures).toBe(1);
    });

    it('two consecutive fails → linear-deload, reset counter', () => {
      const ex = baseLinear({ linearCurrentLoad: 60, linearConsecutiveFailures: 1 });
      const e = entry({
        prescribed: { sets: 3, reps: 8, load: 60 },
        actualSets: [{ status: 'fail', reps: 5, load: 60 }]
      });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('linear-deload');
      // 60 * (1 - 10/100) = 54, rounded to 2.5 → 55
      expect(result.updatedExercise.linearCurrentLoad).toBe(55);
      expect(result.updatedExercise.linearConsecutiveFailures).toBe(0);
    });

    it('no attempts (all status null) → noop', () => {
      const ex = baseLinear();
      const e = entry({
        actualSets: [{ status: null, reps: 0, load: 0 }]
      });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('noop');
      expect(result.updatedExercise).toEqual(ex);
    });
  });
  ```

- [ ] **Step 2:** Run test to verify fails (funzione non esiste):

  Run: `npm test`
  Expected: import error per `applyEntryResult`.

  (Implementazione nel task successivo, perché applyEntryResult include sia linear sia wave; separo i test per chiarezza ma l'implementazione è atomica.)

- [ ] **Step 3:** Commit:

  ```bash
  git add src/lib/domain/progression.test.ts
  git commit -m "test: applyEntryResult linear specs"
  ```

### Task 15: Write tests for applyEntryResult (wave) and implement applyEntryResult

**Files:**
- Modify: `src/lib/domain/progression.test.ts`, `src/lib/domain/progression.ts`

- [ ] **Step 1:** Aggiungi i test wave in fondo a `progression.test.ts`:

  ```typescript
  describe('applyEntryResult — wave', () => {
    const allOk = (prescribed: { sets: number; reps: number; load: number }): Entry => ({
      prescribed,
      actualSets: Array.from({ length: prescribed.sets }, () => ({
        status: 'ok' as const,
        reps: prescribed.reps,
        load: prescribed.load
      }))
    });

    const failedEntry = (prescribed: { sets: number; reps: number; load: number }): Entry => ({
      prescribed,
      actualSets: [
        { status: 'ok', reps: prescribed.reps, load: prescribed.load },
        { status: 'fail', reps: prescribed.reps - 2, load: prescribed.load }
      ]
    });

    it('week 1 ok → wave-advance-week to week 2', () => {
      const ex = baseWave({ waveCurrentWeek: 1, cycleFailures: 0 });
      const e = allOk({ sets: 3, reps: 8, load: 100 });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('wave-advance-week');
      expect(result.updatedExercise.waveCurrentWeek).toBe(2);
      expect(result.updatedExercise.cycleFailures).toBe(0);
    });

    it('failed week + userAction=repeat → wave-repeat-week, increment cycleFailures', () => {
      const ex = baseWave({ waveCurrentWeek: 2, cycleFailures: 0 });
      const e = failedEntry({ sets: 4, reps: 6, load: 105 });
      const result = applyEntryResult(ex, e, 'repeat', DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('wave-repeat-week');
      expect(result.updatedExercise.waveCurrentWeek).toBe(2);
      expect(result.updatedExercise.cycleFailures).toBe(1);
    });

    it('failed week + userAction=null → wave-advance-week with failed=true', () => {
      const ex = baseWave({ waveCurrentWeek: 2, cycleFailures: 0 });
      const e = failedEntry({ sets: 4, reps: 6, load: 105 });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('wave-advance-week');
      if (result.info.kind === 'wave-advance-week') {
        expect(result.info.failed).toBe(true);
      }
      expect(result.updatedExercise.waveCurrentWeek).toBe(3);
      expect(result.updatedExercise.cycleFailures).toBe(1);
    });

    it('end of cycle with cycleFailures=0 → wave-cycle-end normal, increment cycle', () => {
      const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 0 });
      const e = allOk({ sets: 8, reps: 3, load: 120 });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('wave-cycle-end');
      if (result.info.kind === 'wave-cycle-end') {
        expect(result.info.adjustmentKind).toBe('normal');
        expect(result.info.nextCycle).toBe(2);
        expect(result.info.oldBase).toBe(100);
        expect(result.info.newBase).toBe(100);
      }
      expect(result.updatedExercise.waveCurrentWeek).toBe(1);
      expect(result.updatedExercise.waveCurrentCycle).toBe(2);
    });

    it('end of cycle with cycleFailures=2 (hold threshold) → adjustmentKind=hold, cycle NOT incremented', () => {
      const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 2 });
      const e = allOk({ sets: 8, reps: 3, load: 120 });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      if (result.info.kind === 'wave-cycle-end') {
        expect(result.info.adjustmentKind).toBe('hold');
      }
      expect(result.updatedExercise.waveCurrentCycle).toBe(1);
    });

    it('end of cycle with cycleFailures=3 (reset threshold) → adjustmentKind=reset, baseLoad reduced', () => {
      const ex = baseWave({ waveBaseLoad: 100, waveCurrentWeek: 5, waveCurrentCycle: 1, cycleFailures: 3 });
      const e = allOk({ sets: 8, reps: 3, load: 120 });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      if (result.info.kind === 'wave-cycle-end') {
        expect(result.info.adjustmentKind).toBe('reset');
      }
      // 100 * (1 - 5/100) = 95
      expect(result.updatedExercise.waveBaseLoad).toBe(95);
    });

    it('end of cycle that triggers deload (cycle 3 with deloadEveryNCycles=3) → pendingDeload=true', () => {
      const ex = baseWave({ waveCurrentWeek: 5, waveCurrentCycle: 3, cycleFailures: 0 });
      const e = allOk({ sets: 8, reps: 3, load: 120 });
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      // After increment, cycle becomes 4. (4-1) % 3 == 0 → pendingDeload
      expect(result.updatedExercise.pendingDeload).toBe(true);
      expect(result.updatedExercise.waveCurrentCycle).toBe(4);
    });

    it('completion of deload session → deload-completed, pendingDeload cleared', () => {
      const ex = baseWave({ pendingDeload: true });
      const e: Entry = {
        prescribed: { sets: 2, reps: 6, load: 90, isDeload: true },
        actualSets: [
          { status: 'ok', reps: 6, load: 90 },
          { status: 'ok', reps: 6, load: 90 }
        ]
      };
      const result = applyEntryResult(ex, e, null, DEFAULT_SETTINGS);
      expect(result.info.kind).toBe('deload-completed');
      expect(result.updatedExercise.pendingDeload).toBe(false);
    });
  });
  ```

- [ ] **Step 2:** Run test (fallirà perché `applyEntryResult` non esiste ancora):

  Run: `npm test`
  Expected: errore di import.

- [ ] **Step 3:** Aggiungi l'implementazione in `src/lib/domain/progression.ts`. Importa anche `ProgressionResult`, `UserAction`:

  Aggiorna gli import in cima al file:

  ```typescript
  import {
    WAVE_PATTERN,
    type Entry,
    type EntryStatus,
    type Exercise,
    type Prescription,
    type ProgressionResult,
    type Settings,
    type UserAction
  } from './types';
  ```

  Aggiungi in fondo al file:

  ```typescript
  export function applyEntryResult(
    ex: Exercise,
    entry: Entry,
    userAction: UserAction,
    settings: Settings
  ): { updatedExercise: Exercise; info: ProgressionResult } {
    const updated: Exercise = { ...ex };
    const anyAttempt = entry.actualSets.some((s) => s.status !== null);
    if (!anyAttempt) return { updatedExercise: updated, info: { kind: 'noop' } };

    if (ex.scheme === 'linear') {
      const target = entry.prescribed.reps;
      const allCompleted = entry.actualSets.every(
        (s) => s.status === 'ok' && (s.reps || 0) >= target
      );
      if (allCompleted) {
        updated.linearCurrentLoad = roundTo(
          (ex.linearCurrentLoad ?? 0) + settings.linearIncrementKg,
          settings.plateRounding
        );
        updated.linearConsecutiveFailures = 0;
        return {
          updatedExercise: updated,
          info: { kind: 'linear-advance', newLoad: updated.linearCurrentLoad! }
        };
      }
      const fails = (ex.linearConsecutiveFailures ?? 0) + 1;
      if (fails >= 2) {
        updated.linearCurrentLoad = roundTo(
          (ex.linearCurrentLoad ?? 0) * (1 - settings.linearResetPct / 100),
          settings.plateRounding
        );
        updated.linearConsecutiveFailures = 0;
        return {
          updatedExercise: updated,
          info: { kind: 'linear-deload', newLoad: updated.linearCurrentLoad! }
        };
      }
      updated.linearConsecutiveFailures = fails;
      return { updatedExercise: updated, info: { kind: 'linear-repeat' } };
    }

    // wave
    if (entry.prescribed.isDeload || entry.isDeloadSession) {
      updated.pendingDeload = false;
      return { updatedExercise: updated, info: { kind: 'deload-completed' } };
    }

    const failed = weekWasFailed(entry);
    if (failed) {
      updated.cycleFailures = (ex.cycleFailures ?? 0) + 1;
      if (userAction === 'repeat') {
        return {
          updatedExercise: updated,
          info: { kind: 'wave-repeat-week', cycleFailures: updated.cycleFailures }
        };
      }
    }

    const nextWeek = (ex.waveCurrentWeek ?? 1) + 1;
    if (nextWeek > 5) {
      const fails = updated.cycleFailures ?? 0;
      const oldBase = ex.waveBaseLoad ?? 0;
      const completedCycle = ex.waveCurrentCycle ?? 1;
      let adjustmentKind: 'normal' | 'hold' | 'reset' = 'normal';
      let newBase = oldBase;
      if (fails >= settings.cycleResetThreshold) {
        newBase = roundTo(oldBase * (1 - settings.cycleResetPct / 100), settings.plateRounding);
        adjustmentKind = 'reset';
      } else if (fails >= settings.cycleHoldThreshold) {
        adjustmentKind = 'hold';
      }
      updated.waveBaseLoad = newBase;
      updated.waveCurrentWeek = 1;
      updated.waveCurrentCycle = adjustmentKind === 'hold' ? completedCycle : completedCycle + 1;
      updated.cycleFailures = 0;
      const N = settings.deloadEveryNCycles;
      const nextCycle = updated.waveCurrentCycle;
      if (N > 0 && adjustmentKind !== 'hold' && nextCycle - 1 > 0 && (nextCycle - 1) % N === 0) {
        updated.pendingDeload = true;
      }
      return {
        updatedExercise: updated,
        info: {
          kind: 'wave-cycle-end',
          adjustmentKind,
          fails,
          completedCycle,
          oldBase,
          newBase,
          pendingDeload: !!updated.pendingDeload,
          nextCycle
        }
      };
    }

    updated.waveCurrentWeek = nextWeek;
    return {
      updatedExercise: updated,
      info: {
        kind: 'wave-advance-week',
        failed,
        week: nextWeek,
        cycleFailures: updated.cycleFailures ?? 0
      }
    };
  }
  ```

- [ ] **Step 4:** Run test to verify ALL pass:

  Run: `npm test`
  Expected: tutti i test (nextPrescription + weekWasFailed + entryStatus + applyEntryResult linear + applyEntryResult wave) verdi.

- [ ] **Step 5:** Commit:

  ```bash
  git add src/lib/domain/progression.ts src/lib/domain/progression.test.ts
  git commit -m "feat: implement applyEntryResult with full wave/linear coverage"
  ```

---

## Milestone 4 — Supabase client + auth (Tasks 16-19)

Setup del client Supabase, store di sessione, pagina di login con magic link, guard del layout.

### Task 16: Set up Supabase client and env vars

**Files:**
- Create: `src/lib/supabase.ts`, `.env.local`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1:** Installa `@supabase/supabase-js`:

  Run: `npm install @supabase/supabase-js`
  Expected: dipendenza aggiunta.

- [ ] **Step 2:** Crea `.env.example` (committato, senza valori reali):

  ```
  PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
  PUBLIC_SUPABASE_ANON_KEY=<anon-key>
  ```

- [ ] **Step 3:** Crea `.env.local` (NON committato — già escluso dal .gitignore di SvelteKit). Inserisci i valori reali dal Pre-flight P2:

  ```
  PUBLIC_SUPABASE_URL=https://<actual-project-ref>.supabase.co
  PUBLIC_SUPABASE_ANON_KEY=<actual-anon-key>
  ```

- [ ] **Step 4:** Verifica che `.env.local` sia in `.gitignore`. Apri `.gitignore` e conferma che `.env*` o `.env.local` è incluso. Se non c'è, aggiungi:

  ```
  .env
  .env.*
  !.env.example
  ```

- [ ] **Step 5:** Crea `src/lib/supabase.ts`:

  ```typescript
  import { createClient } from '@supabase/supabase-js';
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
  import type { Database } from './database.types';

  export const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });
  ```

- [ ] **Step 6:** Verifica che il build proceda (le env vars sono lette):

  Run: `npm run build`
  Expected: build completata senza errori. Se mancano le env vars, SvelteKit lo segnala chiaramente.

- [ ] **Step 7:** Commit (NON committare `.env.local`):

  ```bash
  git add .env.example .gitignore src/lib/supabase.ts package.json package-lock.json
  git commit -m "feat: add Supabase client setup"
  ```

### Task 17: Create auth store

**Files:**
- Create: `src/lib/stores/auth.svelte.ts`

- [ ] **Step 1:** Crea `src/lib/stores/auth.svelte.ts`:

  ```typescript
  import { supabase } from '$lib/supabase';
  import type { Session, User } from '@supabase/supabase-js';

  type AuthState = {
    session: Session | null;
    user: User | null;
    loading: boolean;
  };

  function createAuthStore() {
    const state = $state<AuthState>({ session: null, user: null, loading: true });

    async function init() {
      const { data } = await supabase.auth.getSession();
      state.session = data.session;
      state.user = data.session?.user ?? null;
      state.loading = false;

      supabase.auth.onAuthStateChange((_event, session) => {
        state.session = session;
        state.user = session?.user ?? null;
      });
    }

    async function signInWithMagicLink(email: string) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false } // signup disabilitato lato app + lato Supabase
      });
      if (error) throw error;
    }

    async function signOut() {
      await supabase.auth.signOut();
    }

    return {
      get session() { return state.session; },
      get user() { return state.user; },
      get loading() { return state.loading; },
      get isAuthenticated() { return state.user !== null; },
      init,
      signInWithMagicLink,
      signOut
    };
  }

  export const authStore = createAuthStore();
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/stores/auth.svelte.ts
  rm src/lib/stores/.gitkeep
  git add src/lib/stores/.gitkeep
  git commit -m "feat: add auth store"
  ```

### Task 18: Create login page

**Files:**
- Create: `src/routes/login/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/login/+page.svelte`:

  ```svelte
  <script lang="ts">
    import { authStore } from '$lib/stores/auth.svelte';
    import { goto } from '$app/navigation';

    let email = $state('');
    let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
    let errorMsg = $state('');

    $effect(() => {
      if (authStore.isAuthenticated) {
        goto('/');
      }
    });

    async function submit(e: SubmitEvent) {
      e.preventDefault();
      status = 'sending';
      errorMsg = '';
      try {
        await authStore.signInWithMagicLink(email.trim());
        status = 'sent';
      } catch (err) {
        status = 'error';
        errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';
      }
    }
  </script>

  <div class="login">
    <h1>Ghisa</h1>
    <p class="sub">Diario di allenamento</p>

    {#if status === 'sent'}
      <p class="ok">Controlla la tua email: ti ho mandato un link per entrare.</p>
    {:else}
      <form onsubmit={submit}>
        <label>
          Email
          <input
            type="email"
            bind:value={email}
            required
            autocomplete="email"
            placeholder="la-tua@email.it"
            disabled={status === 'sending'}
          />
        </label>
        <button type="submit" disabled={status === 'sending' || !email.trim()}>
          {status === 'sending' ? 'Invio...' : 'Manda magic link'}
        </button>
        {#if status === 'error'}
          <p class="err">{errorMsg}</p>
        {/if}
      </form>
    {/if}
  </div>

  <style>
    .login {
      max-width: 360px;
      margin: 80px auto;
      padding: 0 20px;
      font-family: 'Manrope', system-ui, sans-serif;
    }
    h1 {
      font-family: 'Instrument Serif', Georgia, serif;
      font-style: italic;
      font-size: 48px;
      margin: 0;
    }
    .sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: #9A9A9F;
      margin: 0 0 32px;
    }
    label {
      display: block;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #5C5C66;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 14px;
      border: 1px solid #E5E0D6;
      border-radius: 12px;
      font-size: 16px;
      margin-bottom: 16px;
    }
    button {
      width: 100%;
      padding: 14px;
      background: #1A1A1F;
      color: white;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }
    button:disabled {
      opacity: .5;
    }
    .ok {
      padding: 14px;
      background: #E5F0E8;
      color: #3E7A4E;
      border-radius: 12px;
    }
    .err {
      color: #C8362D;
      font-size: 13px;
      margin-top: 8px;
    }
  </style>
  ```

- [ ] **Step 2:** Avvia dev server e verifica login:

  Run: `npm run dev`
  Naviga a `http://localhost:5173/login/`. Inserisci la tua email. Aspettati l'arrivo della mail con il magic link da Supabase. Cliccando il link torni sull'app autenticato. Stoppa il dev server.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/login/+page.svelte
  git commit -m "feat: add login page with magic link"
  ```

### Task 19: Layout-level auth guard

**Files:**
- Create: `src/routes/+layout.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/+layout.svelte`:

  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { authStore } from '$lib/stores/auth.svelte';

    let { children } = $props();

    onMount(async () => {
      await authStore.init();
    });

    $effect(() => {
      if (authStore.loading) return;
      const isLoginPage = page.url.pathname.startsWith('/login');
      if (!authStore.isAuthenticated && !isLoginPage) {
        goto('/login/');
      } else if (authStore.isAuthenticated && isLoginPage) {
        goto('/');
      }
    });
  </script>

  {#if authStore.loading}
    <div class="loading">Caricamento…</div>
  {:else}
    {@render children()}
  {/if}

  <style>
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: #9A9A9F;
    }
  </style>
  ```

- [ ] **Step 2:** Sostituisci il contenuto di `src/routes/+page.svelte` con un placeholder temporaneo (verrà rimpiazzato in M7):

  ```svelte
  <script lang="ts">
    import { authStore } from '$lib/stores/auth.svelte';
  </script>

  <div class="placeholder">
    <p>Autenticato come {authStore.user?.email}</p>
    <button onclick={() => authStore.signOut()}>Logout</button>
  </div>

  <style>
    .placeholder {
      padding: 40px;
      font-family: system-ui;
    }
  </style>
  ```

- [ ] **Step 3:** Verifica manualmente:
  - `npm run dev`
  - In sessione anonima vai a `/` → redirect a `/login/`.
  - Fai login con magic link → atterri su `/` e vedi la tua email + bottone Logout.
  - Premi Logout → torni a `/login/`.

  Stoppa il dev server.

- [ ] **Step 4:** Commit:

  ```bash
  git add src/routes/+layout.svelte src/routes/+page.svelte
  git commit -m "feat: layout auth guard with magic link flow"
  ```

---

## Milestone 5 — Data stores (Tasks 20-24)

Crea i quattro store che si interfacciano con Supabase: exercises, schede, workouts, settings. Pattern uniforme: `load()` all'init, `create/update/delete` con optimistic write.

### Task 20: Exercises store

**Files:**
- Create: `src/lib/stores/exercises.svelte.ts`

- [ ] **Step 1:** Crea `src/lib/stores/exercises.svelte.ts`:

  ```typescript
  import { supabase } from '$lib/supabase';
  import type { Exercise } from '$lib/domain/types';
  import { DEFAULT_SETTINGS } from '$lib/domain/types';

  type DbExercise = {
    id: string;
    user_id: string;
    name: string;
    scheme: 'wave' | 'linear';
    rest_seconds: number;
    wave_base_load: number | null;
    wave_current_week: number | null;
    wave_current_cycle: number | null;
    cycle_failures: number;
    pending_deload: boolean;
    linear_current_load: number | null;
    linear_target_sets: number | null;
    linear_target_reps: number | null;
    linear_consecutive_failures: number;
  };

  function dbToDomain(row: DbExercise): Exercise {
    return {
      id: row.id,
      name: row.name,
      scheme: row.scheme,
      restSeconds: row.rest_seconds,
      waveBaseLoad: row.wave_base_load ?? undefined,
      waveCurrentWeek: row.wave_current_week ?? undefined,
      waveCurrentCycle: row.wave_current_cycle ?? undefined,
      cycleFailures: row.cycle_failures,
      pendingDeload: row.pending_deload,
      linearCurrentLoad: row.linear_current_load ?? undefined,
      linearTargetSets: row.linear_target_sets ?? undefined,
      linearTargetReps: row.linear_target_reps ?? undefined,
      linearConsecutiveFailures: row.linear_consecutive_failures
    };
  }

  function domainToDb(ex: Exercise, userId: string): Omit<DbExercise, 'id'> & { id?: string } {
    return {
      ...(ex.id ? { id: ex.id } : {}),
      user_id: userId,
      name: ex.name,
      scheme: ex.scheme,
      rest_seconds: ex.restSeconds,
      wave_base_load: ex.waveBaseLoad ?? null,
      wave_current_week: ex.waveCurrentWeek ?? null,
      wave_current_cycle: ex.waveCurrentCycle ?? null,
      cycle_failures: ex.cycleFailures ?? 0,
      pending_deload: ex.pendingDeload ?? false,
      linear_current_load: ex.linearCurrentLoad ?? null,
      linear_target_sets: ex.linearTargetSets ?? null,
      linear_target_reps: ex.linearTargetReps ?? null,
      linear_consecutive_failures: ex.linearConsecutiveFailures ?? 0
    };
  }

  function createExercisesStore() {
    const state = $state<{ items: Exercise[]; loaded: boolean }>({ items: [], loaded: false });

    async function load() {
      const { data, error } = await supabase.from('exercises').select('*').order('name');
      if (error) throw error;
      state.items = (data as DbExercise[]).map(dbToDomain);
      state.loaded = true;
    }

    async function create(ex: Omit<Exercise, 'id'>): Promise<Exercise> {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const payload = domainToDb(ex as Exercise, user.id);
      delete (payload as { id?: string }).id;
      const { data, error } = await supabase.from('exercises').insert(payload).select().single();
      if (error) throw error;
      const created = dbToDomain(data as DbExercise);
      state.items = [...state.items, created];
      return created;
    }

    async function update(ex: Exercise) {
      // optimistic
      const idx = state.items.findIndex((e) => e.id === ex.id);
      const prev = idx >= 0 ? state.items[idx] : null;
      if (idx >= 0) state.items[idx] = ex;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const payload = domainToDb(ex, user.id);
      const { error } = await supabase.from('exercises').update(payload).eq('id', ex.id);
      if (error) {
        if (prev && idx >= 0) state.items[idx] = prev; // rollback
        throw error;
      }
    }

    async function remove(id: string) {
      const prev = state.items;
      state.items = state.items.filter((e) => e.id !== id);
      const { error } = await supabase.from('exercises').delete().eq('id', id);
      if (error) {
        state.items = prev;
        throw error;
      }
    }

    function getById(id: string): Exercise | undefined {
      return state.items.find((e) => e.id === id);
    }

    return {
      get items() { return state.items; },
      get loaded() { return state.loaded; },
      load,
      create,
      update,
      remove,
      getById
    };
  }

  export const exercisesStore = createExercisesStore();
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/stores/exercises.svelte.ts
  git commit -m "feat: add exercises store"
  ```

### Task 21: Schede store (schede + scheda_days)

**Files:**
- Create: `src/lib/stores/schede.svelte.ts`

- [ ] **Step 1:** Crea `src/lib/stores/schede.svelte.ts`:

  ```typescript
  import { supabase } from '$lib/supabase';

  export type Scheda = {
    id: string;
    name: string;
    position: number;
    days: SchedaDay[];
  };

  export type SchedaDay = {
    id: string;
    schedaId: string;
    name: string;
    position: number;
    exerciseIds: string[];
  };

  function createSchedeStore() {
    const state = $state<{ items: Scheda[]; loaded: boolean }>({ items: [], loaded: false });

    async function load() {
      const [{ data: schede, error: e1 }, { data: days, error: e2 }] = await Promise.all([
        supabase.from('schede').select('*').order('position'),
        supabase.from('scheda_days').select('*').order('position')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const daysByScheda = new Map<string, SchedaDay[]>();
      for (const d of days || []) {
        const day: SchedaDay = {
          id: d.id as string,
          schedaId: d.scheda_id as string,
          name: d.name as string,
          position: d.position as number,
          exerciseIds: (d.exercise_ids as string[]) || []
        };
        if (!daysByScheda.has(day.schedaId)) daysByScheda.set(day.schedaId, []);
        daysByScheda.get(day.schedaId)!.push(day);
      }

      state.items = (schede || []).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        position: s.position as number,
        days: daysByScheda.get(s.id as string) || []
      }));
      state.loaded = true;
    }

    async function createScheda(name: string): Promise<Scheda> {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const pos = state.items.length;
      const { data, error } = await supabase
        .from('schede')
        .insert({ user_id: user.id, name, position: pos })
        .select()
        .single();
      if (error) throw error;
      const scheda: Scheda = {
        id: data.id as string,
        name: data.name as string,
        position: data.position as number,
        days: []
      };
      state.items = [...state.items, scheda];
      return scheda;
    }

    async function renameScheda(id: string, name: string) {
      const idx = state.items.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const prev = state.items[idx].name;
      state.items[idx].name = name;
      const { error } = await supabase.from('schede').update({ name }).eq('id', id);
      if (error) {
        state.items[idx].name = prev;
        throw error;
      }
    }

    async function deleteScheda(id: string) {
      const prev = state.items;
      state.items = state.items.filter((s) => s.id !== id);
      const { error } = await supabase.from('schede').delete().eq('id', id);
      if (error) {
        state.items = prev;
        throw error;
      }
    }

    async function addDay(schedaId: string, name: string): Promise<SchedaDay> {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const scheda = state.items.find((s) => s.id === schedaId);
      if (!scheda) throw new Error('Scheda not found');
      const pos = scheda.days.length;
      const { data, error } = await supabase
        .from('scheda_days')
        .insert({ user_id: user.id, scheda_id: schedaId, name, position: pos, exercise_ids: [] })
        .select()
        .single();
      if (error) throw error;
      const day: SchedaDay = {
        id: data.id as string,
        schedaId,
        name: data.name as string,
        position: data.position as number,
        exerciseIds: []
      };
      scheda.days = [...scheda.days, day];
      return day;
    }

    async function renameDay(schedaId: string, dayId: string, name: string) {
      const scheda = state.items.find((s) => s.id === schedaId);
      if (!scheda) return;
      const dayIdx = scheda.days.findIndex((d) => d.id === dayId);
      if (dayIdx < 0) return;
      const prev = scheda.days[dayIdx].name;
      scheda.days[dayIdx].name = name;
      const { error } = await supabase.from('scheda_days').update({ name }).eq('id', dayId);
      if (error) {
        scheda.days[dayIdx].name = prev;
        throw error;
      }
    }

    async function deleteDay(schedaId: string, dayId: string) {
      const scheda = state.items.find((s) => s.id === schedaId);
      if (!scheda) return;
      const prev = scheda.days;
      scheda.days = scheda.days.filter((d) => d.id !== dayId);
      const { error } = await supabase.from('scheda_days').delete().eq('id', dayId);
      if (error) {
        scheda.days = prev;
        throw error;
      }
    }

    async function setDayExercises(schedaId: string, dayId: string, exerciseIds: string[]) {
      const scheda = state.items.find((s) => s.id === schedaId);
      if (!scheda) return;
      const dayIdx = scheda.days.findIndex((d) => d.id === dayId);
      if (dayIdx < 0) return;
      const prev = scheda.days[dayIdx].exerciseIds;
      scheda.days[dayIdx].exerciseIds = exerciseIds;
      const { error } = await supabase
        .from('scheda_days')
        .update({ exercise_ids: exerciseIds })
        .eq('id', dayId);
      if (error) {
        scheda.days[dayIdx].exerciseIds = prev;
        throw error;
      }
    }

    function getById(id: string): Scheda | undefined {
      return state.items.find((s) => s.id === id);
    }

    function getDay(schedaId: string, dayId: string): SchedaDay | undefined {
      return getById(schedaId)?.days.find((d) => d.id === dayId);
    }

    return {
      get items() { return state.items; },
      get loaded() { return state.loaded; },
      load,
      createScheda,
      renameScheda,
      deleteScheda,
      addDay,
      renameDay,
      deleteDay,
      setDayExercises,
      getById,
      getDay
    };
  }

  export const schedeStore = createSchedeStore();
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/stores/schede.svelte.ts
  git commit -m "feat: add schede store"
  ```

### Task 22: Workouts store

**Files:**
- Create: `src/lib/stores/workouts.svelte.ts`

- [ ] **Step 1:** Crea `src/lib/stores/workouts.svelte.ts`:

  ```typescript
  import { supabase } from '$lib/supabase';
  import type { Entry, ProgressionResult } from '$lib/domain/types';

  export type WorkoutEntryRecord = {
    id: string;
    workoutId: string;
    exerciseId: string;
    position: number;
    prescribed: Entry['prescribed'];
    actualSets: Entry['actualSets'];
    userAction: 'repeat' | null;
    resultInfo: ProgressionResult | null;
    isDeloadSession: boolean;
  };

  export type Workout = {
    id: string;
    schedaId: string | null;
    dayId: string | null;
    performedAt: string;
    entries: WorkoutEntryRecord[];
  };

  function createWorkoutsStore() {
    const state = $state<{ items: Workout[]; loaded: boolean }>({ items: [], loaded: false });

    async function load() {
      const [{ data: workouts, error: e1 }, { data: entries, error: e2 }] = await Promise.all([
        supabase.from('workouts').select('*').order('performed_at', { ascending: false }),
        supabase.from('workout_entries').select('*').order('position')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const entriesByWorkout = new Map<string, WorkoutEntryRecord[]>();
      for (const e of entries || []) {
        const rec: WorkoutEntryRecord = {
          id: e.id as string,
          workoutId: e.workout_id as string,
          exerciseId: e.exercise_id as string,
          position: e.position as number,
          prescribed: e.prescribed as Entry['prescribed'],
          actualSets: e.actual_sets as Entry['actualSets'],
          userAction: e.user_action as 'repeat' | null,
          resultInfo: e.result_info as ProgressionResult | null,
          isDeloadSession: e.is_deload_session as boolean
        };
        if (!entriesByWorkout.has(rec.workoutId)) entriesByWorkout.set(rec.workoutId, []);
        entriesByWorkout.get(rec.workoutId)!.push(rec);
      }

      state.items = (workouts || []).map((w) => ({
        id: w.id as string,
        schedaId: w.scheda_id as string | null,
        dayId: w.day_id as string | null,
        performedAt: w.performed_at as string,
        entries: entriesByWorkout.get(w.id as string) || []
      }));
      state.loaded = true;
    }

    async function commit(
      schedaId: string | null,
      dayId: string | null,
      performedAt: string,
      entries: Omit<WorkoutEntryRecord, 'id' | 'workoutId'>[]
    ): Promise<Workout> {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: workout, error: e1 } = await supabase
        .from('workouts')
        .insert({
          user_id: user.id,
          scheda_id: schedaId,
          day_id: dayId,
          performed_at: performedAt
        })
        .select()
        .single();
      if (e1) throw e1;

      const workoutId = workout.id as string;
      const entryRows = entries.map((e, i) => ({
        workout_id: workoutId,
        user_id: user.id,
        exercise_id: e.exerciseId,
        position: i,
        prescribed: e.prescribed,
        actual_sets: e.actualSets,
        user_action: e.userAction,
        result_info: e.resultInfo,
        is_deload_session: e.isDeloadSession
      }));

      const { data: insertedEntries, error: e2 } = await supabase
        .from('workout_entries')
        .insert(entryRows)
        .select();
      if (e2) throw e2;

      const newWorkout: Workout = {
        id: workoutId,
        schedaId,
        dayId,
        performedAt,
        entries: (insertedEntries || []).map((e) => ({
          id: e.id as string,
          workoutId,
          exerciseId: e.exercise_id as string,
          position: e.position as number,
          prescribed: e.prescribed as Entry['prescribed'],
          actualSets: e.actual_sets as Entry['actualSets'],
          userAction: e.user_action as 'repeat' | null,
          resultInfo: e.result_info as ProgressionResult | null,
          isDeloadSession: e.is_deload_session as boolean
        }))
      };
      state.items = [newWorkout, ...state.items];
      return newWorkout;
    }

    function getById(id: string): Workout | undefined {
      return state.items.find((w) => w.id === id);
    }

    return {
      get items() { return state.items; },
      get loaded() { return state.loaded; },
      load,
      commit,
      getById
    };
  }

  export const workoutsStore = createWorkoutsStore();
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/stores/workouts.svelte.ts
  git commit -m "feat: add workouts store"
  ```

### Task 23: Settings store

**Files:**
- Create: `src/lib/stores/settings.svelte.ts`

- [ ] **Step 1:** Crea `src/lib/stores/settings.svelte.ts`:

  ```typescript
  import { supabase } from '$lib/supabase';
  import { DEFAULT_SETTINGS, type Settings } from '$lib/domain/types';

  function createSettingsStore() {
    const state = $state<{ data: Settings; loaded: boolean }>({
      data: { ...DEFAULT_SETTINGS },
      loaded: false
    });

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('user_settings')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        state.data = { ...DEFAULT_SETTINGS, ...((data.data || {}) as Partial<Settings>) };
      } else {
        // crea riga vuota al primo login
        await supabase.from('user_settings').insert({ user_id: user.id, data: {} });
        state.data = { ...DEFAULT_SETTINGS };
      }
      state.loaded = true;
    }

    async function update(partial: Partial<Settings>) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const prev = { ...state.data };
      state.data = { ...state.data, ...partial };
      const { error } = await supabase
        .from('user_settings')
        .update({ data: state.data, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) {
        state.data = prev;
        throw error;
      }
    }

    return {
      get data() { return state.data; },
      get loaded() { return state.loaded; },
      load,
      update
    };
  }

  export const settingsStore = createSettingsStore();
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/stores/settings.svelte.ts
  git commit -m "feat: add settings store"
  ```

### Task 24: Bootstrap stores on auth

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1:** Aggiorna `src/routes/+layout.svelte` per caricare gli store dopo l'auth. Modifica lo `<script>`:

  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { authStore } from '$lib/stores/auth.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { schedeStore } from '$lib/stores/schede.svelte';
    import { workoutsStore } from '$lib/stores/workouts.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';

    let { children } = $props();
    let storesLoaded = $state(false);

    onMount(async () => {
      await authStore.init();
    });

    $effect(() => {
      if (authStore.loading) return;
      const isLoginPage = page.url.pathname.startsWith('/login');
      if (!authStore.isAuthenticated && !isLoginPage) {
        goto('/login/');
        return;
      }
      if (authStore.isAuthenticated && isLoginPage) {
        goto('/');
        return;
      }
      if (authStore.isAuthenticated && !storesLoaded) {
        loadStores();
      }
    });

    async function loadStores() {
      try {
        await Promise.all([
          exercisesStore.load(),
          schedeStore.load(),
          workoutsStore.load(),
          settingsStore.load()
        ]);
        storesLoaded = true;
      } catch (err) {
        console.error('Errore caricamento dati', err);
      }
    }
  </script>

  {#if authStore.loading || (authStore.isAuthenticated && !storesLoaded && !page.url.pathname.startsWith('/login'))}
    <div class="loading">Caricamento…</div>
  {:else}
    {@render children()}
  {/if}

  <style>
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: #9A9A9F;
    }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Login → vedi "Caricamento…" brevemente → atterri sulla home placeholder. Logout → `/login/`. Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/+layout.svelte
  git commit -m "feat: bootstrap data stores after auth"
  ```

---

## Milestone 6 — Layout globale, stili e helper UI (Tasks 25-27)

Porta gli stili globali e gli helper di formattazione da `index.html`.

### Task 25: Port global styles

**Files:**
- Create: `src/styles/globals.css`
- Modify: `src/app.html`

- [ ] **Step 1:** Crea `src/styles/globals.css` copiando il blocco `<style>` di `index.html` (linee 12-273). Conserva tutte le CSS custom properties e le classi (`.topbar`, `.brand`, `.tabbar`, `.tab`, `.card`, `.ex-card`, `.btn`, `.rest-timer`, `.modal`, `.form`, ecc.).

  **Suggerimento:** apri `index.html` in editor, seleziona il contenuto tra `<style>` (linea 12) e `</style>` (linea 274), e incollalo in `src/styles/globals.css`. Aggiungi all'inizio:

  ```css
  /* Importato da index.html legacy. Stili verticali dell'app Ghisa. */
  ```

- [ ] **Step 2:** Modifica `src/app.html` per importare i font e applicare la base style. Sostituisci tutto il file con:

  ```html
  <!doctype html>
  <html lang="it">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="theme-color" content="#FAF7F2" />
      <link rel="icon" href="%sveltekit.assets%/favicon.png" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <title>Ghisa — Diario di allenamento</title>
      %sveltekit.head%
    </head>
    <body data-sveltekit-preload-data="hover">
      <div style="display: contents">%sveltekit.body%</div>
    </body>
  </html>
  ```

- [ ] **Step 3:** Importa `globals.css` nel layout. Aggiungi in cima allo `<script>` di `src/routes/+layout.svelte`:

  ```typescript
  import '../styles/globals.css';
  ```

- [ ] **Step 4:** Verifica:

  Run: `npm run dev`
  Login → la home placeholder ora ha font Manrope, sfondo `#FAF7F2`. Stoppa.

- [ ] **Step 5:** Commit:

  ```bash
  git add src/styles src/app.html src/routes/+layout.svelte
  rm src/styles/.gitkeep
  git add src/styles/.gitkeep
  git commit -m "feat: import global styles from legacy index.html"
  ```

### Task 26: Port UI utilities (formatting)

**Files:**
- Create: `src/lib/ui/utils.ts`

- [ ] **Step 1:** Crea `src/lib/ui/utils.ts` portando le funzioni di formattazione da `index.html` (linee 389-404):

  ```typescript
  export function uid(prefix = 'x'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  export function roundTo(value: number, step: number): number {
    return Math.round(value / step) * step;
  }

  export function fmtKg(kg: number | null | undefined): string {
    if (kg == null || isNaN(kg)) return '–';
    const n = Math.round(kg * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
  }

  export function fmtDate(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (same(d, today))
      return 'oggi · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (same(d, yest))
      return 'ieri · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return (
      d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) +
      ' · ' +
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    );
  }

  export function fmtSec(s: number): string {
    s = Math.max(0, Math.round(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/ui/utils.ts
  rm src/lib/ui/.gitkeep
  git add src/lib/ui/.gitkeep
  git commit -m "feat: port UI utilities (formatting)"
  ```

### Task 27: Top bar and tab bar shell

**Files:**
- Create: `src/lib/ui/Topbar.svelte`, `src/lib/ui/Tabbar.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1:** Crea `src/lib/ui/Topbar.svelte`:

  ```svelte
  <script lang="ts">
    let { subtitle = '' }: { subtitle?: string } = $props();
  </script>

  <div class="topbar">
    <div>
      <div class="brand">
        Ghisa<span class="brand-sub">  {subtitle}</span>
      </div>
    </div>
  </div>
  ```

- [ ] **Step 2:** Crea `src/lib/ui/Tabbar.svelte`. Le 4 tab corrispondono alle viste attuali (allenamento → `/`, esercizi → `/esercizi/`, storico → `/storico/`, impostazioni → `/impostazioni/`):

  ```svelte
  <script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';

    type Tab = { key: string; label: string; href: string; matches: (p: string) => boolean };

    const tabs: Tab[] = [
      {
        key: 'allenamento',
        label: 'Allenamento',
        href: '/',
        matches: (p) => p === '/' || p.startsWith('/schede') || p.startsWith('/workout')
      },
      { key: 'esercizi', label: 'Esercizi', href: '/esercizi/', matches: (p) => p.startsWith('/esercizi') },
      { key: 'storico', label: 'Storico', href: '/storico/', matches: (p) => p.startsWith('/storico') },
      { key: 'impostazioni', label: 'Impostazioni', href: '/impostazioni/', matches: (p) => p.startsWith('/impostazioni') }
    ];

    function isActive(t: Tab): boolean {
      return t.matches(page.url.pathname);
    }
  </script>

  <nav class="tabbar">
    {#each tabs as t (t.key)}
      <button class="tab" class:active={isActive(t)} onclick={() => goto(t.href)}>
        {#if t.key === 'allenamento'}
          <svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 4v16M15 4v16"/></svg>
        {:else if t.key === 'esercizi'}
          <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
        {:else if t.key === 'storico'}
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        {:else if t.key === 'impostazioni'}
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
        {/if}
        <span>{t.label}</span>
      </button>
    {/each}
  </nav>
  ```

  Le icone replicano quelle del CSS legacy (`index.html` linee 593-606). Lo stile `<svg>` (fill: none, stroke: currentColor, stroke-width: 1.6) è già definito nel `globals.css` portato in Task 25.

- [ ] **Step 3:** Modifica `src/routes/+layout.svelte` per usare topbar e tabbar (solo quando autenticato e non sulla login):

  ```svelte
  <script lang="ts">
    import '../styles/globals.css';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { authStore } from '$lib/stores/auth.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { schedeStore } from '$lib/stores/schede.svelte';
    import { workoutsStore } from '$lib/stores/workouts.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import Topbar from '$lib/ui/Topbar.svelte';
    import Tabbar from '$lib/ui/Tabbar.svelte';

    let { children } = $props();
    let storesLoaded = $state(false);

    onMount(async () => {
      await authStore.init();
    });

    $effect(() => {
      if (authStore.loading) return;
      const isLoginPage = page.url.pathname.startsWith('/login');
      if (!authStore.isAuthenticated && !isLoginPage) { goto('/login/'); return; }
      if (authStore.isAuthenticated && isLoginPage) { goto('/'); return; }
      if (authStore.isAuthenticated && !storesLoaded) { loadStores(); }
    });

    async function loadStores() {
      try {
        await Promise.all([
          exercisesStore.load(),
          schedeStore.load(),
          workoutsStore.load(),
          settingsStore.load()
        ]);
        storesLoaded = true;
      } catch (err) {
        console.error('Errore caricamento dati', err);
      }
    }

    const showChrome = $derived(
      authStore.isAuthenticated && !page.url.pathname.startsWith('/login') && storesLoaded
    );

    const topbarSubtitle = $derived.by(() => {
      const p = page.url.pathname;
      if (p.startsWith('/esercizi')) return 'Esercizi';
      if (p.startsWith('/storico')) return 'Storico';
      if (p.startsWith('/impostazioni')) return 'Impostazioni';
      if (p.startsWith('/schede')) return 'Scheda';
      if (p.startsWith('/workout')) return 'Seduta';
      return 'Schede';
    });
  </script>

  {#if authStore.loading || (authStore.isAuthenticated && !storesLoaded && !page.url.pathname.startsWith('/login'))}
    <div class="loading">Caricamento…</div>
  {:else}
    {#if showChrome}
      <Topbar subtitle={topbarSubtitle} />
    {/if}
    {@render children()}
    {#if showChrome}
      <Tabbar />
    {/if}
  {/if}

  <style>
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: #9A9A9F;
    }
  </style>
  ```

- [ ] **Step 4:** Verifica:

  Run: `npm run dev`
  Login → home placeholder ora ha topbar "Ghisa Schede" e tabbar in basso con 4 tab cliccabili (le rotte non esistono ancora ma il click ti porta a 404 SvelteKit). Stoppa.

- [ ] **Step 5:** Commit:

  ```bash
  git add src/lib/ui/Topbar.svelte src/lib/ui/Tabbar.svelte src/routes/+layout.svelte
  git commit -m "feat: add topbar and tabbar shell"
  ```

---

## Milestone 7 — Tab Esercizi (Tasks 28-31)

Porta le viste "lista esercizi" (`renderExercisesList`, linea 789) e "form esercizio" (`renderExerciseForm`, linea 832) come route SvelteKit. Faccio Esercizi prima di Schede perché le schede referenziano gli esercizi.

### Task 28: Esercizi list page

**Files:**
- Create: `src/routes/esercizi/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/esercizi/+page.svelte`. Comportamento da preservare (da `index.html` linee 789-830):
  - Mostra la lista degli esercizi (`exercisesStore.items`) come card.
  - Ogni card mostra: nome, scheme tag (wave/linear), prescription corrente (da `nextPrescription`), ultimo carico.
  - FAB in basso a destra → naviga a `/esercizi/new/`.
  - Tap su card → naviga a `/esercizi/[id]/`.

  ```svelte
  <script lang="ts">
    import { goto } from '$app/navigation';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { nextPrescription } from '$lib/domain/progression';
    import { fmtKg } from '$lib/ui/utils';
  </script>

  <div class="view">
    <h2 class="view-title">Esercizi</h2>
    <p class="view-sub">{exercisesStore.items.length} esercizi</p>

    {#if exercisesStore.items.length === 0}
      <div class="card">
        <p style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">
          Nessun esercizio. Aggiungi il primo con il bottone in basso.
        </p>
      </div>
    {/if}

    {#each exercisesStore.items as ex (ex.id)}
      {@const p = nextPrescription(ex, settingsStore.data)}
      <button class="ex-card" onclick={() => goto(`/esercizi/${ex.id}/`)} style="text-align: left; width: 100%; cursor: pointer;">
        <div class="scheme-tag {ex.scheme}">{ex.scheme}</div>
        <h3 class="name">{ex.name}</h3>
        <div class="prescription">
          <span class="sets-x-reps">{p.sets}×{p.reps}</span>
          <span class="at">@</span>
          <span class="load">{fmtKg(p.load)}<span class="unit">{settingsStore.data.weightUnit}</span></span>
        </div>
        {#if ex.scheme === 'wave'}
          <div class="meta">
            <span>Settimana {ex.waveCurrentWeek ?? 1}</span>
            <span class="dot"></span>
            <span>Ciclo {ex.waveCurrentCycle ?? 1}</span>
            {#if ex.pendingDeload}<span class="dot"></span><span>Deload</span>{/if}
          </div>
        {/if}
      </button>
    {/each}
  </div>

  <button class="fab" onclick={() => goto('/esercizi/new/')}>+ Nuovo esercizio</button>

  <style>
    .fab {
      position: fixed;
      right: 20px;
      bottom: calc(80px + env(safe-area-inset-bottom));
      background: var(--ink);
      color: white;
      padding: 14px 18px;
      border-radius: 24px;
      font-family: var(--sans);
      font-weight: 600;
      font-size: 13px;
      box-shadow: var(--shadow-lg);
      z-index: 40;
    }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Login → tap tab Esercizi → vedi "Nessun esercizio" e il FAB. Cliccando il FAB vai a `/esercizi/new/` (404 al momento). Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/esercizi/+page.svelte
  git commit -m "feat: esercizi list page"
  ```

### Task 29: Exercise form — wave fields

**Files:**
- Create: `src/routes/esercizi/[id]/+page.svelte`, `src/lib/ui/ExerciseForm.svelte`

- [ ] **Step 1:** Crea `src/lib/ui/ExerciseForm.svelte`. Riproduci il form di `index.html` linee 832-918. Il route param `[id]` può essere `new` (crea) o un uuid esistente (modifica).

  ```svelte
  <script lang="ts">
    import type { Exercise, Scheme } from '$lib/domain/types';
    import { settingsStore } from '$lib/stores/settings.svelte';

    let { exercise, onsave, oncancel }: {
      exercise: Partial<Exercise>;
      onsave: (ex: Omit<Exercise, 'id'>) => void;
      oncancel: () => void;
    } = $props();

    let name = $state(exercise.name ?? '');
    let scheme = $state<Scheme>(exercise.scheme ?? 'wave');
    let restSeconds = $state(exercise.restSeconds ?? settingsStore.data.defaultRestSec);
    let waveBaseLoad = $state(exercise.waveBaseLoad ?? 0);
    let linearCurrentLoad = $state(exercise.linearCurrentLoad ?? 0);
    let linearTargetSets = $state(exercise.linearTargetSets ?? 3);
    let linearTargetReps = $state(exercise.linearTargetReps ?? 8);

    function submit(e: SubmitEvent) {
      e.preventDefault();
      const base: Omit<Exercise, 'id'> = {
        name: name.trim(),
        scheme,
        restSeconds
      };
      if (scheme === 'wave') {
        onsave({
          ...base,
          waveBaseLoad,
          waveCurrentWeek: exercise.waveCurrentWeek ?? 1,
          waveCurrentCycle: exercise.waveCurrentCycle ?? 1,
          cycleFailures: exercise.cycleFailures ?? 0,
          pendingDeload: exercise.pendingDeload ?? false
        });
      } else {
        onsave({
          ...base,
          linearCurrentLoad,
          linearTargetSets,
          linearTargetReps,
          linearConsecutiveFailures: exercise.linearConsecutiveFailures ?? 0
        });
      }
    }
  </script>

  <form onsubmit={submit} class="ex-form">
    <label>
      Nome
      <input type="text" bind:value={name} required />
    </label>

    <label>
      Schema di progressione
      <select bind:value={scheme}>
        <option value="wave">Wave (5 settimane)</option>
        <option value="linear">Linear (carico fisso, +kg quando completi)</option>
      </select>
    </label>

    <label>
      Recupero tra serie (secondi)
      <input type="number" bind:value={restSeconds} min="30" step="15" />
    </label>

    {#if scheme === 'wave'}
      <label>
        Carico base ({settingsStore.data.weightUnit})
        <input type="number" bind:value={waveBaseLoad} min="0" step={settingsStore.data.plateRounding} />
      </label>
    {:else}
      <label>
        Carico iniziale ({settingsStore.data.weightUnit})
        <input type="number" bind:value={linearCurrentLoad} min="0" step={settingsStore.data.plateRounding} />
      </label>
      <label>
        Serie target
        <input type="number" bind:value={linearTargetSets} min="1" />
      </label>
      <label>
        Reps target
        <input type="number" bind:value={linearTargetReps} min="1" />
      </label>
    {/if}

    <div class="actions">
      <button type="button" class="btn secondary" onclick={oncancel}>Annulla</button>
      <button type="submit" class="btn primary">Salva</button>
    </div>
  </form>

  <style>
    .ex-form { display: flex; flex-direction: column; gap: 12px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
    input, select { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; }
    .actions { display: flex; gap: 8px; margin-top: 16px; }
    .actions .btn { flex: 1; }
    .btn { padding: 14px; border-radius: 12px; font-weight: 600; font-size: 14px; }
    .btn.primary { background: var(--ink); color: white; }
    .btn.secondary { background: var(--bg-elev); color: var(--ink); }
  </style>
  ```

- [ ] **Step 2:** Crea `src/routes/esercizi/[id]/+page.svelte`:

  ```svelte
  <script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import ExerciseForm from '$lib/ui/ExerciseForm.svelte';
    import type { Exercise } from '$lib/domain/types';

    const id = $derived(page.params.id);
    const isNew = $derived(id === 'new');
    const existing = $derived(isNew ? undefined : exercisesStore.getById(id));

    async function save(ex: Omit<Exercise, 'id'>) {
      try {
        if (isNew) {
          await exercisesStore.create(ex);
        } else if (existing) {
          await exercisesStore.update({ ...existing, ...ex });
        }
        goto('/esercizi/');
      } catch (err) {
        alert('Errore salvataggio: ' + (err instanceof Error ? err.message : 'sconosciuto'));
      }
    }

    function cancel() {
      goto('/esercizi/');
    }

    async function remove() {
      if (!existing) return;
      if (!confirm(`Eliminare "${existing.name}"?`)) return;
      try {
        await exercisesStore.remove(existing.id);
        goto('/esercizi/');
      } catch (err) {
        alert('Impossibile eliminare. Probabilmente ha sedute storiche associate.');
      }
    }
  </script>

  <div class="view">
    <button class="back" onclick={cancel}>← Esercizi</button>
    <h2 class="view-title">{isNew ? 'Nuovo esercizio' : 'Modifica esercizio'}</h2>

    {#if isNew}
      <ExerciseForm exercise={{}} onsave={save} oncancel={cancel} />
    {:else if existing}
      <ExerciseForm exercise={existing} onsave={save} oncancel={cancel} />
      <button class="btn danger" onclick={remove}>Elimina esercizio</button>
    {:else}
      <p>Esercizio non trovato.</p>
    {/if}
  </div>

  <style>
    .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); margin: 0 0 8px; padding: 6px 0; }
    .btn.danger { width: 100%; margin-top: 16px; padding: 14px; background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 12px; font-weight: 600; }
  </style>
  ```

- [ ] **Step 3:** Verifica:

  Run: `npm run dev`
  Login → Esercizi → "Nuovo esercizio" → compila form wave (es. Squat, base 80 kg) → Salva. Torna alla lista, vedi l'esercizio. Cliccaci → vedi il form pre-compilato. Stoppa.

- [ ] **Step 4:** Commit:

  ```bash
  git add src/lib/ui/ExerciseForm.svelte src/routes/esercizi/[id]/+page.svelte
  git commit -m "feat: exercise form (new/edit/delete)"
  ```

### Task 30: Smoke check round-trip Supabase

- [ ] **Step 1:** Dopo il salvataggio in Task 29, apri il Supabase Dashboard → Table Editor → `exercises` → verifica che ci sia una riga con il tuo `user_id` e i campi corretti.

- [ ] **Step 2:** Da terminale browser (DevTools → Console):

  ```javascript
  const { data } = await window.fetch('https://<project-ref>.supabase.co/rest/v1/exercises?select=*', {
    headers: { apikey: '<anon-key>' }
  }).then(r => r.json());
  console.log(data);
  ```

  Expected: `data` è `[]` (senza JWT, RLS blocca tutto). Conferma che senza autenticazione i dati non sono accessibili.

  Niente da committare; verifica.

### Task 31: Wire "Esercizio" menu actions (rename/delete protection)

**Files:**
- Modify: `src/lib/stores/exercises.svelte.ts`

- [ ] **Step 1:** Aggiorna `remove` in `exercises.svelte.ts` per dare errore chiaro se l'esercizio ha storico. Sostituisci la funzione `remove`:

  ```typescript
  async function remove(id: string) {
    const prev = state.items;
    state.items = state.items.filter((e) => e.id !== id);
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) {
      state.items = prev;
      // FK violation: 23503
      if ((error as { code?: string }).code === '23503') {
        throw new Error('Esercizio con sedute storiche associate — non può essere eliminato.');
      }
      throw error;
    }
  }
  ```

- [ ] **Step 2:** Aggiorna `remove` in `src/routes/esercizi/[id]/+page.svelte` per mostrare l'errore reale invece del messaggio generico. Sostituisci `remove`:

  ```typescript
  async function remove() {
    if (!existing) return;
    if (!confirm(`Eliminare "${existing.name}"?`)) return;
    try {
      await exercisesStore.remove(existing.id);
      goto('/esercizi/');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore eliminazione');
    }
  }
  ```

- [ ] **Step 3:** Commit:

  ```bash
  git add src/lib/stores/exercises.svelte.ts src/routes/esercizi/[id]/+page.svelte
  git commit -m "feat: protect exercise delete with FK error message"
  ```

---

## Milestone 8 — Tab Allenamento: Schede e giorni (Tasks 32-35)

### Task 32: Home page (lista schede)

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1:** Sostituisci `src/routes/+page.svelte` con la lista delle schede. Riferimento `index.html` `renderHome()` linea 618:

  ```svelte
  <script lang="ts">
    import { goto } from '$app/navigation';
    import { schedeStore } from '$lib/stores/schede.svelte';

    let newName = $state('');
    let creating = $state(false);

    async function createNew() {
      const name = newName.trim();
      if (!name) return;
      creating = true;
      try {
        const scheda = await schedeStore.createScheda(name);
        newName = '';
        goto(`/schede/${scheda.id}/`);
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      } finally {
        creating = false;
      }
    }
  </script>

  <div class="view">
    <h2 class="view-title">Schede</h2>
    <p class="view-sub">{schedeStore.items.length} schede</p>

    {#each schedeStore.items as s (s.id)}
      {@const totalEx = s.days.reduce((acc, d) => acc + d.exerciseIds.length, 0)}
      <button class="card" onclick={() => goto(`/schede/${s.id}/`)} style="display: block; width: 100%; text-align: left;">
        <div class="card-head">
          <h3 class="card-name">{s.name}</h3>
        </div>
        <div class="card-sub">{s.days.length} giorni · {totalEx} esercizi</div>
      </button>
    {/each}

    <form class="card" onsubmit={(e) => { e.preventDefault(); createNew(); }}>
      <input type="text" placeholder="Nome nuova scheda" bind:value={newName} />
      <button type="submit" class="btn primary" disabled={creating || !newName.trim()}>Crea scheda</button>
    </form>
  </div>

  <style>
    input { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; width: 100%; margin-bottom: 12px; }
    .btn.primary { background: var(--ink); color: white; padding: 12px; border-radius: 12px; font-weight: 600; width: 100%; }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Login → vedi lista schede vuota + form. Crea una scheda "Push/Pull/Legs" → atterri su `/schede/<id>/` (404 al momento). Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/+page.svelte
  git commit -m "feat: home page with schede list and create form"
  ```

### Task 33: Scheda detail page

**Files:**
- Create: `src/routes/schede/[id]/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/schede/[id]/+page.svelte`. Riferimento `renderSchedaDetail` linea 656:

  ```svelte
  <script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { schedeStore } from '$lib/stores/schede.svelte';

    const id = $derived(page.params.id);
    const scheda = $derived(schedeStore.getById(id));

    let newDayName = $state('');
    let adding = $state(false);

    async function addDay() {
      const name = newDayName.trim();
      if (!name || !scheda) return;
      adding = true;
      try {
        await schedeStore.addDay(scheda.id, name);
        newDayName = '';
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      } finally {
        adding = false;
      }
    }

    async function rename() {
      if (!scheda) return;
      const next = prompt('Nuovo nome scheda', scheda.name);
      if (!next || next.trim() === scheda.name) return;
      try {
        await schedeStore.renameScheda(scheda.id, next.trim());
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      }
    }

    async function remove() {
      if (!scheda) return;
      if (!confirm(`Eliminare scheda "${scheda.name}"? I giorni vengono eliminati a cascata. Lo storico delle sedute resta.`)) return;
      try {
        await schedeStore.deleteScheda(scheda.id);
        goto('/');
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      }
    }
  </script>

  <div class="view">
    <button class="back" onclick={() => goto('/')}>← Schede</button>
    {#if !scheda}
      <p>Scheda non trovata.</p>
    {:else}
      <div class="subhead">
        <h2 class="view-title" style="flex:1; margin: 0;">{scheda.name}</h2>
        <button class="card-menu" onclick={rename} title="Rinomina">✎</button>
      </div>
      <p class="view-sub">{scheda.days.length} giorni</p>

      <div class="day-chips">
        {#each scheda.days as d (d.id)}
          <button class="day-chip" class:has-ex={d.exerciseIds.length > 0} onclick={() => goto(`/schede/${scheda.id}/days/${d.id}/`)}>
            <span class="dot"></span>
            <span>{d.name}</span>
            <span class="meta">{d.exerciseIds.length}</span>
          </button>
        {/each}
      </div>

      <form class="card" style="margin-top: 16px;" onsubmit={(e) => { e.preventDefault(); addDay(); }}>
        <input type="text" placeholder="Es. Push, Pull, Gambe..." bind:value={newDayName} />
        <button type="submit" class="btn primary" disabled={adding || !newDayName.trim()}>Aggiungi giorno</button>
      </form>

      <button class="btn danger" onclick={remove} style="margin-top: 16px;">Elimina scheda</button>
    {/if}
  </div>

  <style>
    input { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; width: 100%; margin-bottom: 12px; }
    .btn { padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; }
    .btn.primary { background: var(--ink); color: white; width: 100%; }
    .btn.danger { width: 100%; background: transparent; color: var(--accent); border: 1px solid var(--accent); }
    .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
    .card-menu { font-size: 18px; padding: 6px; color: var(--ink-3); }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Home → click scheda creata → vedi nome scheda, lista giorni vuota, form per aggiungere giorno. Aggiungi "Push", "Pull". Verifica che appaiano. Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/schede/[id]/+page.svelte
  git commit -m "feat: scheda detail with day management"
  ```

### Task 34: Day detail page (with exercise picker)

**Files:**
- Create: `src/routes/schede/[id]/days/[dayId]/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/schede/[id]/days/[dayId]/+page.svelte`. Riferimento `renderDayDetail` linea 690 + `renderExercisePicker` linea 757:

  ```svelte
  <script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { schedeStore } from '$lib/stores/schede.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { nextPrescription } from '$lib/domain/progression';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { fmtKg } from '$lib/ui/utils';

    const schedaId = $derived(page.params.id);
    const dayId = $derived(page.params.dayId);
    const day = $derived(schedeStore.getDay(schedaId, dayId));
    const scheda = $derived(schedeStore.getById(schedaId));

    let pickerOpen = $state(false);

    const exercisesInDay = $derived(
      (day?.exerciseIds || []).map((id) => exercisesStore.getById(id)).filter((e): e is NonNullable<typeof e> => !!e)
    );

    const availableExercises = $derived(
      exercisesStore.items.filter((e) => !(day?.exerciseIds || []).includes(e.id))
    );

    async function add(exId: string) {
      if (!day) return;
      try {
        await schedeStore.setDayExercises(schedaId, dayId, [...day.exerciseIds, exId]);
        pickerOpen = false;
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      }
    }

    async function removeFromDay(exId: string) {
      if (!day) return;
      try {
        await schedeStore.setDayExercises(schedaId, dayId, day.exerciseIds.filter((id) => id !== exId));
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      }
    }

    async function renameDay() {
      if (!day) return;
      const next = prompt('Nuovo nome giorno', day.name);
      if (!next || next.trim() === day.name) return;
      await schedeStore.renameDay(schedaId, dayId, next.trim());
    }

    async function deleteDay() {
      if (!day) return;
      if (!confirm(`Eliminare giorno "${day.name}"?`)) return;
      await schedeStore.deleteDay(schedaId, dayId);
      goto(`/schede/${schedaId}/`);
    }

    function startWorkout() {
      goto(`/workout/new/?scheda=${schedaId}&day=${dayId}`);
    }
  </script>

  <div class="view">
    <button class="back" onclick={() => goto(`/schede/${schedaId}/`)}>← {scheda?.name ?? 'Scheda'}</button>
    {#if !day}
      <p>Giorno non trovato.</p>
    {:else}
      <div class="subhead">
        <h2 class="view-title" style="flex:1; margin: 0;">{day.name}</h2>
        <button class="card-menu" onclick={renameDay} title="Rinomina">✎</button>
      </div>
      <p class="view-sub">{exercisesInDay.length} esercizi</p>

      {#each exercisesInDay as ex, idx (ex.id)}
        {@const p = nextPrescription(ex, settingsStore.data)}
        <div class="ex-card removable">
          <span class="order">{idx + 1}</span>
          <div class="info">
            <h3 class="name">{ex.name}</h3>
            <div class="prescription">
              <span class="sets-x-reps">{p.sets}×{p.reps}</span>
              <span class="at">@</span>
              <span class="load">{fmtKg(p.load)}<span class="unit">{settingsStore.data.weightUnit}</span></span>
            </div>
          </div>
          <button class="card-menu" onclick={() => removeFromDay(ex.id)}>✕</button>
        </div>
      {/each}

      {#if !pickerOpen}
        <button class="btn ghost" onclick={() => pickerOpen = true} style="margin-top: 12px;">+ Aggiungi esercizio</button>
      {:else}
        <div class="card">
          <p class="view-sub" style="margin: 0 0 12px;">Scegli esercizio</p>
          {#if availableExercises.length === 0}
            <p style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">Nessun esercizio disponibile.</p>
            <button class="btn primary" onclick={() => goto('/esercizi/new/')}>Crea esercizio</button>
          {:else}
            {#each availableExercises as ex (ex.id)}
              <button class="day-chip" onclick={() => add(ex.id)}>{ex.name}</button>
            {/each}
          {/if}
          <button class="btn ghost" onclick={() => pickerOpen = false} style="margin-top: 12px;">Annulla</button>
        </div>
      {/if}

      <button class="btn primary" onclick={startWorkout} disabled={exercisesInDay.length === 0} style="margin-top: 24px;">
        Inizia seduta
      </button>
      <button class="btn danger" onclick={deleteDay} style="margin-top: 12px;">Elimina giorno</button>
    {/if}
  </div>

  <style>
    .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
    .card-menu { padding: 6px; color: var(--ink-3); }
    .btn { padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; width: 100%; }
    .btn.primary { background: var(--ink); color: white; }
    .btn.ghost { background: var(--bg-elev); color: var(--ink); border: 1px dashed var(--line-strong); }
    .btn.danger { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Crea una scheda con un giorno, crea 2-3 esercizi, vai al giorno, aggiungi gli esercizi → vedi le card con prescription corretta. Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/schede/[id]/days/[dayId]/+page.svelte
  git commit -m "feat: day detail with exercise picker"
  ```

### Task 35: Verify end-to-end flow up to "Inizia seduta"

- [ ] **Step 1:** Verifica manuale:

  Run: `npm run dev`
  Home → crea scheda → crea giorno → crea esercizi → aggiungi al giorno → click "Inizia seduta" → atterri su `/workout/new/?scheda=...&day=...` (404). Stoppa.

  Niente commit, verifica baseline per la Milestone 9.

---

## Milestone 9 — Workout flow (Tasks 36-40)

Vista in cui l'utente registra una seduta. Riferimento `renderWorkout` linea 929 + `renderWorkoutSummary` linea 1004 + `commitWorkout` linea 1632. Questa è la parte funzionalmente più ricca dell'app — porta con cura.

### Task 36: Workout draft store

**Files:**
- Create: `src/lib/stores/workout-draft.svelte.ts`

Lo store di draft tiene lo stato della seduta in corso (non persiste su Supabase finché non si conferma). Vive solo in memoria, come `state.ui.workoutDraft` attuale (linea 324).

- [ ] **Step 1:** Crea `src/lib/stores/workout-draft.svelte.ts`:

  ```typescript
  import type { Entry, Exercise } from '$lib/domain/types';

  export type DraftEntry = {
    exerciseId: string;
    prescribed: Entry['prescribed'];
    sets: Entry['actualSets'];
  };

  export type WorkoutDraft = {
    schedaId: string;
    dayId: string;
    date: string;
    exercises: DraftEntry[];
    currentExIdx: number;
  };

  function createWorkoutDraftStore() {
    const state = $state<{ draft: WorkoutDraft | null; summaryChoices: Record<string, 'repeat' | null> }>({
      draft: null,
      summaryChoices: {}
    });

    function start(
      schedaId: string,
      dayId: string,
      exercises: Exercise[],
      prescriptionForEx: (ex: Exercise) => Entry['prescribed']
    ) {
      state.draft = {
        schedaId,
        dayId,
        date: new Date().toISOString(),
        exercises: exercises.map((ex) => {
          const presc = prescriptionForEx(ex);
          return {
            exerciseId: ex.id,
            prescribed: presc,
            sets: Array.from({ length: presc.sets }, () => ({
              status: null as null,
              reps: presc.reps,
              load: presc.load
            }))
          };
        }),
        currentExIdx: 0
      };
      state.summaryChoices = {};
    }

    function setSet(exIdx: number, setIdx: number, patch: Partial<Entry['actualSets'][number]>) {
      if (!state.draft) return;
      const entry = state.draft.exercises[exIdx];
      entry.sets[setIdx] = { ...entry.sets[setIdx], ...patch };
    }

    function nextExercise() {
      if (!state.draft) return;
      if (state.draft.currentExIdx < state.draft.exercises.length - 1) {
        state.draft.currentExIdx++;
      }
    }

    function prevExercise() {
      if (!state.draft) return;
      if (state.draft.currentExIdx > 0) {
        state.draft.currentExIdx--;
      }
    }

    function setSummaryChoice(exerciseId: string, action: 'repeat' | null) {
      state.summaryChoices[exerciseId] = action;
    }

    function cancel() {
      state.draft = null;
      state.summaryChoices = {};
    }

    return {
      get draft() { return state.draft; },
      get summaryChoices() { return state.summaryChoices; },
      start,
      setSet,
      nextExercise,
      prevExercise,
      setSummaryChoice,
      cancel
    };
  }

  export const workoutDraftStore = createWorkoutDraftStore();
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add src/lib/stores/workout-draft.svelte.ts
  git commit -m "feat: workout draft store"
  ```

### Task 37: Workout in progress page

**Files:**
- Create: `src/routes/workout/new/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/workout/new/+page.svelte`. È la versione SvelteKit di `renderWorkout` (linea 929). Per portare gradualmente, mostra un esercizio alla volta con UI di logging:

  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { schedeStore } from '$lib/stores/schede.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { workoutDraftStore } from '$lib/stores/workout-draft.svelte';
    import { nextPrescription } from '$lib/domain/progression';
    import { fmtKg } from '$lib/ui/utils';
    import type { Exercise } from '$lib/domain/types';

    const schedaId = $derived(page.url.searchParams.get('scheda') ?? '');
    const dayId = $derived(page.url.searchParams.get('day') ?? '');

    onMount(() => {
      if (workoutDraftStore.draft) return; // già in corso, non resettare
      const day = schedeStore.getDay(schedaId, dayId);
      if (!day) {
        alert('Giorno non trovato.');
        goto('/');
        return;
      }
      const exs = day.exerciseIds
        .map((id) => exercisesStore.getById(id))
        .filter((e): e is Exercise => !!e);
      workoutDraftStore.start(schedaId, dayId, exs, (ex) => nextPrescription(ex, settingsStore.data));
    });

    const draft = $derived(workoutDraftStore.draft);
    const currentEntry = $derived(draft?.exercises[draft.currentExIdx]);
    const currentExercise = $derived(
      currentEntry ? exercisesStore.getById(currentEntry.exerciseId) : undefined
    );

    function logSet(idx: number, status: 'ok' | 'fail') {
      if (!draft) return;
      workoutDraftStore.setSet(draft.currentExIdx, idx, { status });
    }

    function updateReps(idx: number, value: number) {
      if (!draft) return;
      workoutDraftStore.setSet(draft.currentExIdx, idx, { reps: value });
    }

    function updateLoad(idx: number, value: number) {
      if (!draft) return;
      workoutDraftStore.setSet(draft.currentExIdx, idx, { load: value });
    }

    function next() {
      workoutDraftStore.nextExercise();
    }

    function prev() {
      workoutDraftStore.prevExercise();
    }

    function finish() {
      goto('/workout/summary/');
    }

    function cancel() {
      if (!confirm('Annullare la seduta? I dati non vengono salvati.')) return;
      workoutDraftStore.cancel();
      goto('/');
    }
  </script>

  {#if !draft || !currentEntry || !currentExercise}
    <div class="view"><p>Caricamento…</p></div>
  {:else}
    {@const isLast = draft.currentExIdx === draft.exercises.length - 1}
    {@const isFirst = draft.currentExIdx === 0}
    <div class="view">
      <button class="back" onclick={cancel}>✕ Annulla seduta</button>
      <p class="view-sub">Esercizio {draft.currentExIdx + 1} di {draft.exercises.length}</p>
      <h2 class="view-title">{currentExercise.name}</h2>

      <div class="card">
        <div class="prescription" style="font-size: 14px; color: var(--ink-2);">
          Target: <strong>{currentEntry.prescribed.sets}×{currentEntry.prescribed.reps}</strong>
          @ <strong>{fmtKg(currentEntry.prescribed.load)} {settingsStore.data.weightUnit}</strong>
          {#if currentEntry.prescribed.isDeload}<span class="card-badge deload">DELOAD</span>{/if}
        </div>
      </div>

      {#each currentEntry.sets as set, i (i)}
        <div class="set-row card" style="display: grid; grid-template-columns: 28px 1fr 1fr auto auto; gap: 8px; align-items: center;">
          <span class="order">{i + 1}</span>
          <label style="flex-direction: column; gap: 2px;">
            <span style="font-size: 9px; color: var(--ink-3);">REPS</span>
            <input type="number" min="0" value={set.reps} oninput={(e) => updateReps(i, +(e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label style="flex-direction: column; gap: 2px;">
            <span style="font-size: 9px; color: var(--ink-3);">KG</span>
            <input type="number" min="0" step={settingsStore.data.plateRounding} value={set.load} oninput={(e) => updateLoad(i, +(e.currentTarget as HTMLInputElement).value)} />
          </label>
          <button class="set-btn ok" class:active={set.status === 'ok'} onclick={() => logSet(i, 'ok')}>✓</button>
          <button class="set-btn fail" class:active={set.status === 'fail'} onclick={() => logSet(i, 'fail')}>✕</button>
        </div>
      {/each}

      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button class="btn secondary" onclick={prev} disabled={isFirst}>← Prec</button>
        {#if isLast}
          <button class="btn primary" onclick={finish}>Concludi seduta →</button>
        {:else}
          <button class="btn primary" onclick={next}>Succ →</button>
        {/if}
      </div>
    </div>
  {/if}

  <style>
    .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
    .set-row input { width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 8px; font-size: 16px; }
    .set-btn { padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font-weight: 600; }
    .set-btn.ok.active { background: var(--success); color: white; border-color: var(--success); }
    .set-btn.fail.active { background: var(--accent); color: white; border-color: var(--accent); }
    .btn { padding: 14px; border-radius: 12px; font-weight: 600; flex: 1; }
    .btn.primary { background: var(--ink); color: white; }
    .btn.secondary { background: var(--bg-elev); color: var(--ink); }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Naviga a un giorno con esercizi → "Inizia seduta" → vedi il primo esercizio, set list con input reps/kg e bottoni ✓/✕. Logga qualche set, naviga Succ/Prec. Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/workout/new/+page.svelte
  git commit -m "feat: workout in-progress page"
  ```

### Task 38: Workout summary page

**Files:**
- Create: `src/routes/workout/summary/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/workout/summary/+page.svelte`. Riferimento `renderWorkoutSummary` linea 1004:

  ```svelte
  <script lang="ts">
    import { goto } from '$app/navigation';
    import { workoutDraftStore } from '$lib/stores/workout-draft.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { workoutsStore } from '$lib/stores/workouts.svelte';
    import { applyEntryResult, entryStatus, weekWasFailed } from '$lib/domain/progression';
    import { fmtKg } from '$lib/ui/utils';
    import type { Entry, ProgressionResult } from '$lib/domain/types';

    const draft = $derived(workoutDraftStore.draft);

    function entryFromDraft(de: NonNullable<typeof draft>['exercises'][number]): Entry {
      return {
        prescribed: de.prescribed,
        actualSets: de.sets,
        isDeloadSession: !!de.prescribed.isDeload
      };
    }

    async function commit() {
      if (!draft) return;
      const entries = draft.exercises.map((de) => {
        const ex = exercisesStore.getById(de.exerciseId);
        const entry = entryFromDraft(de);
        const anyLogged = entry.actualSets.some((s) => s.status !== null);

        let resultInfo: ProgressionResult | null = null;
        let userAction: 'repeat' | null = null;
        if (anyLogged && ex) {
          userAction = workoutDraftStore.summaryChoices[de.exerciseId] ?? null;
          const r = applyEntryResult(ex, entry, userAction, settingsStore.data);
          resultInfo = r.info;
          // applica le mutazioni dell'esercizio
          exercisesStore.update(r.updatedExercise);
        }

        return {
          exerciseId: de.exerciseId,
          position: 0, // sovrascritto dallo store
          prescribed: entry.prescribed,
          actualSets: entry.actualSets,
          userAction,
          resultInfo,
          isDeloadSession: !!entry.isDeloadSession
        };
      });

      try {
        await workoutsStore.commit(draft.schedaId, draft.dayId, draft.date, entries);
        workoutDraftStore.cancel();
        goto('/storico/');
      } catch (err) {
        alert('Errore salvataggio: ' + (err instanceof Error ? err.message : ''));
      }
    }

    function back() {
      goto('/workout/new/');
    }
  </script>

  {#if !draft}
    <div class="view"><p>Nessuna seduta in corso.</p><button onclick={() => goto('/')}>Home</button></div>
  {:else}
    <div class="view">
      <button class="back" onclick={back}>← Modifica</button>
      <h2 class="view-title">Riepilogo seduta</h2>

      {#each draft.exercises as de, idx (de.exerciseId)}
        {@const ex = exercisesStore.getById(de.exerciseId)}
        {@const entry = entryFromDraft(de)}
        {@const status = entryStatus(entry)}
        {@const failed = weekWasFailed(entry)}
        <div class="card">
          <div class="card-head">
            <h3 class="card-name">{ex?.name ?? 'Esercizio'}</h3>
            <span class="badge {status.kind}">{status.text}</span>
          </div>
          <div class="card-sub">
            {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load)} {settingsStore.data.weightUnit}
          </div>
          {#if failed && ex?.scheme === 'wave' && !entry.prescribed.isDeload}
            <div style="margin-top: 12px;">
              <p style="font-size: 12px; color: var(--ink-2);">Settimana fallita. Vuoi ripeterla?</p>
              <label style="display: inline-flex; gap: 6px; margin-right: 12px;">
                <input
                  type="radio"
                  name="action-{de.exerciseId}"
                  value="repeat"
                  checked={workoutDraftStore.summaryChoices[de.exerciseId] === 'repeat'}
                  onchange={() => workoutDraftStore.setSummaryChoice(de.exerciseId, 'repeat')}
                />
                Ripeti settimana
              </label>
              <label style="display: inline-flex; gap: 6px;">
                <input
                  type="radio"
                  name="action-{de.exerciseId}"
                  value="advance"
                  checked={workoutDraftStore.summaryChoices[de.exerciseId] !== 'repeat'}
                  onchange={() => workoutDraftStore.setSummaryChoice(de.exerciseId, null)}
                />
                Avanza
              </label>
            </div>
          {/if}
        </div>
      {/each}

      <button class="btn primary" onclick={commit} style="margin-top: 24px;">Conferma e salva</button>
    </div>
  {/if}

  <style>
    .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
    .btn { padding: 14px; border-radius: 12px; font-weight: 600; width: 100%; }
    .btn.primary { background: var(--ink); color: white; }
    .badge { font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; padding: 4px 10px; border-radius: 8px; }
    .badge.ok { background: var(--success-soft); color: var(--success); }
    .badge.fail { background: var(--accent-soft); color: var(--accent); }
    .badge.partial { background: var(--warn-soft); color: var(--warn); }
  </style>
  ```

- [ ] **Step 2:** Verifica end-to-end:

  Run: `npm run dev`
  Inizia seduta → logga alcuni set (mix ok/fail) → Concludi → Riepilogo. Se hai fallito una settimana wave, vedi la scelta "Ripeti/Avanza". Click "Conferma e salva". Stoppa.

- [ ] **Step 3:** Verifica nel Supabase Dashboard → Table Editor → `workouts` e `workout_entries` che le righe siano state inserite con i dati corretti, e che `exercises` mostri lo stato di progressione avanzato (es. `wave_current_week` da 1 a 2).

- [ ] **Step 4:** Commit:

  ```bash
  git add src/routes/workout/summary/+page.svelte
  git commit -m "feat: workout summary and commit flow"
  ```

### Task 39: Rest timer

**Files:**
- Create: `src/lib/ui/RestTimer.svelte`
- Modify: `src/routes/+layout.svelte`

Il timer di recupero (linee 509-533 di `index.html`) gira sopra tutto. Portalo come componente globale nel layout.

- [ ] **Step 1:** Crea `src/lib/ui/RestTimer.svelte`:

  ```svelte
  <script lang="ts">
    import { onDestroy } from 'svelte';
    import { fmtSec } from './utils';

    let state = $state<{ endTs: number; totalSec: number; exerciseName: string } | null>(null);
    let interval: ReturnType<typeof setInterval> | null = null;
    let remaining = $state(0);

    export function start(seconds: number, exerciseName: string) {
      state = { endTs: Date.now() + seconds * 1000, totalSec: seconds, exerciseName };
      remaining = seconds;
      if (interval) clearInterval(interval);
      interval = setInterval(tick, 250);
    }

    export function stop() {
      if (interval) { clearInterval(interval); interval = null; }
      state = null;
    }

    function tick() {
      if (!state) return;
      remaining = Math.max(0, (state.endTs - Date.now()) / 1000);
      if (remaining <= 0) {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
        stop();
      }
    }

    onDestroy(() => { if (interval) clearInterval(interval); });
  </script>

  {#if state}
    <div class="rest-timer">
      <div class="info">
        <p class="ex">{state.exerciseName}</p>
        <p class="countdown" class:warn={remaining <= 10}>{fmtSec(remaining)}</p>
      </div>
      <button class="dismiss" onclick={stop}>✕</button>
    </div>
  {/if}

  <style>
    .rest-timer {
      position: fixed;
      left: 20px;
      right: 20px;
      bottom: calc(80px + env(safe-area-inset-bottom));
      background: var(--ink);
      color: white;
      padding: 14px 18px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: var(--shadow-lg);
      z-index: 60;
    }
    .info { flex: 1; }
    .ex { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .6; margin: 0; }
    .countdown { font-family: var(--mono); font-size: 28px; font-weight: 500; margin: 2px 0 0; }
    .countdown.warn { color: #FFA500; }
    .dismiss { color: white; padding: 8px; font-size: 18px; }
  </style>
  ```

- [ ] **Step 2:** Esporta una funzione globale per startare il timer. Aggiungi `src/lib/ui/rest-timer-bus.ts`:

  ```typescript
  type Starter = (seconds: number, exerciseName: string) => void;
  let starter: Starter | null = null;

  export function registerRestTimer(fn: Starter) {
    starter = fn;
  }

  export function startRest(seconds: number, exerciseName: string) {
    if (starter) starter(seconds, exerciseName);
  }
  ```

- [ ] **Step 3:** Monta `RestTimer` nel layout. Sostituisci INTEGRALMENTE `src/routes/+layout.svelte` con questa versione finale (include tutte le funzionalità accumulate fino a M9):

  ```svelte
  <script lang="ts">
    import '../styles/globals.css';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { authStore } from '$lib/stores/auth.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { schedeStore } from '$lib/stores/schede.svelte';
    import { workoutsStore } from '$lib/stores/workouts.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import Topbar from '$lib/ui/Topbar.svelte';
    import Tabbar from '$lib/ui/Tabbar.svelte';
    import RestTimer from '$lib/ui/RestTimer.svelte';
    import { registerRestTimer } from '$lib/ui/rest-timer-bus';

    let { children } = $props();
    let storesLoaded = $state(false);
    let restTimer: ReturnType<typeof RestTimer> | undefined = $state();

    onMount(async () => {
      await authStore.init();
    });

    $effect(() => {
      if (authStore.loading) return;
      const isLoginPage = page.url.pathname.startsWith('/login');
      if (!authStore.isAuthenticated && !isLoginPage) { goto('/login/'); return; }
      if (authStore.isAuthenticated && isLoginPage) { goto('/'); return; }
      if (authStore.isAuthenticated && !storesLoaded) { loadStores(); }
    });

    $effect(() => {
      if (restTimer) {
        registerRestTimer((s, n) => restTimer!.start(s, n));
      }
    });

    async function loadStores() {
      try {
        await Promise.all([
          exercisesStore.load(),
          schedeStore.load(),
          workoutsStore.load(),
          settingsStore.load()
        ]);
        storesLoaded = true;
      } catch (err) {
        console.error('Errore caricamento dati', err);
      }
    }

    const showChrome = $derived(
      authStore.isAuthenticated && !page.url.pathname.startsWith('/login') && storesLoaded
    );

    const topbarSubtitle = $derived.by(() => {
      const p = page.url.pathname;
      if (p.startsWith('/esercizi')) return 'Esercizi';
      if (p.startsWith('/storico')) return 'Storico';
      if (p.startsWith('/impostazioni')) return 'Impostazioni';
      if (p.startsWith('/schede')) return 'Scheda';
      if (p.startsWith('/workout')) return 'Seduta';
      return 'Schede';
    });
  </script>

  {#if authStore.loading || (authStore.isAuthenticated && !storesLoaded && !page.url.pathname.startsWith('/login'))}
    <div class="loading">Caricamento…</div>
  {:else}
    {#if showChrome}
      <Topbar subtitle={topbarSubtitle} />
    {/if}
    {@render children()}
    {#if showChrome}
      <Tabbar />
    {/if}
    <RestTimer bind:this={restTimer} />
  {/if}

  <style>
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: #9A9A9F;
    }
  </style>
  ```

- [ ] **Step 4:** Triggera il timer quando si logga un set ok. In `src/routes/workout/new/+page.svelte`, aggiungi:

  ```typescript
  import { startRest } from '$lib/ui/rest-timer-bus';
  ```

  E aggiorna `logSet`:

  ```typescript
  function logSet(idx: number, status: 'ok' | 'fail') {
    if (!draft) return;
    workoutDraftStore.setSet(draft.currentExIdx, idx, { status });
    if (status === 'ok' && currentExercise) {
      startRest(currentExercise.restSeconds, currentExercise.name);
    }
  }
  ```

- [ ] **Step 5:** Verifica:

  Run: `npm run dev`
  Inizia seduta, logga un set ✓ → vedi il timer apparire in basso con countdown. Stoppa con ✕ o aspetta che scada. Stoppa server.

- [ ] **Step 6:** Commit:

  ```bash
  git add src/lib/ui/RestTimer.svelte src/lib/ui/rest-timer-bus.ts src/routes/+layout.svelte src/routes/workout/new/+page.svelte
  git commit -m "feat: rest timer"
  ```

### Task 40: Type check pass

- [ ] **Step 1:** Verifica che tutto type-check'i:

  Run: `npx svelte-check --tsconfig ./tsconfig.json`
  Expected: 0 errors, 0 warnings (warning trascurabili sono OK).

- [ ] **Step 2:** Se ci sono errori, correggili. Se sono molti aggiungi una task ad hoc nel piano.

- [ ] **Step 3:** Commit (solo se ci sono state correzioni):

  ```bash
  git add -A
  git commit -m "chore: fix type-check errors"
  ```

---

## Milestone 10 — Tab Storico (Tasks 41-42)

### Task 41: Storico list page

**Files:**
- Create: `src/routes/storico/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/storico/+page.svelte`. Riferimento `renderHistory` linea 1066:

  ```svelte
  <script lang="ts">
    import { goto } from '$app/navigation';
    import { workoutsStore } from '$lib/stores/workouts.svelte';
    import { schedeStore } from '$lib/stores/schede.svelte';
    import { fmtDate } from '$lib/ui/utils';
  </script>

  <div class="view">
    <h2 class="view-title">Storico</h2>
    <p class="view-sub">{workoutsStore.items.length} sedute</p>

    {#if workoutsStore.items.length === 0}
      <div class="card"><p style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">Nessuna seduta registrata.</p></div>
    {/if}

    {#each workoutsStore.items as w (w.id)}
      {@const scheda = w.schedaId ? schedeStore.getById(w.schedaId) : null}
      {@const day = (scheda && w.dayId) ? scheda.days.find((d) => d.id === w.dayId) : null}
      <button class="card" onclick={() => goto(`/storico/${w.id}/`)} style="display: block; width: 100%; text-align: left;">
        <div class="card-head">
          <h3 class="card-name">{scheda?.name ?? 'Seduta'} {day ? `· ${day.name}` : ''}</h3>
        </div>
        <div class="card-sub">{fmtDate(w.performedAt)} · {w.entries.length} esercizi</div>
      </button>
    {/each}
  </div>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Tab Storico → vedi la seduta registrata nella Task 38. Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/storico/+page.svelte
  git commit -m "feat: storico list page"
  ```

### Task 42: Workout detail page

**Files:**
- Create: `src/routes/storico/[id]/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/storico/[id]/+page.svelte`. Riferimento `renderWorkoutDetail` linea 1093:

  ```svelte
  <script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { workoutsStore } from '$lib/stores/workouts.svelte';
    import { exercisesStore } from '$lib/stores/exercises.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { fmtDate, fmtKg } from '$lib/ui/utils';

    const id = $derived(page.params.id);
    const workout = $derived(workoutsStore.getById(id));
  </script>

  <div class="view">
    <button class="back" onclick={() => goto('/storico/')}>← Storico</button>
    {#if !workout}
      <p>Seduta non trovata.</p>
    {:else}
      <h2 class="view-title">{fmtDate(workout.performedAt)}</h2>
      <p class="view-sub">{workout.entries.length} esercizi</p>

      {#each workout.entries as entry (entry.id)}
        {@const ex = exercisesStore.getById(entry.exerciseId)}
        <div class="card">
          <h3 class="card-name">{ex?.name ?? 'Esercizio eliminato'}</h3>
          <div class="card-sub">
            {entry.prescribed.sets}×{entry.prescribed.reps} @ {fmtKg(entry.prescribed.load)} {settingsStore.data.weightUnit}
            {#if entry.isDeloadSession}<span class="badge deload">DELOAD</span>{/if}
          </div>
          <div style="margin-top: 12px;">
            {#each entry.actualSets as s, i (i)}
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line); font-family: var(--mono); font-size: 13px;">
                <span>{i + 1}.</span>
                <span>{s.reps} × {fmtKg(s.load)}</span>
                <span class:ok={s.status === 'ok'} class:fail={s.status === 'fail'}>
                  {s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : '—'}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <style>
    .back { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); padding: 6px 0; }
    .ok { color: var(--success); }
    .fail { color: var(--accent); }
    .badge.deload { background: var(--warn); color: white; padding: 2px 8px; font-size: 9px; border-radius: 6px; margin-left: 8px; }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Storico → click su una seduta → vedi dettaglio con tutti i set. Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/storico/[id]/+page.svelte
  git commit -m "feat: workout detail page"
  ```

---

## Milestone 11 — Tab Impostazioni (Task 43)

### Task 43: Settings page

**Files:**
- Create: `src/routes/impostazioni/+page.svelte`

- [ ] **Step 1:** Crea `src/routes/impostazioni/+page.svelte`. Riferimento `renderSettings` linea 1130:

  ```svelte
  <script lang="ts">
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { authStore } from '$lib/stores/auth.svelte';
    import { DEFAULT_SETTINGS } from '$lib/domain/types';

    let editing = $state({ ...settingsStore.data });

    async function save() {
      try {
        await settingsStore.update(editing);
        alert('Impostazioni salvate');
      } catch (err) {
        alert('Errore: ' + (err instanceof Error ? err.message : ''));
      }
    }

    function reset() {
      if (!confirm('Ripristinare i valori di default?')) return;
      editing = { ...DEFAULT_SETTINGS };
    }
  </script>

  <div class="view">
    <h2 class="view-title">Impostazioni</h2>

    <div class="card">
      <h3 class="card-name" style="font-size: 18px;">Generale</h3>
      <label>
        Unità di peso
        <select bind:value={editing.weightUnit}>
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </label>
      <label>
        Recupero default (secondi)
        <input type="number" bind:value={editing.defaultRestSec} min="30" step="15" />
      </label>
      <label>
        Arrotondamento dischi
        <input type="number" bind:value={editing.plateRounding} step="0.5" min="0.5" />
      </label>
    </div>

    <div class="card">
      <h3 class="card-name" style="font-size: 18px;">Wave</h3>
      <label>
        Incremento ciclo (%)
        <input type="number" bind:value={editing.waveCycleIncrementPct} step="0.5" min="0" />
      </label>
      <label>
        Soglia hold (n. fallimenti settimane in un ciclo)
        <input type="number" bind:value={editing.cycleHoldThreshold} step="1" min="0" />
      </label>
      <label>
        Soglia reset
        <input type="number" bind:value={editing.cycleResetThreshold} step="1" min="0" />
      </label>
      <label>
        Riduzione su reset (%)
        <input type="number" bind:value={editing.cycleResetPct} step="0.5" min="0" />
      </label>
      <label>
        Deload ogni N cicli
        <input type="number" bind:value={editing.deloadEveryNCycles} step="1" min="0" />
      </label>
      <label>
        Deload: carico (% del prescritto)
        <input type="number" bind:value={editing.deloadLoadPct} step="1" min="0" max="100" />
      </label>
      <label>
        Deload: moltiplicatore sets
        <input type="number" bind:value={editing.deloadSetsMult} step="0.1" min="0" max="1" />
      </label>
      <label>
        Deload: moltiplicatore reps
        <input type="number" bind:value={editing.deloadRepsMult} step="0.1" min="0" max="1" />
      </label>
    </div>

    <div class="card">
      <h3 class="card-name" style="font-size: 18px;">Linear</h3>
      <label>
        Incremento per advance (kg)
        <input type="number" bind:value={editing.linearIncrementKg} step="0.5" min="0" />
      </label>
      <label>
        Riduzione su deload (%)
        <input type="number" bind:value={editing.linearResetPct} step="0.5" min="0" />
      </label>
    </div>

    <div class="card">
      <h3 class="card-name" style="font-size: 18px;">Account</h3>
      <p style="font-size: 13px; color: var(--ink-2);">Loggato come <strong>{authStore.user?.email}</strong></p>
      <button class="btn ghost" onclick={() => authStore.signOut()}>Logout</button>
    </div>

    <div style="display: flex; gap: 8px; margin-top: 24px;">
      <button class="btn secondary" onclick={reset}>Reset default</button>
      <button class="btn primary" onclick={save}>Salva</button>
    </div>
  </div>

  <style>
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; letter-spacing: .04em; color: var(--ink-2); margin-bottom: 12px; }
    input, select { padding: 12px; border: 1px solid var(--line); border-radius: 12px; font-size: 16px; }
    .btn { padding: 14px; border-radius: 12px; font-weight: 600; flex: 1; }
    .btn.primary { background: var(--ink); color: white; }
    .btn.secondary { background: var(--bg-elev); color: var(--ink); }
    .btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); width: 100%; }
  </style>
  ```

- [ ] **Step 2:** Verifica:

  Run: `npm run dev`
  Tab Impostazioni → modifica una soglia → Salva → reload → la modifica persiste (perché letta da Supabase). Stoppa.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/routes/impostazioni/+page.svelte
  git commit -m "feat: settings page"
  ```

---

## Milestone 12 — Deploy su GitHub Pages (Tasks 44-47)

### Task 44: Configure base path for GitHub Pages

**Files:**
- Modify: `svelte.config.js`

- [ ] **Step 1:** Decidi il nome del repo su GitHub (es. `ghisa`). Modifica `svelte.config.js` per usare il base path corretto solo in build di produzione:

  Già pronto in Task 2 con `process.env.BASE_PATH`. Nessuna modifica necessaria al file: il workflow GitHub setta `BASE_PATH=/<repo-name>`.

  Niente commit; verifica che `svelte.config.js` legga `process.env.BASE_PATH`.

### Task 45: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1:** Crea `.github/workflows/deploy.yml`:

  ```yaml
  name: Deploy to GitHub Pages

  on:
    push:
      branches: [main]
    workflow_dispatch:

  permissions:
    contents: read
    pages: write
    id-token: write

  concurrency:
    group: pages
    cancel-in-progress: false

  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'
        - run: npm ci
        - run: npx svelte-check --tsconfig ./tsconfig.json
        - run: npm test
        - name: Build
          env:
            BASE_PATH: '/${{ github.event.repository.name }}'
            PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
            PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.PUBLIC_SUPABASE_ANON_KEY }}
          run: npm run build
        - uses: actions/upload-pages-artifact@v3
          with:
            path: 'build'

    deploy:
      needs: build
      runs-on: ubuntu-latest
      environment:
        name: github-pages
        url: ${{ steps.deployment.outputs.page_url }}
      steps:
        - id: deployment
          uses: actions/deploy-pages@v4
  ```

- [ ] **Step 2:** Commit:

  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "ci: GitHub Pages deploy workflow"
  ```

### Task 46: Configure GitHub Pages settings and secrets (manual)

**Files:** none

- [ ] **Step 1:** L'utente apre GitHub → repo Settings → Pages → "Build and deployment" → Source = **GitHub Actions**.

- [ ] **Step 2:** Settings → Secrets and variables → Actions → "New repository secret". Aggiungi:
  - `PUBLIC_SUPABASE_URL` = valore di Pre-flight P2.
  - `PUBLIC_SUPABASE_ANON_KEY` = valore di Pre-flight P2.

- [ ] **Step 3:** Configura il **Site URL** nel dashboard Supabase: Dashboard → Authentication → URL Configuration → "Site URL" → `https://<username>.github.io/<repo-name>/` (es. `https://render93.github.io/ghisa/`). Aggiungi anche in "Redirect URLs" lo stesso URL — è quello dove Supabase rispedirà l'utente dopo il magic link.

  Senza questa configurazione, i magic link in produzione punteranno a `localhost` e non funzioneranno.

  Niente commit; configurazione esterna.

### Task 47: First deploy and smoke test

**Files:** none

- [ ] **Step 1:** Push del branch corrente su `main`:

  ```bash
  git push origin app:main
  ```

  (Se siamo già su `main`, semplicemente `git push origin main`.)

- [ ] **Step 2:** Vai su GitHub → Actions → osserva il workflow. Expected: build verde, deploy verde.

- [ ] **Step 3:** Apri l'URL `https://<username>.github.io/<repo-name>/` dal cellulare e dal PC. Su entrambi:
  - Atterri sulla login.
  - Inserisci la tua email → ricevi magic link → click → entri.
  - Cellulare e PC mostrano gli stessi dati creati in dev.

  Niente da committare; smoke test produzione.

---

## Milestone 13 — Smoke test finale e check criteri di successo (Task 48)

### Task 48: Verify success criteria

- [ ] **Step 1:** Spunta uno a uno i criteri della spec:

  - [ ] L'app è raggiungibile a un URL GitHub Pages.
  - [ ] Login con magic link funziona da cellulare e PC.
  - [ ] Crei una scheda → ok.
  - [ ] Aggiungi giorni → ok.
  - [ ] Aggiungi esercizi → ok.
  - [ ] Registri una seduta → ok.
  - [ ] Vedi storico → ok.
  - [ ] Modifichi impostazioni → ok.
  - [ ] Una seduta registrata sul cellulare appare sul PC al refresh dell'app.
  - [ ] Il bundle iniziale è sotto i 100 KB gzipped. Verifica:

    Run: `npm run build && ls -lh build/_app/immutable/start.*.js`
    Expected: file gzip sotto 100 KB. Il browser DevTools → Network mostra il payload trasferito.

  - [ ] I test unitari della progression engine passano in CI.
  - [ ] Build e deploy automatici al push su `main`.

- [ ] **Step 2:** Se qualcosa fallisce, apri una task aggiuntiva nel piano per fixare.

- [ ] **Step 3:** Quando tutti i criteri sono verdi, scrivi un breve riepilogo in `docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md` aggiungendo in fondo:

  ```markdown
  ## Stato implementazione

  Completata in data <YYYY-MM-DD>. Vedi `docs/superpowers/plans/2026-05-28-ghisa-framework-storage-plan.md`.
  ```

- [ ] **Step 4:** Commit finale:

  ```bash
  git add docs/superpowers/specs/2026-05-28-ghisa-framework-storage-design.md
  git commit -m "docs: mark spec as implemented"
  ```

---

## Note finali per chi esegue il piano

- **Quando una task è ambigua o un comando fallisce in modo inatteso**, leggi `index.html` linee citate per capire il comportamento target. La spec e il piano sono autorevoli sul "che cosa", ma `index.html` resta la fonte di verità per i dettagli funzionali da preservare.
- **Le UI sono Italian-first**: le stringhe testuali nuove devono rispettare il tono già impostato (concise, lowercase quando sensato, mai eccessivamente formali).
- **Optimistic write**: gli store applicano subito le mutazioni locali, poi scrivono su Supabase. In caso di errore, mostrano `alert()` (placeholder per un toast vero — vedi Future improvements).
- **Future considerations dalla spec NON vanno implementate**: keep-alive, PWA, grafici, export, archiviazione. Sono fuori scope per questa iterazione.
- **`alert()` e `confirm()` nativi** sono usati come placeholder per i modali/toast. Si possono migliorare in una iterazione successiva (es. con `<dialog>` o un componente Toast).
