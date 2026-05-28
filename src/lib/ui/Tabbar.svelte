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
