<script lang="ts">
  import { db, type TrackMetaRecord } from '../lib/library.js';
  import { computeStaleTracks, computeStyleStats, computeTopPlayed } from '../lib/stats.js';
  import { meta } from '../lib/meta.svelte.js';
  import type { Track } from '../lib/tracks.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    libraryTracks,
    mixer,
    onRoute,
  }: {
    /** Morceaux connus localement (favoris + historique) pour retrouver les titres. */
    libraryTracks: Map<string, Track>;
    mixer: Mixer;
    onRoute: (track: Track, deckId: string) => void;
  } = $props();

  let records = $state<TrackMetaRecord[]>([]);

  $effect(() => {
    void db.trackMeta.toArray().then((rows) => (records = rows));
  });

  const topPlayed = $derived(computeTopPlayed(records));
  const styleStats = $derived(computeStyleStats(records));
  const stale = $derived(computeStaleTracks(records, Date.now()));

  function title(videoId: string): string {
    return libraryTracks.get(videoId)?.title ?? videoId;
  }

  function daysAgo(ts: number | null): string {
    if (!ts) return '';
    return `il y a ${Math.round((Date.now() - ts) / 86_400_000)} j`;
  }
</script>

<div class="stats">
  <section>
    <h3 title="Lectures cumulées, toutes sessions confondues">🏆 Les plus joués</h3>
    {#each topPlayed as m (m.videoId)}
      <div class="line">
        <span class="mono n">▶{m.plays}</span>
        <span class="t" title={title(m.videoId)}>{title(m.videoId)}</span>
        {#if libraryTracks.has(m.videoId) && mixer.decks[0]}
          <button
            class="btn"
            onclick={() => onRoute(libraryTracks.get(m.videoId)!, mixer.decks[0]!.id)}
            title="Charger sur le deck A"
          >
            →A
          </button>
        {/if}
      </div>
    {:else}
      <p class="hint">Charge des morceaux sur les decks : le palmarès se construit tout seul.</p>
    {/each}
  </section>

  <section>
    <h3 title="Morceaux et lectures cumulées par style attribué">🎨 Par style</h3>
    {#each styleStats as s (s.style)}
      <div class="line">
        <span class="dot" style="background: {meta.styleColor(s.style) || 'transparent'}"></span>
        <span class="t">{s.style}</span>
        <span class="mono n">{s.tracks} morceaux · ▶{s.plays}</span>
      </div>
    {:else}
      <p class="hint">Attribue des styles aux morceaux (chip après la vignette) pour voir la répartition.</p>
    {/each}
  </section>

  <section>
    <h3 title="Joués autrefois mais plus depuis 30 jours — à ressortir ?">😴 Endormis (30 j+)</h3>
    {#each stale as m (m.videoId)}
      <div class="line">
        <span class="t" title={title(m.videoId)}>{title(m.videoId)}</span>
        <span class="mono n">{daysAgo(m.lastPlayedAt)}</span>
      </div>
    {:else}
      <p class="hint">Rien d'endormi : toute la bibliothèque tourne. 🎧</p>
    {/each}
  </section>
</div>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
    padding: 12px;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.06em;
    color: var(--yt-text-dim);
    cursor: help;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 12px;
  }

  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .n {
    color: var(--yt-deck-c);
    font-size: 11px;
    white-space: nowrap;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--yt-border);
    flex: 0 0 auto;
  }

  .hint {
    color: var(--yt-text-dim);
    font-size: 11px;
  }
</style>
