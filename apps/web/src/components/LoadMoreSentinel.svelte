<script lang="ts">
  let {
    hasMore,
    loading,
    doneLabel = '',
    onMore,
  }: {
    hasMore: boolean;
    loading: boolean;
    /** Message de fin de liste ('' = rien). */
    doneLabel?: string;
    onMore: () => void;
  } = $props();

  let sentinel = $state<HTMLElement | null>(null);

  // sentinelle en fin de liste : visible → charge la suite
  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

{#if hasMore}
  <div class="sentinel" bind:this={sentinel}></div>
{/if}
{#if loading}
  <p class="hint">⏳ Chargement des plus anciens…</p>
{:else if hasMore}
  <p class="hint">Fais défiler pour charger la suite.</p>
{:else if doneLabel}
  <p class="hint">{doneLabel}</p>
{/if}

<style>
  /* invisible : ne sert qu'à déclencher le chargement de la suite */
  .sentinel {
    height: 1px;
  }

  .hint {
    color: var(--yt-text-dim);
    padding: 8px 10px;
    font-size: 11px;
  }
</style>
