<script lang="ts">
  import { formatDuration, type Track } from '../lib/tracks.js';
  import { ghost } from '../lib/ghost.svelte.js';
  import { loadWaveform } from '../lib/library.js';
  import { meta } from '../lib/meta.svelte.js';
  import { nextColor, TRACK_COLORS } from '../lib/track-meta.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    track,
    mixer,
    favorite = false,
    by = '',
    onRoute,
    onToggleFavorite,
    onRemove,
    removeTitle = 'Retirer de cette liste',
  }: {
    track: Track;
    mixer: Mixer;
    favorite?: boolean;
    by?: string;
    onRoute: (track: Track, deckId: string) => void;
    onToggleFavorite: (track: Track) => void;
    onRemove?: () => void;
    removeTitle?: string;
  } = $props();

  // dossier connu du morceau (BPM/tonalité pré-analysés)
  let wave = $state<{ bpm: number | null; key: string | null } | null>(null);

  $effect(() => {
    void loadWaveform(track.videoId).then((record) => {
      wave = record ? { bpm: record.bpm ?? null, key: record.keyCamelot ?? null } : null;
    });
  });

  const m = $derived(meta.get(track.videoId));
  const sessionPlays = $derived(meta.sessionPlays(track.videoId));
  const style = $derived(m?.style ?? '');
  const color = $derived(meta.colorOf(track.videoId));

  let picker = $state(false); // nuancier (clic droit sur la pastille)

  function editStyle(): void {
    const known = meta.styles;
    const answer = prompt(
      `Style du morceau${known.length ? ` (déjà utilisés : ${known.join(', ')})` : ''} :`,
      style,
    );
    if (answer !== null) void meta.setStyle(track.videoId, answer);
  }

  /** Clic gauche : couleur suivante du style ; sans style, on en attribue un d'abord. */
  function cycleColor(): void {
    if (style === '') return editStyle();
    void meta.setStyleColor(style, nextColor(color));
  }

  function openPicker(event: MouseEvent): void {
    event.preventDefault();
    if (style === '') return editStyle();
    picker = !picker;
  }
</script>

