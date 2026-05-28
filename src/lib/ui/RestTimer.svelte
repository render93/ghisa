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
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
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

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
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
  .info {
    flex: 1;
  }
  .ex {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.6;
    margin: 0;
  }
  .countdown {
    font-family: var(--mono);
    font-size: 28px;
    font-weight: 500;
    margin: 2px 0 0;
  }
  .countdown.warn {
    color: #ffa500;
  }
  .dismiss {
    color: white;
    padding: 8px;
    font-size: 18px;
  }
</style>
