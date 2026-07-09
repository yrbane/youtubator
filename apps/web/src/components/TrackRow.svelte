<script lang="ts">
  import { formatDuration, type Track } from '../lib/tracks.js';
  import { ghost } from '../lib/ghost.svelte.js';
  import { localAnalysis } from '../lib/local-analysis.svelte.js';
  import { loadWaveform } from '../lib/library.js';
  import { meta } from '../lib/meta.svelte.js';
  import { preview } from '../lib/preview.svelte.js';
  import { nextColor, TRACK_COLORS } from '../lib/track-meta.js';
  import { isLocalTrackId } from '../lib/local-files.js';
  import { ui } from '../lib/ui.svelte.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    track,
    mixer,
    favorite = false,
    by = '',
    highlighted = false,
    selected = false,
    onRoute,
    onToggleFavorite,
    onRemove,
    removeTitle = 'Retirer de cette liste',
    onRowClick,
    onMoveUp,
    onMoveDown,
  }: {
    track: Track;
    mixer: Mixer;
    favorite?: boolean;
    by?: string;
    /** Curseur clavier (↑/↓ puis Entrée → deck A, Maj+Entrée → B). */
    highlighted?: boolean;
    /** Sélection multiple (clic, Ctrl+clic, Maj+clic). */
    selected?: boolean;
    onRoute: (track: Track, deckId: string) => void;
    onToggleFavorite: (track: Track) => void;
    onRemove?: () => void;
    removeTitle?: string;
    onRowClick?: (event: MouseEvent) => void;
    /** Réordonnancement dans une crate. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
  } = $props();

  /** Clic sur le fond de la ligne : sélection — les boutons/liens gardent leur rôle. */
  function handleRowClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    onRowClick?.(event);
  }

  // dossier connu du morceau (BPM/tonalité pré-analysés)
  let wave = $state<{ bpm: number | null; key: string | null } | null>(null);

  $effect(() => {
    void loadWaveform(track.videoId).then((record) => {
      wave = record ? { bpm: record.bpm ?? null, key: record.keyCamelot ?? null } : null;
    });
  });

  const m = $derived(meta.get(track.videoId));
  const sessionPlays = $derived(meta.sessionPlays(track.videoId));
  const local = $derived(isLocalTrackId(track.videoId));
  // colonnes visibles (choix « ⚏ Colonnes » du browser, persisté)
  const cols = $derived(new Set(ui.columns));
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

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="row"
  class:cursor={highlighted}
  class:selected
  style="--tint: {color || 'transparent'}"
  onclick={handleRowClick}
  draggable="true"
  ondragstart={(e) => {
    e.dataTransfer?.setData(
      'application/x-youtubator-track',
      JSON.stringify({ videoId: track.videoId, title: track.title, channel: track.channel, durationS: track.durationS, thumbnailUrl: track.thumbnailUrl }),
    );
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }}
  title={onRowClick
    ? 'Glisser vers un deck pour charger · Clic : sélectionner · Ctrl+clic : ajouter · Maj+clic : plage'
    : 'Glisser vers un deck pour charger'}
>
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
  {#if cols.has('thumb')}
    <img src={track.thumbnailUrl} alt="" loading="lazy" />
  {/if}
  {#if cols.has('style')}
    <button class="style" class:unset={!m?.style} onclick={editStyle} title="Style musical — clic pour éditer">
      {m?.style || 'style'}
    </button>
  {/if}
  <div class="meta">
    <span class="title" title={track.title}>{track.title}</span>
  </div>
  {#if cols.has('artist')}
    <span class="artist" title="Artiste / chaîne{by ? ` — ajouté par ${by}` : ''}">
      {track.channel || '—'}
      {#if by}<span class="by">· {by}</span>{/if}
    </span>
  {/if}
  {#if cols.has('bpm')}
    <span class="mono analyzed" title="BPM détecté">{wave?.bpm ? wave.bpm.toFixed(0) : '–'}</span>
  {/if}
  {#if cols.has('key')}
    <span class="mono analyzed" title="Tonalité (Camelot)">{wave?.key ?? '–'}</span>
  {/if}
  {#if cols.has('plays')}
    <span
      class="mono plays"
      class:zero={!(m?.plays ?? 0)}
      title="Lectures : {m?.plays ?? 0} au total{sessionPlays ? `, dont ${sessionPlays} cette session` : ''}"
    >
      ▶{m?.plays ?? 0}{sessionPlays ? `·${sessionPlays}` : ''}
    </span>
  {/if}
  {#if cols.has('duration')}
    <span class="mono duration">{formatDuration(track.durationS)}</span>
  {/if}
  {#if cols.has('rating')}
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
  {/if}
  <div class="actions">
    {#if onMoveUp || onMoveDown}
      <button class="btn" title="Monter dans la crate" disabled={!onMoveUp} onclick={onMoveUp}>↑</button>
      <button class="btn" title="Descendre dans la crate" disabled={!onMoveDown} onclick={onMoveDown}>↓</button>
    {/if}
    <button
      class="btn phones"
      class:on={preview.current === track.videoId}
      onclick={() => void preview.toggle(track)}
      title="Pré-écouter sans occuper un deck (démarre au tiers du morceau, sortie principale) — re-clic pour arrêter"
    >
      🎧
    </button>
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
      onclick={() => (local ? localAnalysis.enqueue(track.videoId) : ghost.enqueue(track))}
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
    {#if local}
      <span class="btn file-badge" title="Fichier local (bibliothèque de dossiers)">💾</span>
    {:else}
      <a
        class="btn yt-link"
        href="https://www.youtube.com/watch?v={track.videoId}"
        target="_blank"
        rel="noreferrer"
        title="Ouvrir dans YouTube (nouvel onglet)"
      >
        ↗
      </a>
    {/if}
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
    /* virtualisation légère : les lignes hors écran ne sont pas rendues */
    content-visibility: auto;
    contain-intrinsic-size: auto 3.4em;
  }

  .row:hover {
    background: var(--yt-panel-deep);
  }

  /* curseur clavier (↑/↓) et sélection multiple */
  .row.cursor {
    outline: 1px solid var(--yt-deck-a);
    outline-offset: -1px;
  }

  .row.selected {
    background: color-mix(in srgb, var(--yt-deck-a) 14%, transparent);
  }

  .phones.on {
    color: var(--yt-deck-c);
    border-color: var(--yt-deck-c);
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

  .artist {
    color: var(--yt-text-dim);
    font-size: 0.9em;
    max-width: 14em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 0 1 auto;
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
