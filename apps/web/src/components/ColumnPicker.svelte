<script lang="ts">
  import { COLUMN_DEFS } from '../lib/ui-prefs.js';
  import { ui } from '../lib/ui.svelte.js';
</script>

<details class="colpick">
  <summary title="Choisir les colonnes affichées dans les listes (le titre est toujours là) — choix mémorisé">
    ⚏ Colonnes
  </summary>
  <div class="pop">
    {#each COLUMN_DEFS as col (col.id)}
      <label>
        <input
          type="checkbox"
          checked={ui.columns.includes(col.id)}
          onchange={() => ui.toggleColumn(col.id)}
        />
        {col.label}
      </label>
    {/each}
  </div>
</details>

<style>
  .colpick {
    position: relative;
  }

  summary {
    list-style: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--yt-text-dim);
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 1px 8px;
  }

  summary:hover {
    color: var(--yt-text);
  }

  .colpick[open] summary {
    color: var(--yt-deck-a);
    border-color: var(--yt-deck-a);
  }

  .pop {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    background: var(--yt-panel);
    border: 1px solid var(--yt-border);
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
  }
</style>
