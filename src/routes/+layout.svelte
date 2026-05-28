<script lang="ts">
  import '../styles/globals.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { nav, relPath } from '$lib/ui/nav';
  import { authStore } from '$lib/stores/auth.svelte';
  import { exercisesStore } from '$lib/stores/exercises.svelte';
  import { schedeStore } from '$lib/stores/schede.svelte';
  import { workoutsStore } from '$lib/stores/workouts.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import Topbar from '$lib/ui/Topbar.svelte';
  import Tabbar from '$lib/ui/Tabbar.svelte';
  import RestTimer from '$lib/ui/RestTimer.svelte';
  import { registerRestTimer } from '$lib/ui/rest-timer-bus';
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();
  let storesLoaded = $state(false);
  let restTimer = $state<RestTimer | undefined>();

  onMount(async () => {
    await authStore.init();
  });

  $effect(() => {
    if (restTimer) {
      registerRestTimer((s, n) => restTimer!.start(s, n));
    }
  });

  $effect(() => {
    if (authStore.loading) return;
    const isLoginPage = relPath(page.url.pathname).startsWith('/login');
    if (!authStore.isAuthenticated && !isLoginPage) {
      nav('/login/');
      return;
    }
    if (authStore.isAuthenticated && isLoginPage) {
      nav('/');
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

  const showChrome = $derived(
    authStore.isAuthenticated && !relPath(page.url.pathname).startsWith('/login') && storesLoaded
  );

  const topbarSubtitle = $derived.by(() => {
    const p = relPath(page.url.pathname);
    if (p.startsWith('/esercizi')) return 'Esercizi';
    if (p.startsWith('/storico')) return 'Storico';
    if (p.startsWith('/impostazioni')) return 'Impostazioni';
    if (p.startsWith('/schede')) return 'Scheda';
    if (p.startsWith('/workout')) return 'Seduta';
    return 'Schede';
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if authStore.loading || (authStore.isAuthenticated && !storesLoaded && !relPath(page.url.pathname).startsWith('/login'))}
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
