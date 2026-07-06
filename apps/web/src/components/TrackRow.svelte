<script lang="ts">
  import { formatDuration, type Track } from '../lib/tracks.js';
  import { ghost } from '../lib/ghost.svelte.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    track,
    mixer,
    favorite = false,
    by = '',
    onRoute,
    onToggleFavorite,
  }: {
    track: Track;
    mixer: Mixer;
    favorite?: boolean;
    by?: string;
    onRoute: (track: Track, deckId: string) => void;
    onToggleFavorite: (track: Track) => void;
  } = $props();
</script>

<div class="row">
  <img src={track.thumbnailUrl} alt="" loading="lazy" />
  <div class="meta">
    <span class="title" title={track.title}>{track.title}</span>
    <span class="channel">
      {track.channel}
      {#if by}<span class="by" title="Ajouté par {by}">· {by}</span>{/if}
    </span>
  </div>
  <span class="mono duration">{formatDuration(track.durationS)}</span>
  <div class="actions">
    {#each mixer.decks as deck (deck.id)}
      <button
        class="btn route"
        style="--accent: var({deck.colorVar})"
        onclick={() => onRoute(track, deck.id)}
        title="Charger sur le deck {deck.id}"
      >
        →{deck.id}
      </button>
    {/each}
    <button
      class="btn zap"
      onclick={() => ghost.enqueue(track)}
      title="Pré-analyser (waveform, BPM, tonalité) en silence, sans occuper un deck"
    >
      ⚡
    </button>
    <button
      class="btn star"
      class:on={favorite}
      onclick={() => onToggleFavorite(track)}
      title="Favori — synchronisé avec les « J'aime » du compte YouTube actif"
    >
      {favorite ? '★' : '☆'}
    </button>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--yt-border);
  }

  .row:hover {
    background: var(--yt-panel-deep);
  }

  img {
    width: 60px;
    height: 34px;
    object-fit: cover;
    border-radius: 3px;
    background: #000;
  }

  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .channel {
    color: var(--yt-text-dim);
    font-size: 11px;
  }

  .by {
    color: var(--yt-deck-c);
  }

  .duration {
    color: var(--yt-text-dim);
    font-size: 11px;
  }

  .actions {
    display: flex;
    gap: 4px;
  }

  .route {
    border-color: var(--accent);
  }

  .route:hover {
    background: var(--accent);
    color: #101318;
  }

  .star.on {
    color: #ffcc33;
  }
</style>