<div class="row" style="--tint: {color || 'transparent'}">
  <span class="colorwrap">
    <button
      class="color"
      class:none={!color}
      style="background: {color || 'transparent'}"
      title={style
        ? `Couleur du style « ${style} » (tous ses morceaux) — clic : suivante, clic droit : nuancier`
        : 'Couleur par style — attribue d’abord un style (clic)'}
      onclick={cycleColor}
      oncontextmenu={openPicker}
      aria-label="Couleur du style"
    ></button>
    {#if picker}
      <span class="picker" onmouseleave={() => (picker = false)} role="menu">
        {#each TRACK_COLORS as swatch (swatch)}
          <button
            class="swatch"
            class:none={!swatch}
            style="background: {swatch || 'transparent'}"
            title={swatch ? `Colorer « ${style} »` : 'Sans couleur'}
            onclick={() => {
              void meta.setStyleColor(style, swatch);
              picker = false;
            }}
            aria-label={swatch || 'sans couleur'}
          ></button>
        {/each}
      </span>
    {/if}
  </span>
  <img src={track.thumbnailUrl} alt="" loading="lazy" />
  <button class="style" class:unset={!m?.style} onclick={editStyle} title="Style musical — clic pour éditer">
    {m?.style || 'style'}
  </button>
  <div class="meta">
    <span class="title" title={track.title}>{track.title}</span>
    <span class="channel">
      {track.channel}
      {#if by}<span class="by" title="Ajouté par {by}">· {by}</span>{/if}
    </span>
  </div>
  {#if wave?.bpm || wave?.key}
    <span class="mono analyzed" title="Déjà analysé : BPM{wave.key ? ' · tonalité' : ''}">
      {wave.bpm ? wave.bpm.toFixed(0) : '–'}{wave.key ? ` · ${wave.key}` : ''}
    </span>
  {/if}
  <span
    class="mono plays"
    class:zero={!(m?.plays ?? 0)}
    title="Lectures : {m?.plays ?? 0} au total{sessionPlays ? `, dont ${sessionPlays} cette session` : ''}"
  >
    ▶{m?.plays ?? 0}{sessionPlays ? `·${sessionPlays}` : ''}
  </span>
  <span class="mono duration">{formatDuration(track.durationS)}</span>
  <span class="stars" title="Note du morceau — re-cliquer la même étoile pour la retirer">
    {#each [1, 2, 3, 4, 5] as n (n)}
      <button
        class="star"
        class:on={n <= (m?.rating ?? 0)}
        onclick={() => void meta.setRating(track.videoId, m?.rating === n ? 0 : n)}
      >
        ★
      </button>
    {/each}
  </span>
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
      class="btn star-btn"
      class:on={favorite}
      onclick={() => onToggleFavorite(track)}
      title="Favori — synchronisé avec les « J'aime » du compte YouTube actif"
    >
      {favorite ? '★' : '☆'}
    </button>
    <a
      class="btn yt-link"
      href="https://www.youtube.com/watch?v={track.videoId}"
      target="_blank"
      rel="noreferrer"
      title="Ouvrir dans YouTube (nouvel onglet)"
    >
      ↗
    </a>
    {#if onRemove}
      <button class="btn remove" title={removeTitle} onclick={onRemove}>🗑</button>
    {/if}
  </div>
</div>

<style>
  /* l'échelle A−/A+ (--track-scale) ne concerne que les vignettes :
     tout est en em, piloté par la taille de police de la ligne */
  .row {
    display: flex;
    align-items: center;
    gap: 0.77em;
    padding: 0.38em 0.6em;
    border-bottom: 1px solid var(--yt-border);
    border-left: 3px solid var(--tint);
    font-size: calc(13px * var(--track-scale, 1));
  }

  .row:hover {
    background: var(--yt-panel-deep);
  }

  img {
    width: 4.6em;
    height: 2.6em;
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
    font-size: 0.85em;
  }

  .by {
    color: var(--yt-deck-c);
  }

  .duration {
    color: var(--yt-text-dim);
    font-size: 0.85em;
  }

  .analyzed {
    color: var(--yt-deck-c);
    font-size: 0.85em;
    white-space: nowrap;
  }

  .stars {
    display: inline-flex;
    white-space: nowrap;
  }

  .star {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 1px;
    font-size: 0.9em;
    color: var(--yt-border);
  }

  .star.on {
    color: #ffcc33;
  }

  .star:hover {
    color: #ffe08a;
  }

  .colorwrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .color {
    width: 0.9em;
    height: 0.9em;
    border-radius: 50%;
    border: 1px solid var(--yt-border);
    cursor: pointer;
    padding: 0;
  }

  .color.none {
    border-style: dashed;
  }

  /* nuancier du style (clic droit sur la pastille) */
  .picker {
    position: absolute;
    left: 0;
    top: 1.3em;
    z-index: 10;
    display: flex;
    gap: 4px;
    padding: 5px 6px;
    background: var(--yt-panel);
    border: 1px solid var(--yt-border);
    border-radius: 12px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  }

  .swatch {
    width: 1em;
    height: 1em;
    border-radius: 50%;
    border: 1px solid var(--yt-border);
    cursor: pointer;
    padding: 0;
  }

  .swatch.none {
    border-style: dashed;
  }

  .swatch:hover {
    transform: scale(1.25);
  }

  .style {
    background: none;
    border: 1px solid var(--yt-border);
    border-radius: 10px;
    color: var(--yt-text);
    font-size: 0.75em;
    padding: 1px 8px;
    cursor: pointer;
    max-width: 7em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .style.unset {
    color: var(--yt-text-dim);
    border-style: dashed;
  }

  .plays {
    color: var(--yt-deck-c);
    font-size: 0.8em;
    white-space: nowrap;
  }

  .plays.zero {
    color: var(--yt-text-dim);
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

  .star-btn.on {
    color: #ffcc33;
  }

  .yt-link {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }

  .remove:hover {
    border-color: var(--yt-danger);
  }
</style>
