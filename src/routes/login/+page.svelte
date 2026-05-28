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
