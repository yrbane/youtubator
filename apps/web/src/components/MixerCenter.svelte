<script lang="ts">
  import ChannelStrip from './ChannelStrip.svelte';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { mixer }: { mixer: Mixer } = $props();

  // BPM affiché : celui de l'horloge si armée, sinon le BPM effectif du deck maître
  const masterDeck = $derived(mixer.decks.find((d) => d.id === mixer.masterId));
  const displayBpm = $derived(
    mixer.clockEnabled
      ? mixer.clockBpm
      : masterDeck?.grid
        ? masterDeck.grid.bpm * masterDeck.effectiveRate
        : null,
  );
</script>

<div class="mixer panel">
  <div class="master" title="Tempo maître : AUTO = le deck maître donne le tempo · CLOCK = l'horloge fait loi, tous les decks SYNC la suivent (le deck maître aussi)">
    <button
      class="clock"
      class:on={mixer.clockEnabled}
      onclick={() => mixer.toggleClock()}
      title={mixer.clockEnabled
        ? 'Horloge armée : son BPM fait loi — clic pour repasser en AUTO (le deck maître donne le tempo)'
        : 'Armer l’horloge maître : elle adopte le BPM du deck maître, puis tous les decks SYNC la suivent'}
    >
      {mixer.clockEnabled ? 'CLOCK' : `AUTO${masterDeck ? ` · ${masterDeck.id}` : ''}`}
    </button>
    <button
      class="step"
      disabled={!mixer.clockEnabled}
      onclick={() => mixer.setClockBpm(mixer.clockBpm - 0.5)}
      title="Ralentir l'horloge de 0,5 BPM (tous les decks SYNC suivent)"
    >
      −
    </button>
    <span class="mono bpm" class:idle={displayBpm === null}>
      {displayBpm === null ? '—' : displayBpm.toFixed(1)}
    </span>
    <button
      class="step"
      disabled={!mixer.clockEnabled}
      onclick={() => mixer.setClockBpm(mixer.clockBpm + 0.5)}
      title="Accélérer l'horloge de 0,5 BPM (tous les decks SYNC suivent)"
    >
      +
    </button>
  </div>
  <div class="strips">
    {#each mixer.decks as deck (deck.id)}
      <ChannelStrip {deck} {mixer} />
    {/each}
  </div>
  <div class="xfader">
    <span class="mono side">A</span>
    <pt-crossfader
      value={mixer.crossfader}
      oninput={(e: CustomEvent<number>) => {
        mixer.crossfader = e.detail;
        mixer.applyVolumes();
      }}
      title="Crossfader (double-clic : centre)"
      aria-label="Crossfader"
    ></pt-crossfader>
    <span class="mono side">B</span>
  </div>
</div>

<style>
  .mixer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }

  /* tempo maître (AUTO / CLOCK) */
  .master {
    display: flex;
    align-items: center;
    gap: 4px;
    align-self: stretch;
    justify-content: center;
  }

  .clock {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text-dim);
    cursor: pointer;
  }

  .clock.on {
    background: var(--yt-deck-c);
    border-color: transparent;
    color: #101318;
  }

  .step {
    width: 18px;
    padding: 2px 0;
    font-size: 11px;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text);
    cursor: pointer;
  }

  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .bpm {
    font-size: 11px;
    font-weight: 700;
    min-width: 42px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .bpm.idle {
    color: var(--yt-text-dim);
  }

  .strips {
    display: flex;
    gap: 6px;
    flex: 1;
    min-height: 0;
    align-self: stretch;
    justify-content: center;
  }

  .xfader {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  pt-crossfader {
    width: 100%;
    max-width: 200px;
    height: 30px;
    --ctl-accent: var(--yt-text);
  }

  .xfader {
    align-self: stretch;
    justify-content: center;
  }

  .side {
    color: var(--yt-text-dim);
    font-weight: 700;
  }
</style>
