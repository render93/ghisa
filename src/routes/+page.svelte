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
