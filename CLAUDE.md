# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ghisa — a single-user, Italian-language workout diary deployed as a static SPA on GitHub Pages with Supabase as the persistence + auth layer. The repo also still contains the original `index.html` (pre-refactor single-file app) at the root — it is **not** the runtime any more; the running app is the SvelteKit project. Do not edit `index.html` for app changes.

The refactor plan and design spec live in `docs/superpowers/plans/` and `docs/superpowers/specs/`. They describe how the current architecture was built milestone by milestone; useful as context but not authoritative for current state.

## Stack

SvelteKit 2 · Svelte 5 (runes mode, enforced project-wide in `svelte.config.js`) · TypeScript · Vite · Vitest · `@supabase/supabase-js` · `adapter-static` (SPA fallback). No SSR, no prerendering — `src/routes/+layout.ts` disables both globally, and `trailingSlash = 'always'` is on, so always include a trailing slash when calling `goto()`.

## Commands

- `npm run dev` — dev server on `:5173`
- `npm run build` — static build into `build/` (reads `BASE_PATH` env var for GitHub Pages path prefix)
- `npm run preview` — serve the built bundle locally
- `npm run check` — `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json` (TS + Svelte type check; the CI workflow runs the bare `svelte-check`, but locally always use this so generated files are refreshed)
- `npm test` — run Vitest once
- `npm test -- src/lib/domain/progression.test.ts` — run a single test file
- `npm test -- -t "wave-cycle-end"` — filter by test name
- `npm run test:watch` — Vitest in watch mode

Env vars (in `.env.local`, never committed): `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`. Both are baked into the bundle at build time via `$env/static/public` — the anon key is safe to ship because RLS is the security boundary.

## Architecture

### Auth gate + store hydration (single point of control)

`src/routes/+layout.svelte` is the entire app shell. On mount it calls `authStore.init()`, then a single `$effect` reacts to the auth state:

- not authenticated + not on `/login/` → redirect to `/login/`
- authenticated + on `/login/` → redirect to `/`
- authenticated + stores not yet loaded → `loadStores()` calls `.load()` in parallel on `exercisesStore`, `schedeStore`, `workoutsStore`, `settingsStore`

`Topbar` + `Tabbar` + a global `RestTimer` are only rendered when authenticated and stores are loaded. Every route component can assume the stores are hydrated.

### Stores — module-level singletons, Svelte 5 runes outside `.svelte`

All stores live in `src/lib/stores/*.svelte.ts`. The `.svelte.ts` extension is **required** for `$state`/`$derived`/`$effect` runes to work in non-component files; do not rename to `.ts`.

Each store is a closure that exposes getters + async mutators. Mutators follow the same shape: **optimistic in-memory update first, Supabase round-trip second, rollback on error**. See `exercises.svelte.ts` `update()` / `remove()` for the canonical pattern.

Stores wrap Supabase rows in a domain shape via `dbToDomain` / `domainToDb` helpers (snake_case columns ↔ camelCase TS types). The auto-generated `src/lib/database.types.ts` is the source of truth for column shapes — regenerate it after every schema change.

### Domain layer — pure functions, fully unit-tested

`src/lib/domain/progression.ts` holds the wave + linear progression engines as pure functions taking `Exercise`, `Entry`, `Settings` and returning a new `Exercise` + a `ProgressionResult` discriminated union. No I/O, no global state, no mutation of inputs. `progressionVersion = 2` selects the current engine; missing/v1 state is converted lazily by `ensureProgressionV2` at the first useful commit without rewriting history.

Wave v2 stores five authoritative plate loads in `Exercise.waveCycleLoads`. Actual loads determine consolidation, rebase or an automatic reduced repeat; there is no manual repeat/advance choice. Linear v2 uses the fixed 25% tolerance: full success adds two physical steps, tolerated success adds one, the first failure holds and the second consecutive failure reduces total load by 5%.

Two functions must stay in lock-step:
- `nextPrescription(ex, settings)` — computes the prescription **shown before** a session.
- `applyEntryResult(ex, entry, userAction, settings)` — computes the new exercise state **after** a session.

