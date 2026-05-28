## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: none

---

## Project

Ghisa — a single-file, Italian-language workout diary. The entire application lives in `index.html`: HTML shell, CSS (lines ~12–273), and vanilla JS (lines ~279–1683). There is no build step, no package manager, no test suite, and no framework.

## Running

Open `index.html` in a browser. The app expects a `window.storage` API to exist — see "Storage" below.

## Architecture

The whole app is a single `state` object plus a render-everything-from-scratch loop.

- **Single state tree** (`state`, ~line 309): `exercises`, `schede` (workout plans), `workouts` (logged sessions), `settings`, plus a `ui` sub-object that holds the current view, active IDs, draft workouts, and modal state. There is no component tree — `ui.view` is a string and the dispatcher in `render()` (~line 538) picks one `renderXxx()` function to produce an HTML string.
- **Render cycle**: every state change calls `render()`, which sets `app.innerHTML` and then `attachHandlers()` (~line 1261) re-binds events by walking `data-*` attributes. There is no diffing — all handlers must be reattached every render. The rest timer is the only thing rendered incrementally (`renderTimer`, ~line 567) to avoid wiping input focus during a workout.
- **Workout flow**: a workout in progress lives in `state.ui.workoutDraft` (transient, not persisted). When the user finishes, `commitWorkout()` (~line 1632) runs `applyEntryResult()` for each exercise (mutating the exercise's progression state), pushes a `workout` record into `state.workouts`, and saves. This is the only place exercise progression state is advanced.

### Progression engines

Both schemes live in `applyEntryResult()` (~line 442) and are driven by `state.settings`:

- **wave** — 5-week cycle following `WAVE_PATTERN` (sets/reps/mult table at line 284). Each completed cycle multiplies `waveBaseLoad` by `(1 + waveCycleIncrementPct/100)`. Failures within a cycle accumulate in `ex.cycleFailures`; at cycle end this triggers `hold` (≥ `cycleHoldThreshold`) or `reset` (≥ `cycleResetThreshold`, drops base by `cycleResetPct`). Every `deloadEveryNCycles` successful cycles sets `pendingDeload`, which scales the next session's load/sets/reps down.
- **linear** — fixed sets×reps at `linearCurrentLoad`. Full completion → `+linearIncrementKg`. Two consecutive failures → load drops by `linearResetPct`.

When editing progression logic, also check `nextPrescription()` (~line 411), which computes the *prescribed* values shown before a workout — the two functions must stay in sync.

### Storage

Persistence goes through `window.storage.get/set/delete` (async, returns `{value: string}`) — **not** `localStorage`. This is the Claude.ai artifact storage API; the app is designed to run as an artifact. If running outside that environment, you'll need to shim `window.storage` (a `localStorage`-backed adapter works).

`STORAGE_KEY = 'ghisa-state-v2'`. On load, missing v2 data triggers a one-shot migration from `'ghisa-state-v1'` (`loadState()`, ~line 335) that converts the legacy per-exercise `sessions` array into orphan `workouts` (with `schedaId/dayId = null` and `legacy: true`). Keep this migration in place — it's the only path for existing users.

When changing the state shape, bump `STORAGE_KEY` and add a migration rather than silently breaking existing data.

## Conventions

- UI strings are Italian. Match the existing tone (concise, lowercase, sentence-style) when adding new copy.
- The bottom tab bar exposes four sections: `allenamento`, `esercizi`, `storico`, `impostazioni` (`state.ui.tab`). Views are grouped by tab — keep new views consistent with their tab's section.
- IDs use the `uid(prefix)` helper (~line 389): `ex_`, `sch_`, `day_`, `w_`. Workouts migrated from v1 keep the `w_` prefix with the original ID appended.
- Always call `saveState()` after mutating `state.exercises | schede | workouts | settings`, and call `render()` after any state change that affects the UI.
- All user-supplied text rendered into HTML must go through `escapeHtml()` (~line 404).
