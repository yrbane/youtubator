<script lang="ts">
  let { name, url = null, size = 24 }: { name: string; url?: string | null; size?: number } = $props();

  let failed = $state(false);

  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
  // couleur stable dérivée du nom (accents des decks)
  const PALETTE = ['#19c2ff', '#ff8a1e', '#3ddc84', '#b18aff', '#ff4d5e', '#ffcc33'];
  const color = $derived(
    PALETTE[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % PALETTE.length, 0)] ?? '#19c2ff',
  );
</script>

{#if url && !failed}
  <img
    src={url}
    alt={name}
    title={name}
    width={size}
    height={size}
    referrerpolicy="no-referrer"
    onerror={() => (failed = true)}
    style="--size: {size}px"
  />
{:else}
  <span class="initial" title={name} style="--size: {size}px; background: {color}">{initial}</span>
{/if}

<style>
  img,
  .initial {
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 2px var(--yt-border);
  }

  .initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #101318;
    font-weight: 800;
    font-size: calc(var(--size) * 0.55);
    user-select: none;
  }
</style>
