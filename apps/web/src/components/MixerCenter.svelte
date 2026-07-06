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
    <yt-crossfader
      value={mixer.crossfader}
      oninput={(e: CustomEvent<number>) => {
        mixer.crossfader = e.detail;
        mixer.applyVolumes();
      }}
      title="Crossfader (double-clic : centre)"
      aria-label="Crossfader"
    ></yt-crossfader>
    <span class="mono side">B</span>
  </div>
</div>

<style>
  .mixer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    align-items: center;
  }

  .strips {
    display: flex;
    gap: 8px;
    flex: 1;
  }

  .xfader {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  yt-crossfader {
    width: 180px;
    height: 34px;
    --ctl-accent: var(--yt-text);
  }

  .side {
    color: var(--yt-text-dim);
    font-weight: 700;
  }
</style>
