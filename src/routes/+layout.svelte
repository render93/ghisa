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
  import favicon from '$lib/assets/favicon.svg';

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

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

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