If you change one, run the Vitest suite (`progression.test.ts`) and update the other. The tests cover all wave week/cycle transitions (advance, repeat-week, hold, reset, deload trigger, deload completion) and the linear advance/repeat/deload paths.

### Workout flow — transient draft → atomic commit

A workout in progress is **not** persisted. It lives in `workout-draft.svelte.ts` (`workoutDraftStore.draft`), populated when the user starts a session in `/workout/new/`. Each set logged updates the draft in memory only.

The draft becomes a real DB record only when the user confirms in `/workout/summary/`:
1. For each entry with any logged set, `applyEntryResult(...)` computes the updated exercise + versioned result info; the component collects the entries and the advanced exercises. Wave outcomes are automatic and previewed in the summary.
2. A single transactional RPC — `supabase.rpc('commit_workout', ...)` via `workoutsStore.commit(...)` — inserts one `workouts` row + N `workout_entries` rows **and** advances the exercises' progression, all in one Postgres transaction (all-or-nothing).
3. On success the in-memory exercise state is synced via `exercisesStore.applyLocal(...)` (no extra DB round-trip), the draft is cleared, and the user is sent to `/storico/`. On failure nothing is written, the draft is kept, and a retry is clean.

A `saving` flag disables the confirm button to prevent double-submit. This is the **only** place exercise progression state advances. If you add a new mutation path, route it through the same `commit_workout` RPC or progression state will desync from history.

### Rest timer — singleton via event bus

`<RestTimer>` is mounted once in the root layout. Any component can trigger it without prop-drilling by calling `startRest(seconds, exerciseName)` from `src/lib/ui/rest-timer-bus.ts`. The layout registers the starter on mount; calls before registration are silently dropped.

### Persistence + schema changes

Schema migrations are SQL files in `supabase/migrations/`. The repo does **not** apply them automatically — the migration is hand-run in the Supabase SQL Editor (see `docs/superpowers/plans/...`). Progression v2 requires both additive `exercises.progression_version` / `exercises.wave_cycle_loads` columns and the matching `commit_workout` RPC update; never deploy the new writer between those two operations. After applying:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```

All 6 tables have RLS policies of the form `auth.uid() = user_id` — single-tenant by construction. There is no service-role usage anywhere in the frontend; if you find yourself wanting one, stop and reconsider.

### Deploy

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on push to `main`. The workflow:
1. `npm ci`
2. `npx svelte-check --tsconfig ./tsconfig.json`
3. `npm test`
4. `npm run build` with `BASE_PATH=/<repo-name>` + Supabase secrets from repo secrets
5. Uploads `build/` as the Pages artifact and deploys

The Supabase **Site URL** and **Redirect URLs** must include the production GitHub Pages URL with trailing slash. Redirect URLs must also allow `http://localhost:5173/**` for local magic-link login. The client explicitly derives `emailRedirectTo` from the current origin and SvelteKit base path.

## Conventions

- UI strings are Italian — concise, mostly lowercase, sentence-style. Match the existing tone when adding copy.
- **Pull Request title and body must be written in English** (the squash/merge commit derived from the PR follows suit). This is the one deliverable that is English: in-app UI copy and individual git commit messages stay Italian, as the existing history shows.
- Bottom tabbar exposes four sections, mapped to routes: `Allenamento` → `/`, `Esercizi` → `/esercizi/`, `Storico` → `/storico/`, `Impostazioni` → `/impostazioni/`.
- `alert()` / `confirm()` calls are intentional placeholders for future toast/modal components — don't replace them piecemeal; do all of them in one pass when the toast component lands.
- When a store needs the current user id, it calls `supabase.auth.getUser()` directly rather than reading from `authStore`. Keep this pattern — it ensures every write is double-checked against the live session, not stale store state.
- Plate rounding, default rest seconds and deload settings live in `Settings` and are read at use-site from `settingsStore.data`. The progression failure tolerance is the intentional exception: it is a fixed 25% domain rule shared by wave and linear and must not be exposed as a setting.
