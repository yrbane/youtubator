<script lang="ts">
  import TrackRow from './TrackRow.svelte';
  import YoutubeTab from './YoutubeTab.svelte';
  import { searchYoutube, getApiKey } from '../lib/search.js';
  import {
    clearHistory,
    deletePlaylist,
    listFavorites,
    listHistory,
    listPlaylists,
    savePlaylist,
    toggleFavorite,
    type Favorite,
    type HistoryEntry,
    type Playlist,
  } from '../lib/library.js';
  import type { Track } from '../lib/tracks.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    mixer,
    onRoute,
    onOpenSettings,
  }: {
    mixer: Mixer;
    onRoute: (track: Track, deckId: string) => void;
    onOpenSettings: () => void;
  } = $props();

  type Tab = 'search' | 'history' | 'favorites' | 'youtube';
  let tab = $state<Tab>('search');
  let query = $state('');
  let results = $state<Track[]>([]);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let favorites = $state<Favorite[]>([]);
  let playlists = $state<Playlist[]>([]);
  let openPlaylist = $state<Playlist | null>(null);

  const favoriteIds = $derived(new Set(favorites.map((f) => f.videoId)));

  export function focusSearch(): void {
    tab = 'search';
    document.getElementById('search-input')?.focus();
  }

  async function refreshLists(): Promise<void> {
    [history, favorites, playlists] = await Promise.all([
      listHistory(),
      listFavorites(),
      listPlaylists(),
    ]);
  }

  $effect(() => {
    void refreshLists();
  });

  async function runSearch(): Promise<void> {
    if (query.trim() === '') return;
    searching = true;
    error = null;
    try {
      results = await searchYoutube(query, getApiKey());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      results = [];
    } finally {
      searching = false;
    }
  }

  async function handleToggleFavorite(track: Track): Promise<void> {
    await toggleFavorite(track);
    await refreshLists();
  }

  function route(track: Track, deckId: string): void {
    onRoute(track, deckId);
    // l'historique est enregistré par App ; on rafraîchit après un court délai
    setTimeout(() => void refreshLists(), 300);
  }

  async function saveFavoritesAsPlaylist(): Promise<void> {
    const name = prompt('Nom de la playlist :');
    if (!name) return;
    await savePlaylist(name, favorites.map((f) => f.track));
    await refreshLists();
  }
</script>

<section class="browser panel">
  <nav>
    <button class="tab" class:on={tab === 'search'} onclick={() => (tab = 'search')}>RECHERCHE</button>
    <button class="tab" class:on={tab === 'history'} onclick={() => (tab = 'history')}>HISTORIQUE</button>
    <button class="tab" class:on={tab === 'favorites'} onclick={() => (tab = 'favorites')}>FAVORIS</button>
    <button class="tab yt" class:on={tab === 'youtube'} onclick={() => (tab = 'youtube')}>▶ YOUTUBE</button>
  </nav>

  <div class="content">
    {#if tab === 'search'}
      <form
        class="search-bar"
        onsubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <input
          id="search-input"
          type="search"
          placeholder="Recherche YouTube, ou colle une URL / un ID vidéo…"
          bind:value={query}
        />
        <button class="btn" type="submit" disabled={searching}>{searching ? '…' : '🔍'}</button>
      </form>
      {#if error}
        <p class="error">{error}</p>
      {/if}
      {#each results as track (track.videoId)}
        <TrackRow
          {track}
          {mixer}
          favorite={favoriteIds.has(track.videoId)}
          onRoute={route}
          onToggleFavorite={handleToggleFavorite}
        />
      {:else}
        {#if !error && !searching}
          <p class="hint">Les résultats se routent vers un deck avec les boutons →A / →B.</p>
        {/if}
      {/each}
    {:else if tab === 'youtube'}
      <YoutubeTab
        {mixer}
        favoriteIds={favoriteIds}
        onRoute={route}
        onToggleFavorite={handleToggleFavorite}
        {onOpenSettings}
      />
    {:else if tab === 'history'}
      <div class="list-head">
        <span>{history.length} morceaux chargés</span>
        <button
          class="btn"
          onclick={async () => {
            if (confirm('Vider l’historique ?')) {
              await clearHistory();
              await refreshLists();
            }
          }}
        >
          Vider
        </button>
      </div>
      {#each history as entry (entry.id)}
        <TrackRow
          track={entry.track}
          {mixer}
          favorite={favoriteIds.has(entry.track.videoId)}
          onRoute={route}
          onToggleFavorite={handleToggleFavorite}
        />
      {:else}
        <p class="hint">Chaque morceau chargé dans un deck apparaît ici.</p>
      {/each}
    {:else}
      <div class="list-head">
        <div class="playlists">
          {#each playlists as p (p.id)}
            <span class="chip">
              <button class="chip-name" onclick={() => (openPlaylist = openPlaylist?.id === p.id ? null : p)}>
                {p.name} ({p.tracks.length})
              </button>
              <button
                class="chip-del"
                title="Supprimer la playlist"
                onclick={async () => {
                  if (confirm(`Supprimer la playlist « ${p.name} » ?`)) {
                    await deletePlaylist(p.id);
                    if (openPlaylist?.id === p.id) openPlaylist = null;
                    await refreshLists();
                  }
                }}
              >
                ✕
              </button>
            </span>
          {/each}
        </div>
        <button class="btn" onclick={() => void saveFavoritesAsPlaylist()} disabled={favorites.length === 0}>
          Sauver les favoris en playlist
        </button>
      </div>
      {#if openPlaylist}
        <p class="hint">Playlist « {openPlaylist.name} »</p>
        {#each openPlaylist.tracks as track (track.videoId)}
          <TrackRow
            {track}
            {mixer}
            favorite={favoriteIds.has(track.videoId)}
            onRoute={route}
            onToggleFavorite={handleToggleFavorite}
          />
        {/each}
      {:else}
        {#each favorites as fav (fav.videoId)}
          <TrackRow track={fav.track} {mixer} favorite onRoute={route} onToggleFavorite={handleToggleFavorite} />
        {:else}
          <p class="hint">Ajoute des favoris avec ☆ depuis la recherche ou l’historique.</p>
        {/each}
      {/if}
    {/if}
  </div>
</section>

<style>
  .browser {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  nav {
    display: flex;
    border-bottom: 1px solid var(--yt-border);
  }

  .tab {
    background: none;
    border: none;
    padding: 8px 16px;
    cursor: pointer;
    color: var(--yt-text-dim);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 2px solid transparent;
  }

  .tab.on {
    color: var(--yt-text);
    border-bottom-color: var(--yt-deck-a);
  }

  .tab.yt.on {
    border-bottom-color: #ff0033;
  }

  .content {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .search-bar {
    display: flex;
    gap: 6px;
    padding: 8px;
  }

  input {
    flex: 1;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 4px;
    padding: 6px 10px;
    outline: none;
  }

  input:focus {
    border-color: var(--yt-deck-a);
  }

  .error {
    color: var(--yt-danger);
    padding: 0 10px;
  }

  .hint {
    color: var(--yt-text-dim);
    padding: 8px 10px;
  }

  .list-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    color: var(--yt-text-dim);
    flex-wrap: wrap;
  }

  .playlists {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 12px;
    overflow: hidden;
  }

  .chip-name,
  .chip-del {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--yt-text);
    padding: 3px 8px;
  }

  .chip-del {
    color: var(--yt-text-dim);
    padding-left: 0;
  }

  .chip-del:hover {
    color: var(--yt-danger);
  }
</style>
