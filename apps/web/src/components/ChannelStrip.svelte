<script lang="ts">
  import type { EqBand } from '@youtubator/audio-engine';
  import type { Deck } from '../lib/deck.svelte.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { deck, mixer }: { deck: Deck; mixer: Mixer } = $props();

  const accent = $derived(`var(${deck.colorVar})`);
  const BANDS: Array<{ band: EqBand; label: string }> = [
    { band: 'high', label: 'HI' },
    { band: 'mid', label: 'MID' },
    { band: 'low', label: 'LOW' },
  ];
</script>

<div class="strip" style="--ctl-accent: {accent}">
  <span class="deck-id mono" style="color: {accent}">{deck.id}</span>

  <div class="eq" class:disabled={!deck.hasExtension} title={deck.hasExtension ? '' : 'EQ : installe l’extension Youtubator'}>
    {#each BANDS as { band, label } (band)}
      <div class="band">
        <pt-knob
          min="-12"
          max="12"
          value={deck.eqGains[band]}
          default="0"
          oninput={(e: CustomEvent<number>) => deck.setEqGain(band, e.detail)}
          aria-label="EQ {label} deck {deck.id}"
        ></pt-knob>
        <button
          class="kill mono"
          class:on={deck.kills[band]}
          onclick={() => deck.toggleKill(band)}
          disabled={!deck.hasExtension}
          title="Kill {label}"
        >
          {label}
        </button>
      </div>
    {/each}
  </div>

  <div class="band filter" class:disabled={!deck.hasExtension} title={deck.hasExtension ? 'Filtre : gauche LP, droite HP, double-clic neutre' : 'Filtre : installe l’extension Youtubator'}>
    <pt-knob
      min="-1"
      max="1"
      value={deck.filterValue}
      default="0"
      label="FILTER"
      oninput={(e: CustomEvent<number>) => deck.setFilter(e.detail)}
      aria-label="Filtre deck {deck.id}"
      style="--ctl-accent: var(--yt-deck-d)"
    ></pt-knob>
  </div>

  <div class="band echo" class:disabled={!deck.hasExtension || !deck.grid} title={deck.grid ? 'Delay calé sur le BPM' : 'Delay : BPM requis (extension + ~15 s de lecture)'}>
    <pt-knob
      min="0"
      max="1"
      value={deck.delayWet}
      default="0"
      label="ECHO"
      oninput={(e: CustomEvent<number>) => {
        deck.delayWet = e.detail;
        deck.applyDelay();
      }}
      aria-label="Delay deck {deck.id}"
      style="--ctl-accent: var(--yt-deck-b)"
    ></pt-knob>
    <pt-stepper
      options="1/4,1/2,3/4,1"
      value={deck.delayBeats}
      onchange={(e: CustomEvent<string>) => {
        deck.delayBeats = e.detail;
        deck.applyDelay();
      }}
      aria-label="Fraction du delay deck {deck.id}"
    ></pt-stepper>
  </div>

  <div class="fader-row">
    <pt-fader
      min="0"
      max="1"
      value={deck.volume}
      default="0.8"
      oninput={(e: CustomEvent<number>) => {
        deck.volume = e.detail;
        mixer.applyVolumes();
      }}
      aria-label="Volume deck {deck.id}"
    ></pt-fader>
    <pt-vumeter level={deck.meterLevel}></pt-vumeter>
  </div>
</div>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 6px;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 6px;
  }

  .deck-id {
    font-weight: 800;
    font-size: 12px;
  }

  .eq {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }

  .eq.disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  .band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  pt-knob {
    width: 40px;
    height: 40px;
  }

  .filter {
    margin-top: 2px;
  }

  .filter pt-knob {
    height: 52px;
  }

  .filter.disabled,
  .echo.disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  .echo pt-knob {
    height: 52px;
  }

  .echo pt-stepper {
    font-size: 9px;
  }

  .kill {
    font-size: 9px;
    padding: 1px 6px;
    background: transparent;
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text-dim);
    cursor: pointer;
    letter-spacing: 0.08em;
  }

  .kill.on {
    background: var(--yt-danger);
    border-color: transparent;
    color: #101318;
    font-weight: 700;
  }

  .fader-row {
    display: flex;
    gap: 4px;
    align-items: stretch;
  }

  pt-fader {
    width: 34px;
    height: 140px;
  }

  pt-vumeter {
    width: 8px;
    height: 140px;
  }
</style>
