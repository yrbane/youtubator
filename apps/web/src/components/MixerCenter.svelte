<script lang="ts">
  import ChannelStrip from './ChannelStrip.svelte';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { mixer }: { mixer: Mixer } = $props();
</script>

<div class="mixer panel">
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
