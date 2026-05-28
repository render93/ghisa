<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authStore } from '$lib/stores/auth.svelte';
  import favicon from '$lib/assets/favicon.svg';

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

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

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
