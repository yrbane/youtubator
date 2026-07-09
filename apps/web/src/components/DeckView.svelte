<script lang="ts">
  import { formatRate, rateToSemitones } from '@youtubator/audio-engine';
  import { formatDuration } from '../lib/tracks.js';
  import type { Deck } from '../lib/deck.svelte.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    deck,
    mixer,
    onDropTrack,
  }: {
    deck: Deck;
    mixer: Mixer;
    /** Un morceau du browser est déposé sur ce deck (glisser-déposer façon Traktor). */
    onDropTrack?: (trackJson: string) => void;
  } = $props();

  // survol pendant un glisser-déposer de morceau
  let dropHover = $state(false);

  function onDragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('application/x-youtubator-track')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropHover = true;
  }

  function onDrop(e: DragEvent): void {
    dropHover = false;
    const data = e.dataTransfer?.getData('application/x-youtubator-track');
    if (!data) return;
    e.preventDefault();
    onDropTrack?.(data);
  }

  let container: HTMLDivElement;

  $effect(() => {
    deck.attach(container);
  });

  const accent = $derived(`var(${deck.colorVar})`);
  const progress = $derived(deck.durationS > 0 ? deck.currentTimeS / deck.durationS : 0);
  const semitones = $derived(rateToSemitones(deck.effectiveRate));

  function onSeek(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    deck.seekFraction((e.clientX - rect.left) / rect.width);
  }

  function onTempoInput(e: Event): void {
    void deck.setRate((e as CustomEvent<number>).detail, mixer.tempoRange);
    mixer.refresh();
  }
</script>

<article
  class="deck panel"
  class:drop-hover={dropHover}
  style="--accent: {accent}"
  data-state={deck.state}
  ondragover={onDragOver}
  ondragleave={() => (dropHover = false)}
  ondrop={onDrop}
>
  <header>
    <span class="badge">{deck.id}</span>
    <span class="title" title={deck.track?.title ?? ''}>
      {deck.track?.title ?? 'Aucun morceau — route un résultat depuis le bas ↓'}
    </span>
    {#if deck.id === mixer.masterId}
      <span class="master">MASTER</span>
    {/if}
    {#if mixer.decks.length > 2}
      <button class="btn close" onclick={() => mixer.removeDeck(deck.id)} title="Retirer ce deck">✕</button>
    {/if}
  </header>

  <div class="body">
    <div class="video-zone">
      <div class="video" bind:this={container}>
        {#if !deck.track}
          <div class="placeholder">▶ YouTube</div>
        {/if}
      </div>

      <div
        class="progress"
        onclick={onSeek}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class="fill" style="width: {progress * 100}%"></div>
      </div>

      <div class="infos mono">
        <span>{formatDuration(deck.currentTimeS)} / {formatDuration(deck.durationS)}</span>
        <span class="rate">
          {formatRate(deck.effectiveRate)}
          {#if deck.tempoMode === 'vinyl' && Math.abs(semitones) > 0.01}
            ({semitones > 0 ? '+' : ''}{semitones.toFixed(1)} st)
          {/if}
        </span>
      </div>

      <div class="transport" style="--ctl-accent: {accent}">
        <pt-button onpress={() => deck.cue()} title="Retour au point de cue">CUE</pt-button>
        <pt-button
          class:active={deck.isPlaying}
          onpress={() => {
            deck.togglePlay();
            mixer.refresh();
          }}
        >
          {deck.isPlaying ? '❚❚' : '▶'}
        </pt-button>
        <pt-button
          toggle
          active={deck.synced}
          onchange={(e: CustomEvent<boolean>) => {
            deck.synced = e.detail;
            mixer.refresh();
          }}
        >
          SYNC
        </pt-button>
        <div class="mode" title={deck.hasExtension ? '' : 'Nécessite l’extension Youtubator'}>
          <button
            class="btn"
            class:on={deck.tempoMode === 'master-tempo'}
            disabled={!deck.hasExtension}
            onclick={() => deck.setTempoMode('master-tempo')}
            title="Master Tempo : la tonalité reste constante"
          >
            MT
          </button>
          <button
            class="btn"
            class:on={deck.tempoMode === 'vinyl'}
            disabled={!deck.hasExtension}
            onclick={() => deck.setTempoMode('vinyl')}
            title="Vinyle : le pitch suit la vitesse"
          >
            VINYL
          </button>
        </div>
        <div class="nudge">
          <button
            class="btn"
            onpointerdown={() => mixer.nudge(deck, -1, true)}
            onpointerup={() => mixer.nudge(deck, -1, false)}
            onpointerleave={() => mixer.nudge(deck, -1, false)}
            title="Nudge −"
          >
            −
          </button>
          <button
            class="btn"
            onpointerdown={() => mixer.nudge(deck, 1, true)}
            onpointerup={() => mixer.nudge(deck, 1, false)}
            onpointerleave={() => mixer.nudge(deck, 1, false)}
            title="Nudge +"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <div class="tempo" style="--ctl-accent: {accent}">
      <pt-fader
        min={1 - mixer.tempoRange}
        max={1 + mixer.tempoRange}
        value={deck.rate}
        default="1"
        oninput={onTempoInput}
        title="Tempo (double-clic : ×1.00)"
      ></pt-fader>
      <span class="mono label">TEMPO</span>
    </div>
  </div>
</article>

<style>
  .deck.drop-hover {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }

  .deck {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-top: 2px solid var(--accent);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--yt-border);
  }

  .badge {
    background: var(--accent);
    color: #101318;
    font-weight: 800;
    border-radius: 4px;
    padding: 1px 8px;
  }

  .title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .master {
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
  }

  .close {
    padding: 2px 6px;
  }

  .body {
    display: flex;
    gap: 8px;
    padding: 8px;
    flex: 1;
    min-height: 0;
  }

  .video-zone {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .video {
    aspect-ratio: 16 / 9;
    background: #000;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }

  .video :global(iframe) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--yt-text-dim);
  }

  .progress {
    height: 8px;
    background: var(--yt-panel-deep);
    border-radius: 4px;
    cursor: pointer;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
  }

  .infos {
    display: flex;
    justify-content: space-between;
    color: var(--yt-text-dim);
    font-size: 11px;
  }

  .rate {
    color: var(--yt-text);
  }

  .transport {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .mode,
  .nudge {
    display: flex;
    gap: 2px;
  }

  .btn.on {
    background: var(--accent);
    color: #101318;
    border-color: transparent;
  }

  .btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .tempo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .tempo pt-fader {
    width: 36px;
    flex: 1;
    min-height: 120px;
  }

  .label {
    font-size: 9px;
    color: var(--yt-text-dim);
    letter-spacing: 0.12em;
  }
</style>
