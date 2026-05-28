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
