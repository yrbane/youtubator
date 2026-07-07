<script lang="ts">
  import { SORT_KEYS, type SortKey } from '../lib/track-meta.js';

  export interface Sort {
    key: SortKey;
    dir: 1 | -1;
  }

  let {
    sort,
    onSort,
  }: {
    sort: Sort | null;
    onSort: (key: SortKey) => void;
  } = $props();
</script>

<div class="sortbar" role="toolbar" aria-label="Tri des colonnes">
  <span class="lbl">Trier</span>
  {#each SORT_KEYS as [key, label] (key)}
    <button
      class:on={sort?.key === key}
      onclick={() => onSort(key)}
      title="Trier par {label.toLowerCase()} — 2ᵉ clic : sens inverse, 3ᵉ : ordre d'origine"
    >
      {label}{sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </button>
  {/each}
</div>

<style>
  .sortbar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 4px 10px;
    border-bottom: 1px solid var(--yt-border);
  }

  .lbl {
    color: var(--yt-text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  button {
    background: none;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--yt-text-dim);
    font-size: 11px;
    padding: 1px 8px;
    cursor: pointer;
  }

  button:hover {
    color: var(--yt-text);
  }

  button.on {
    color: var(--yt-deck-a);
    border-color: var(--yt-deck-a);
  }
</style>
