<script lang="ts">
  import TrackRow from './TrackRow.svelte';
  import YoutubeTab from './YoutubeTab.svelte';
  import LoadMoreSentinel from './LoadMoreSentinel.svelte';
  import SortBar from './SortBar.svelte';
  import { searchYoutubePage, getApiKey } from '../lib/search.js';
  import { mergeTracks } from '../lib/youtube-account.js';
  import { isSearchCacheFresh, normalizeQuery } from '../lib/search-history.js';
  import { meta } from '../lib/meta.svelte.js';
  import { sortRows, type SortableRow, type SortKey } from '../lib/track-meta.js';
  import {
    clearHistory,
    countHistory,
    deleteHistoryEntry,
    deletePlaylist,
    deleteSearch,
    deleteSearchCache,
    listFavorites,
    listHistory,
    listPlaylists,
    listSearches,
    loadSearchCache,
    recordSearch,
    savePlaylist,
    saveSearchCache,
    toggleFavorite,
    type Favorite,
    type HistoryEntry,
    type Playlist,
    type SearchEntry,
  } from '../lib/library.js';
  import { session } from '../lib/session.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { rateVideo } from '../lib/youtube-account.js';
  import { suggestNext } from '../lib/suggest.js';
  import { db } from '../lib/library.js';
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
  let recentSearches = $state<SearchEntry[]>([]);
  let userFilter = $state<string | null>(null); // filtre « par utilisateur » (historique/favoris)

  // pagination : recherche (API), historique (tranches Dexie), favoris/playlists (fenêtre d'affichage)
  let resultsQuery = $state(''); // requête des résultats affichés (le champ peut avoir changé)
  let searchNextToken = $state<string | null>(null);
  let searchingMore = $state(false);
  let historyLimit = $state(50);
  let historyTotal = $state(0);
  let loadingHistory = $state(false);
  let favLimit = $state(50);
  let plLimit = $state(50);

  // tri des colonnes : clic = croissant, re-clic = décroissant, 3e clic = ordre d'origine
  let sort = $state<{ key: SortKey; dir: 1 | -1 } | null>(null);

  function toggleSort(key: SortKey): void {
    sort = sort?.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : null;
  }

  function toSortRow(track: Track): SortableRow {
    const m = meta.get(track.videoId);
    return {
      title: track.title,
      channel: track.channel,
      durationS: track.durationS,
      bpm: waveMeta.get(track.videoId)?.bpm ?? null,
      rating: m?.rating ?? 0,
      plays: m?.plays ?? 0,
      style: m?.style ?? null,
      color: meta.colorOf(track.videoId) || null,
    };
  }

  function applySort<T>(items: T[], get: (item: T) => Track): T[] {
    return sort ? sortRows(items, (item) => toSortRow(get(item)), sort.key, sort.dir) : items;
  }

  const favoriteIds = $derived(new Set(favorites.map((f) => f.videoId)));

  // suggestions « à mixer ensuite » : bibliothèque locale vs deck maître
  let waveMeta = $state<Map<string, { bpm: number | null; key: string | null }>>(new Map());
  let waveMetaAt = 0;
  const libraryTracks = $derived.by(() => {
    const byId = new Map<string, Track>();
    for (const f of favorites) byId.set(f.videoId, f.track);
    for (const h of history) byId.set(h.track.videoId, h.track);
    return byId;
  });
  const suggestions = $derived.by(() => {
    const master = mixer.decks.find((d) => d.id === mixer.masterId);
    if (!master?.grid || !master.track || !master.isPlaying) return [];
    const candidates = [...libraryTracks.values()].map((t) => ({
      videoId: t.videoId,
      title: t.title,
      bpm: waveMeta.get(t.videoId)?.bpm ?? null,
      key: waveMeta.get(t.videoId)?.key ?? null,
    }));
    return suggestNext(
      { videoId: master.track.videoId, bpm: master.grid.bpm, key: master.musicalKey?.camelot ?? null },
      candidates,
    ).slice(0, 5);
  });
  const knownUsers = $derived([
    ...new Set([...history, ...favorites].map((e) => e.by).filter((b) => b !== '')),
  ]);
  const filteredHistory = $derived(
    userFilter === null ? history : history.filter((e) => e.by === userFilter),
  );
  const filteredFavorites = $derived(
    userFilter === null ? favorites : favorites.filter((f) => f.by === userFilter),
  );
  const sortedResults = $derived(applySort(results, (t) => t));
  const sortedHistory = $derived(applySort(filteredHistory, (e) => e.track));
  const sortedFavorites = $derived(applySort(filteredFavorites, (f) => f.track));
  const sortedPlaylistTracks = $derived(openPlaylist ? applySort(openPlaylist.tracks, (t) => t) : []);

  export function focusSearch(): void {
    tab = 'search';
    document.getElementById('search-input')?.focus();
  }

  function toggleMax(): void {
    ui.toggleBrowserMax();
    // on maximise pour chercher : le champ de recherche prend le focus
    if (ui.browserMax) setTimeout(() => focusSearch());
  }

  async function refreshLists(): Promise<void> {
    [history, historyTotal, favorites, playlists, recentSearches] = await Promise.all([
      listHistory(historyLimit),
      countHistory(),
      listFavorites(),
      listPlaylists(),
      listSearches(),
    ]);
    // les dossiers waveform sont lourds (buckets) : on ne les recharge que
    // toutes les 20 s au plus, les BPM/tonalités bougent rarement
    if (Date.now() - waveMetaAt > 20_000) {
      waveMetaAt = Date.now();
      waveMeta = new Map(
        (await db.waveforms.toArray()).map((w) => [
          w.videoId,
          { bpm: w.bpm ?? null, key: w.keyCamelot ?? null },
        ]),
      );
    }
  }

  $effect(() => {
    void refreshLists();
  });

  async function runSearch(): Promise<void> {
    if (query.trim() === '') return;
    searching = true;
    error = null;
    resultsQuery = query;
    void recordSearch(query, session.attribution).then(async () => {
      recentSearches = await listSearches();
    });
    try {
      // cache local d'abord (une recherche coûte 100 unités de quota API)
      const cached = await loadSearchCache(normalizeQuery(query));
      if (cached && isSearchCacheFresh(cached.updatedAt, Date.now())) {
        results = cached.tracks;
        searchNextToken = cached.nextPageToken;
      } else {
        const page = await searchYoutubePage(query, getApiKey());
        results = page.tracks;
        searchNextToken = page.nextPageToken;
        // les pistes directes (URL/ID collé) ne méritent pas d'entrée de cache
        if (page.nextPageToken !== null) await saveSearchCache(query, results, searchNextToken);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      results = [];
      searchNextToken = null;
    } finally {
      searching = false;
    }
  }

  /** Arrivé en bas des résultats : page suivante, ajoutée sans doublon, cache mis à jour. */
  async function loadMoreSearch(): Promise<void> {
    if (!searchNextToken || searchingMore || searching) return;
    searchingMore = true;
    try {
      const page = await searchYoutubePage(resultsQuery, getApiKey(), searchNextToken);
      results = mergeTracks(results, page.tracks, 'append');
      searchNextToken = page.nextPageToken;
      await saveSearchCache(resultsQuery, results, searchNextToken);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      searchingMore = false;
    }
  }

  /** Arrivé en bas de l'historique : tranche suivante depuis la base locale. */
  async function loadMoreHistory(): Promise<void> {
    if (loadingHistory || history.length >= historyTotal) return;
    loadingHistory = true;
    historyLimit += 50;
    try {
      await refreshLists();
    } finally {
      loadingHistory = false;
    }
  }

  function rerunSearch(entry: SearchEntry): void {
    query = entry.query;
    void runSearch();
  }

  async function handleToggleFavorite(track: Track): Promise<void> {
    const added = await toggleFavorite(track, session.attribution);
    await refreshLists();
    // miroir vers les « J'aime » du compte YouTube actif (si connecté)
    const token = session.activeToken;
    if (token) {
      try {
        await rateVideo(token, track.videoId, added ? 'like' : 'none');
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
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
    <span class="nav-spacer"></span>
    <button
      class="tab max-btn"
      class:on={ui.browserMax}
      onclick={toggleMax}
      title={ui.browserMax
        ? 'Réduire le browser (Échap) — se referme aussi en chargeant un morceau sur un deck'
        : 'Browser en plein écran le temps de chercher un morceau (Échap ou chargement sur un deck pour revenir au mix)'}
    >
      {ui.browserMax ? '🗕' : '⛶'}
    </button>
  </nav>

  {#if suggestions.length > 0}
    <div class="suggest" title="Bibliothèque locale filtrée : tempo à ±6 % du maître, tonalités compatibles d'abord">
      <span class="bulb">💡 ensuite :</span>
      {#each suggestions as s (s.videoId)}
        <span class="chip s-chip" class:harmonic={s.keyMatch}>
          <span class="s-title" title={s.title}>{s.title}</span>
          <span class="mono s-meta">{s.bpm!.toFixed(0)}{s.key ? `·${s.key}` : ''}</span>
          {#each mixer.decks.slice(0, 2) as deck (deck.id)}
            <button
              class="s-route"
              style="color: var({deck.colorVar})"
              onclick={() => libraryTracks.get(s.videoId) && route(libraryTracks.get(s.videoId)!, deck.id)}
            >
              →{deck.id}
            </button>
          {/each}
        </span>
      {/each}
    </div>
  {/if}

  {#if tab !== 'youtube'}
    <SortBar {sort} onSort={toggleSort} />
  {/if}

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
      {#if recentSearches.length > 0}
        <div class="recent">
          {#each recentSearches as s (s.id)}
            <span class="chip search-chip" title={s.by ? `Cherché par ${s.by}` : ''}>
              <button class="chip-name" onclick={() => rerunSearch(s)}>
                🔍 {s.query}{#if s.by}<em> · {s.by}</em>{/if}
              </button>
              <button
                class="chip-del"
                title="Retirer de l'historique des recherches"
                onclick={async () => {
                  await deleteSearch(s.id!);
                  await deleteSearchCache(s.norm); // ses résultats cachés partent avec
                  recentSearches = await listSearches();
                }}
              >
                ✕
              </button>
            </span>
          {/each}
        </div>
      {/if}
      {#if error}
        <p class="error">{error}</p>
      {/if}
      {#each sortedResults as track (track.videoId)}
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
      {#if results.length > 1}
        <LoadMoreSentinel
          hasMore={searchNextToken !== null}
          loading={searchingMore}
          doneLabel="Fin des résultats ({results.length}, gardés en cache 1 h)."
          onMore={() => void loadMoreSearch()}
        />
      {/if}
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
        <div class="filters">
          <span>{filteredHistory.length} morceaux</span>
          {#if knownUsers.length > 0}
            <button class="chip" class:on={userFilter === null} onclick={() => (userFilter = null)}>Tous</button>
            {#each knownUsers as user (user)}
              <button class="chip" class:on={userFilter === user} onclick={() => (userFilter = user)}>{user}</button>
            {/each}
          {/if}
        </div>
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
      {#each sortedHistory as entry (entry.id)}
        <TrackRow
          track={entry.track}
          {mixer}
          favorite={favoriteIds.has(entry.track.videoId)}
          by={entry.by}
          onRoute={route}
          onToggleFavorite={handleToggleFavorite}
          removeTitle="Retirer cette entrée de l'historique"
          onRemove={async () => {
            await deleteHistoryEntry(entry.id!);
            await refreshLists();
          }}
        />
      {:else}
        <p class="hint">Chaque morceau chargé dans un deck apparaît ici.</p>
      {/each}
      {#if history.length > 0}
        <LoadMoreSentinel
          hasMore={history.length < historyTotal}
          loading={loadingHistory}
          doneLabel="Tout l'historique est là ({filteredHistory.length} morceaux)."
          onMore={() => void loadMoreHistory()}
        />
      {/if}
    {:else}
      <div class="list-head">
        <div class="playlists">
          {#each playlists as p (p.id)}
            <span class="chip">
              <button
                class="chip-name"
                onclick={() => {
                  openPlaylist = openPlaylist?.id === p.id ? null : p;
                  plLimit = 50;
                }}
              >
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
      {#if knownUsers.length > 0 && !openPlaylist}
        <div class="filters pad">
          <button class="chip" class:on={userFilter === null} onclick={() => (userFilter = null)}>Tous</button>
          {#each knownUsers as user (user)}
            <button class="chip" class:on={userFilter === user} onclick={() => (userFilter = user)}>{user}</button>
          {/each}
        </div>
      {/if}
      {#if openPlaylist}
        <p class="hint">Playlist « {openPlaylist.name} »</p>
        {#each sortedPlaylistTracks.slice(0, plLimit) as track (track.videoId)}
          <TrackRow
            {track}
            {mixer}
            favorite={favoriteIds.has(track.videoId)}
            onRoute={route}
            onToggleFavorite={handleToggleFavorite}
          />
        {/each}
        <LoadMoreSentinel
          hasMore={openPlaylist.tracks.length > plLimit}
          loading={false}
          onMore={() => (plLimit += 50)}
        />
      {:else}
        {#each sortedFavorites.slice(0, favLimit) as fav (fav.videoId)}
          <TrackRow
            track={fav.track}
            {mixer}
            favorite
            by={fav.by}
            onRoute={route}
            onToggleFavorite={handleToggleFavorite}
          />
        {:else}
          <p class="hint">Ajoute des favoris avec ☆ depuis la recherche ou l’historique.</p>
        {/each}
        {#if filteredFavorites.length > 0}
          <LoadMoreSentinel
            hasMore={filteredFavorites.length > favLimit}
            loading={false}
            onMore={() => (favLimit += 50)}
          />
        {/if}
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

  .nav-spacer {
    flex: 1;
  }

  .max-btn {
    font-size: 13px;
    padding: 4px 12px;
  }

  .max-btn.on {
    color: var(--yt-deck-a);
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

  .recent {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 0 8px 8px;
  }

  .search-chip em {
    color: var(--yt-deck-c);
    font-style: normal;
    font-size: 10px;
  }

  button.chip {
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 12px;
    color: var(--yt-text);
    padding: 2px 10px;
    cursor: pointer;
    font-size: 11px;
  }

  button.chip.on {
    border-color: var(--yt-deck-a);
    color: var(--yt-deck-a);
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filters.pad {
    padding: 8px 10px 0;
  }

  .suggest {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: 6px 10px;
    border-bottom: 1px solid var(--yt-border);
    background: var(--yt-panel-deep);
  }

  .bulb {
    color: var(--yt-text-dim);
    font-size: 11px;
  }

  .s-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
  }

  .s-chip.harmonic {
    border-color: var(--yt-deck-c);
  }

  .s-title {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  .s-meta {
    color: var(--yt-deck-c);
    font-size: 10px;
  }

  .s-route {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    padding: 0 2px;
  }
</style>
