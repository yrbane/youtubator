<script lang="ts">
  import TrackRow from './TrackRow.svelte';
  import YoutubeTab from './YoutubeTab.svelte';
  import StatsTab from './StatsTab.svelte';
  import LoadMoreSentinel from './LoadMoreSentinel.svelte';
  import SortBar from './SortBar.svelte';
  import { searchYoutubePage, getApiKey, type SearchOptions } from '../lib/search.js';
  import { addVideoToYtPlaylist, createYtPlaylist, mergeTracks } from '../lib/youtube-account.js';
  import { isSearchCacheFresh, normalizeQuery } from '../lib/search-history.js';
  import { meta } from '../lib/meta.svelte.js';
  import { ghost } from '../lib/ghost.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { sortRows, type SortableRow, type SortKey } from '../lib/track-meta.js';
  import { filterRows, type FilterableRow } from '../lib/filter.js';
  import { matchesMaster } from '../lib/match.js';
  import { toTrack } from '../lib/local-files.js';
  import {
    addFolder,
    importFiles,
    listFolders,
    listLocalTracks,
    removeFolder,
    rescanFolder,
    type LocalFolder,
    type LocalTrack,
  } from '../lib/local-library.js';
  import { moveItem } from '../lib/list-utils.js';
  import { tracklistCsv, tracklistTxt } from '../lib/session-export.js';
  import {
    addTracksToPlaylist,
    clearHistory,
    countHistory,
    deleteHistoryEntry,
    deletePlaylist,
    deleteSearch,
    deleteSearchCache,
    deleteSmartlist,
    listFavorites,
    listHistory,
    listPlaylists,
    listSearches,
    listSmartlists,
    loadSearchCache,
    recordSearch,
    renamePlaylist,
    savePlaylist,
    saveSearchCache,
    saveSmartlist,
    toggleFavorite,
    updatePlaylistTracks,
    type Favorite,
    type HistoryEntry,
    type Playlist,
    type SearchEntry,
    type Smartlist,
  } from '../lib/library.js';
  import { session } from '../lib/session.svelte.js';
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

  type Tab = 'search' | 'history' | 'favorites' | 'local' | 'youtube' | 'stats';
  let tab = $state<Tab>('search');

  // --- bibliothèque locale façon Traktor : dossiers scannés ---
  let localFolders = $state<LocalFolder[]>([]);
  let localTracks = $state<LocalTrack[]>([]);
  let localBusy = $state(false);
  const supportsFolderPicker = typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  async function refreshLocal(): Promise<void> {
    [localFolders, localTracks] = await Promise.all([listFolders(), listLocalTracks()]);
  }

  async function pickFolder(): Promise<void> {
    try {
      const handle = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'read' });
      localBusy = true;
      await addFolder(handle);
      await refreshLocal();
    } catch {
      // sélection annulée
    } finally {
      localBusy = false;
    }
  }

  async function importLocalFiles(e: Event): Promise<void> {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;
    localBusy = true;
    await importFiles(files);
    await refreshLocal();
    localBusy = false;
  }
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

  // filtre libre façon Traktor : réduit la liste affichée, quel que soit l'onglet
  let filter = $state('');

  // affinage de la recherche YouTube (durée / tri) — seul le réglage par défaut est caché
  let searchDuration = $state<'any' | 'medium' | 'long'>('any');
  let searchOrder = $state<'relevance' | 'date'>('relevance');
  const searchOpts = $derived<SearchOptions>({ duration: searchDuration, order: searchOrder });
  const searchOptsDefault = $derived(searchDuration === 'any' && searchOrder === 'relevance');

  // MATCH façon Traktor : ne garder que les morceaux mixables avec le deck maître
  let matchOn = $state(false);
  const masterRef = $derived.by(() => {
    const master = mixer.decks.find((d) => d.id === mixer.masterId && d.grid);
    return master?.grid ? { bpm: master.grid.bpm, key: master.musicalKey?.camelot ?? null } : null;
  });

  // filtres sauvegardés (smart crates)
  let smartlists = $state<Smartlist[]>([]);

  // sélection multiple + curseur clavier
  let selectedIds = $state<Set<string>>(new Set());
  let selectionAnchor = -1;
  let cursor = $state(-1);

  function toFilterRow(track: Track): FilterableRow {
    const m = meta.get(track.videoId);
    const w = waveMeta.get(track.videoId);
    return {
      title: track.title,
      channel: track.channel,
      style: m?.style ?? null,
      bpm: w?.bpm ?? null,
      key: w?.key ?? null,
    };
  }

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

  /** MATCH actif : ne garde que les morceaux mixables avec le deck maître. */
  function applyMatch<T>(items: T[], get: (item: T) => Track): T[] {
    if (!matchOn || !masterRef) return items;
    return items.filter((item) => {
      const w = waveMeta.get(get(item).videoId);
      return matchesMaster({ bpm: w?.bpm ?? null, key: w?.key ?? null }, masterRef);
    });
  }

  /** Filtre + tri + MATCH, dans cet ordre. */
  function display<T>(items: T[], get: (item: T) => Track): T[] {
    return applyMatch(filterRows(applySort(items, get), (i) => toFilterRow(get(i)), filter), get);
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
  const sortedResults = $derived(display(results, (t) => t));
  const sortedHistory = $derived(display(filteredHistory, (e) => e.track));
  const sortedFavorites = $derived(display(filteredFavorites, (f) => f.track));
  const sortedPlaylistTracks = $derived(openPlaylist ? display(openPlaylist.tracks, (t) => t) : []);
  const sortedLocal = $derived(display(localTracks.map(toTrack), (t) => t));

  /** Liste de pistes sous le curseur/sélection pour l'onglet courant (fenêtres comprises). */
  const selectionList = $derived.by((): Track[] => {
    if (tab === 'search') return sortedResults;
    if (tab === 'history') return sortedHistory.map((e) => e.track);
    if (tab === 'local') return sortedLocal;
    if (tab === 'favorites') {
      return openPlaylist
        ? sortedPlaylistTracks.slice(0, plLimit)
        : sortedFavorites.slice(0, favLimit).map((f) => f.track);
    }
    return [];
  });

  export function focusSearch(): void {
    tab = 'search';
    document.getElementById('search-input')?.focus();
  }

  // curseur et sélection repartent de zéro quand la liste affichée change de nature
  $effect(() => {
    void tab;
    void filter;
    void sort;
    void matchOn;
    cursor = -1;
    selectionAnchor = -1;
    selectedIds = new Set();
  });

  /** Navigation clavier façon Traktor : ↑/↓, Entrée → deck A, Maj+Entrée → deck B, F favori. */
  function onListKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (!ui.browserVisible && !ui.browserMax) return;
    if (tab === 'youtube' || tab === 'stats') return;
    const list = selectionList;
    if (list.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor =
        e.key === 'ArrowDown' ? Math.min(list.length - 1, cursor + 1) : Math.max(0, cursor - 1);
      requestAnimationFrame(() =>
        document.querySelector('.content .row.cursor')?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (e.key === 'Enter' && cursor >= 0 && list[cursor]) {
      e.preventDefault();
      const deck = e.shiftKey ? mixer.decks[1] : mixer.decks[0];
      if (deck) route(list[cursor], deck.id);
    } else if ((e.key === 'f' || e.key === 'F') && cursor >= 0 && list[cursor]) {
      void handleToggleFavorite(list[cursor]);
    }
  }

  /** Clic = sélectionner, Ctrl+clic = ajouter/retirer, Maj+clic = plage. */
  function handleSelect(e: MouseEvent, index: number): void {
    const list = selectionList;
    const id = list[index]?.videoId;
    if (!id) return;
    const next = new Set(selectedIds);
    if (e.shiftKey && selectionAnchor >= 0) {
      const [from, to] = [Math.min(selectionAnchor, index), Math.max(selectionAnchor, index)];
      for (let i = from; i <= to; i++) next.add(list[i]!.videoId);
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectionAnchor = index;
    } else {
      next.clear();
      next.add(id);
      selectionAnchor = index;
    }
    cursor = index;
    selectedIds = next;
  }

  /** Pistes sélectionnées, retrouvées dans toutes les sources connues. */
  function selectedTracks(): Track[] {
    const byId = new Map<string, Track>();
    for (const t of results) byId.set(t.videoId, t);
    for (const e of history) byId.set(e.track.videoId, e.track);
    for (const f of favorites) byId.set(f.videoId, f.track);
    if (openPlaylist) for (const t of openPlaylist.tracks) byId.set(t.videoId, t);
    return [...selectedIds].map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
  }

  async function bulkRate(rating: number): Promise<void> {
    for (const t of selectedTracks()) await meta.setRating(t.videoId, rating);
  }

  async function bulkStyle(): Promise<void> {
    const known = meta.styles;
    const style = prompt(
      `Style pour les ${selectedIds.size} morceaux sélectionnés${known.length ? ` (déjà utilisés : ${known.join(', ')})` : ''} :`,
    );
    if (style === null) return;
    for (const t of selectedTracks()) await meta.setStyle(t.videoId, style);
  }

  async function bulkCrate(): Promise<void> {
    const name = prompt(
      `Ajouter les ${selectedIds.size} morceaux à quelle crate ?${playlists.length ? `\nExistantes : ${playlists.map((p) => p.name).join(', ')}` : ''}\n(un nouveau nom crée la crate)`,
    );
    if (!name) return;
    const existing = playlists.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) await addTracksToPlaylist(existing.id, selectedTracks());
    else await savePlaylist(name.trim(), selectedTracks());
    await refreshLists();
  }

  function bulkAnalyze(): void {
    for (const t of selectedTracks()) ghost.enqueue(t);
  }

  /** ⚡ liste : met toute la liste affichée dans la file d'analyse fantôme. */
  function analyzeDisplayed(): void {
    for (const t of selectionList) ghost.enqueue(t);
  }

  // --- filtres sauvegardés (smart crates) ---

  async function saveCurrentSmartlist(): Promise<void> {
    const name = prompt('Nom du filtre sauvegardé (smart crate) :', filter);
    if (!name) return;
    await saveSmartlist(name.trim(), filter, sort?.key ?? null, sort?.dir ?? null);
    smartlists = await listSmartlists();
  }

  function applySmartlist(s: Smartlist): void {
    filter = s.query;
    sort = s.sortKey ? { key: s.sortKey as SortKey, dir: s.sortDir === -1 ? -1 : 1 } : null;
  }

  // --- crates éditables ---

  async function createCrate(): Promise<void> {
    const name = prompt('Nom de la nouvelle crate :');
    if (!name) return;
    await savePlaylist(name.trim(), []);
    await refreshLists();
  }

  async function renameCrate(p: Playlist): Promise<void> {
    const name = prompt('Nouveau nom de la crate :', p.name);
    if (!name || name.trim() === p.name) return;
    await renamePlaylist(p.id, name.trim());
    await refreshLists();
    if (openPlaylist?.id === p.id) openPlaylist = playlists.find((x) => x.id === p.id) ?? null;
  }

  /** Applique une mutation des morceaux de la crate ouverte et resynchronise l'affichage. */
  async function mutateOpenPlaylist(tracks: Track[]): Promise<void> {
    if (!openPlaylist) return;
    const id = openPlaylist.id;
    await updatePlaylistTracks(id, tracks);
    await refreshLists();
    openPlaylist = playlists.find((p) => p.id === id) ?? null;
  }

  /** Publie la crate ouverte comme playlist privée du compte YouTube actif. */
  async function publishOpenPlaylist(): Promise<void> {
    const token = session.activeToken;
    if (!token || !openPlaylist) return;
    const total = openPlaylist.tracks.length;
    if (
      !confirm(
        `Créer la playlist privée « ${openPlaylist.name} » sur YouTube et y ajouter ${total} morceaux ?\n` +
          `Coût quota API : ~${50 + total * 50} unités (50 par morceau).`,
      )
    ) {
      return;
    }
    try {
      const playlistId = await createYtPlaylist(token, openPlaylist.name);
      for (const t of openPlaylist.tracks) await addVideoToYtPlaylist(token, playlistId, t.videoId);
      alert(`Playlist « ${openPlaylist.name} » publiée sur YouTube (privée). ✔`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Télécharge la tracklist affichée (filtres appliqués), en ordre chronologique. */
  function exportTracklist(format: 'txt' | 'csv'): void {
    const entries = [...sortedHistory]
      .sort((a, b) => a.loadedAt - b.loadedAt)
      .map((e) => ({
        title: e.track.title,
        channel: e.track.channel,
        loadedAt: e.loadedAt,
        deckId: e.deckId,
        videoId: e.track.videoId,
      }));
    const content = format === 'txt' ? tracklistTxt(entries) : tracklistCsv(entries);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tracklist-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function toggleMax(): void {
    ui.toggleBrowserMax();
    // on maximise pour chercher : le champ de recherche prend le focus
    if (ui.browserMax) setTimeout(() => focusSearch());
  }

  async function refreshLists(): Promise<void> {
    [history, historyTotal, favorites, playlists, recentSearches, smartlists] = await Promise.all([
      listHistory(historyLimit),
      countHistory(),
      listFavorites(),
      listPlaylists(),
      listSearches(),
      listSmartlists(),
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
    void refreshLocal();
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
      // cache local d'abord (une recherche coûte 100 unités de quota API) —
      // seul le réglage durée/tri par défaut est caché, les variantes vont à l'API
      const cached = searchOptsDefault ? await loadSearchCache(normalizeQuery(query)) : undefined;
      if (cached && isSearchCacheFresh(cached.updatedAt, Date.now())) {
        results = cached.tracks;
        searchNextToken = cached.nextPageToken;
      } else {
        const page = await searchYoutubePage(query, getApiKey(), null, searchOpts);
        results = page.tracks;
        searchNextToken = page.nextPageToken;
        // les pistes directes (URL/ID collé) ne méritent pas d'entrée de cache
        if (searchOptsDefault && page.nextPageToken !== null) {
          await saveSearchCache(query, results, searchNextToken);
        }
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
      const page = await searchYoutubePage(resultsQuery, getApiKey(), searchNextToken, searchOpts);
      results = mergeTracks(results, page.tracks, 'append');
      searchNextToken = page.nextPageToken;
      if (searchOptsDefault) await saveSearchCache(resultsQuery, results, searchNextToken);
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

<svelte:window onkeydown={onListKeydown} />

<section class="browser panel">
  <nav>
    <button class="tab" class:on={tab === 'search'} onclick={() => (tab = 'search')}>RECHERCHE</button>
    <button class="tab" class:on={tab === 'history'} onclick={() => (tab = 'history')}>HISTORIQUE</button>
    <button class="tab" class:on={tab === 'favorites'} onclick={() => (tab = 'favorites')}>FAVORIS</button>
    <button
      class="tab"
      class:on={tab === 'local'}
      onclick={() => (tab = 'local')}
      title="Bibliothèque locale : dossiers musique scannés (FLAC, MP3, WAV…) — EQ, tempo et boucles complets, sans extension"
    >
      💾 LOCAL
    </button>
    <button class="tab yt" class:on={tab === 'youtube'} onclick={() => (tab = 'youtube')}>▶ YOUTUBE</button>
    <button
      class="tab"
      class:on={tab === 'stats'}
      onclick={() => (tab = 'stats')}
      title="Statistiques d'écoute : les plus joués, répartition par style, morceaux endormis"
    >
      📊 STATS
    </button>
    <button
      class="tab match"
      class:on={matchOn}
      disabled={!masterRef}
      onclick={() => (matchOn = !matchOn)}
      title={masterRef
        ? `MATCH : ne montrer que les morceaux mixables avec le deck maître (${masterRef.bpm.toFixed(0)} BPM ±6 %, octaves comprises${masterRef.key ? `, tonalités compatibles ${masterRef.key}` : ''})`
        : 'MATCH : charge et analyse un morceau sur un deck (le maître) pour filtrer les morceaux mixables'}
    >
      MATCH
    </button>
    <input
      class="filter"
      type="search"
      placeholder="⧩ filtrer (titre, artiste, style, BPM, tonalité…)"
      title="Filtre libre façon Traktor : réduit la liste affichée — plusieurs mots = tous requis, Échap pour effacer"
      bind:value={filter}
      onkeydown={(e) => {
        if (e.key === 'Escape' && filter !== '') {
          filter = '';
          e.stopPropagation();
        }
      }}
    />
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

  {#if tab !== 'youtube' && tab !== 'stats'}
    <div class="toolrow">
      <SortBar {sort} onSort={toggleSort} />
      <div class="smart">
        <button
          class="btn"
          disabled={filter === '' && !sort}
          onclick={() => void saveCurrentSmartlist()}
          title="Sauvegarder le filtre + tri actuels comme liste dynamique (smart crate) : un clic sur sa chip les réapplique"
        >
          💾
        </button>
        {#each smartlists as s (s.id)}
          <span class="chip" title="Filtre : « {s.query} »{s.sortKey ? ` · tri ${s.sortKey}` : ''}">
            <button class="chip-name" onclick={() => applySmartlist(s)}>✨ {s.name}</button>
            <button
              class="chip-del"
              title="Supprimer ce filtre sauvegardé"
              onclick={async () => {
                await deleteSmartlist(s.id);
                smartlists = await listSmartlists();
              }}
            >
              ✕
            </button>
          </span>
        {/each}
        <button
          class="btn"
          onclick={analyzeDisplayed}
          title="Pré-analyser toute la liste affichée (waveform, BPM, tonalité) via l'analyse fantôme — les morceaux déjà analysés sont sautés"
        >
          ⚡ liste
        </button>
      </div>
    </div>
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
        <select
          bind:value={searchDuration}
          title="Durée des vidéos : tracks (4-20 min) ou mixes/lives (> 20 min) — écarte aussi les Shorts"
        >
          <option value="any">Toute durée</option>
          <option value="medium">Tracks (4-20 min)</option>
          <option value="long">Mixes (+20 min)</option>
        </select>
        <select bind:value={searchOrder} title="Ordre des résultats YouTube">
          <option value="relevance">Pertinence</option>
          <option value="date">Plus récents</option>
        </select>
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
      {#each sortedResults as track, i (track.videoId)}
        <TrackRow
          {track}
          {mixer}
          favorite={favoriteIds.has(track.videoId)}
          highlighted={cursor === i}
          selected={selectedIds.has(track.videoId)}
          onRowClick={(e) => handleSelect(e, i)}
          onRoute={route}
          onToggleFavorite={handleToggleFavorite}
        />
      {:else}
        {#if !error && !searching}
          <p class="hint">
            {filter && results.length > 0
              ? 'Aucun résultat ne correspond au filtre.'
              : 'Les résultats se routent vers un deck avec les boutons →A / →B.'}
          </p>
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
    {:else if tab === 'local'}
      <div class="list-head">
        <div class="playlists">
          {#if supportsFolderPicker}
            <button
              class="btn"
              disabled={localBusy}
              onclick={() => void pickFolder()}
              title="Choisir un dossier musique à scanner (récursif) — la permission est mémorisée, ↻ pour rescanner après ajout de fichiers"
            >
              {localBusy ? 'Scan…' : '+ Dossier musique'}
            </button>
          {:else}
            <label class="btn" title="Ce navigateur ne gère pas les dossiers persistants : import ponctuel (les fichiers sont copiés dans la bibliothèque du navigateur)">
              {localBusy ? 'Import…' : '+ Importer un dossier'}
              <input type="file" webkitdirectory hidden onchange={(e) => void importLocalFiles(e)} />
            </label>
          {/if}
          {#each localFolders as folder (folder.id)}
            <span class="chip">
              <span class="chip-name" title="{folder.trackCount} morceaux">{folder.name} ({folder.trackCount})</span>
              {#if folder.handle}
                <button
                  class="chip-del"
                  title="Rescanner ce dossier (nouveaux fichiers, suppressions)"
                  onclick={async () => {
                    localBusy = true;
                    await rescanFolder(folder);
                    await refreshLocal();
                    localBusy = false;
                  }}
                >
                  ↻
                </button>
              {/if}
              <button
                class="chip-del"
                title="Retirer ce dossier de la bibliothèque (les fichiers sur le disque ne sont pas touchés)"
                onclick={async () => {
                  if (confirm(`Retirer « ${folder.name} » de la bibliothèque ?`)) {
                    await removeFolder(folder.id);
                    await refreshLocal();
                  }
                }}
              >
                ✕
              </button>
            </span>
          {/each}
        </div>
        <span class="mono head-count">{sortedLocal.length} morceaux</span>
      </div>
      {#each sortedLocal as track, i (track.videoId)}
        <TrackRow
          {track}
          {mixer}
          favorite={favoriteIds.has(track.videoId)}
          highlighted={cursor === i}
          selected={selectedIds.has(track.videoId)}
          onRowClick={(e) => handleSelect(e, i)}
          onRoute={route}
          onToggleFavorite={handleToggleFavorite}
        />
      {:else}
        <p class="hint">
          Ajoute un dossier musique (tes achats Bandcamp, Beatport, tes rips…) : EQ, tempo,
          waveform complète et boucles précises fonctionnent ici <strong>sans extension</strong>,
          et l'analyse BPM/tonalité est instantanée. Comme dans Traktor. 💾
        </p>
      {/each}
    {:else if tab === 'stats'}
      <StatsTab {libraryTracks} {mixer} onRoute={route} />
    {:else if tab === 'youtube'}
      <YoutubeTab
        {mixer}
        favoriteIds={favoriteIds}
        {filter}
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
        <div class="head-actions">
          <button
            class="btn"
            onclick={() => exportTracklist('txt')}
            title="Télécharger la tracklist affichée (filtres appliqués) en texte publiable, minutage relatif"
          >
            ⤓ txt
          </button>
          <button
            class="btn"
            onclick={() => exportTracklist('csv')}
            title="Télécharger la tracklist affichée en CSV (tableur) : position, horodatage, deck, chaîne, titre"
          >
            ⤓ csv
          </button>
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
      </div>
      {#each sortedHistory as entry, i (entry.id)}
        <TrackRow
          track={entry.track}
          {mixer}
          favorite={favoriteIds.has(entry.track.videoId)}
          by={entry.by}
          highlighted={cursor === i}
          selected={selectedIds.has(entry.track.videoId)}
          onRowClick={(e) => handleSelect(e, i)}
          onRoute={route}
          onToggleFavorite={handleToggleFavorite}
          removeTitle="Retirer cette entrée de l'historique"
          onRemove={async () => {
            await deleteHistoryEntry(entry.id!);
            await refreshLists();
          }}
        />
      {:else}
        <p class="hint">
          {filter ? 'Aucun morceau ne correspond au filtre.' : 'Chaque morceau chargé dans un deck apparaît ici.'}
        </p>
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
          <button class="btn" onclick={() => void createCrate()} title="Créer une crate vide — remplis-la via la sélection multiple (clic sur les lignes puis ➕)">
            + crate
          </button>
          {#each playlists as p (p.id)}
            <span class="chip">
              <button
                class="chip-name"
                title="Ouvrir la crate (réordonnancement ↑↓ et retrait sur chaque ligne)"
                onclick={() => {
                  openPlaylist = openPlaylist?.id === p.id ? null : p;
                  plLimit = 50;
                }}
              >
                {p.name} ({p.tracks.length})
              </button>
              <button class="chip-del" title="Renommer la crate" onclick={() => void renameCrate(p)}>✎</button>
              <button
                class="chip-del"
                title="Supprimer la crate"
                onclick={async () => {
                  if (confirm(`Supprimer la crate « ${p.name} » ?`)) {
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
        <div class="head-actions">
          {#if openPlaylist && session.activeToken}
            <button
              class="btn"
              onclick={() => void publishOpenPlaylist()}
              title="Créer cette crate en playlist privée sur le compte YouTube actif (coût quota : ~50 unités par morceau)"
            >
              ▶ Publier sur YouTube
            </button>
          {/if}
          <button class="btn" onclick={() => void saveFavoritesAsPlaylist()} disabled={favorites.length === 0}>
            Sauver les favoris en playlist
          </button>
        </div>
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
        <p class="hint">
          Crate « {openPlaylist.name} » — ↑↓ pour réordonner, 🗑 pour retirer
          {#if sort || filter}(réordonnancement disponible sans tri ni filtre){/if}
        </p>
        {#each sortedPlaylistTracks.slice(0, plLimit) as track, i (track.videoId)}
          <TrackRow
            {track}
            {mixer}
            favorite={favoriteIds.has(track.videoId)}
            highlighted={cursor === i}
            selected={selectedIds.has(track.videoId)}
            onRowClick={(e) => handleSelect(e, i)}
            onRoute={route}
            onToggleFavorite={handleToggleFavorite}
            removeTitle="Retirer de la crate"
            onRemove={() =>
              void mutateOpenPlaylist(openPlaylist!.tracks.filter((t) => t.videoId !== track.videoId))}
            onMoveUp={!sort && !filter && i > 0
              ? () => void mutateOpenPlaylist(moveItem(openPlaylist!.tracks, i, i - 1))
              : undefined}
            onMoveDown={!sort && !filter && i < openPlaylist.tracks.length - 1
              ? () => void mutateOpenPlaylist(moveItem(openPlaylist!.tracks, i, i + 1))
              : undefined}
          />
        {/each}
        <LoadMoreSentinel
          hasMore={openPlaylist.tracks.length > plLimit}
          loading={false}
          onMore={() => (plLimit += 50)}
        />
      {:else}
        {#each sortedFavorites.slice(0, favLimit) as fav, i (fav.videoId)}
          <TrackRow
            track={fav.track}
            {mixer}
            favorite
            by={fav.by}
            highlighted={cursor === i}
            selected={selectedIds.has(fav.videoId)}
            onRowClick={(e) => handleSelect(e, i)}
            onRoute={route}
            onToggleFavorite={handleToggleFavorite}
          />
        {:else}
          <p class="hint">
            {filter ? 'Aucun favori ne correspond au filtre.' : 'Ajoute des favoris avec ☆ depuis la recherche ou l’historique.'}
          </p>
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

  {#if selectedIds.size > 0}
    <div class="bulkbar" role="toolbar" aria-label="Actions sur la sélection">
      <span class="count">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
      <span class="grp" title="Noter tous les morceaux sélectionnés">
        {#each [1, 2, 3, 4, 5] as n (n)}
          <button class="btn" onclick={() => void bulkRate(n)}>{n}★</button>
        {/each}
      </span>
      <button class="btn" onclick={() => void bulkStyle()} title="Attribuer un style à toute la sélection">✎ style</button>
      <button class="btn" onclick={() => void bulkCrate()} title="Ajouter la sélection à une crate (nom existant) ou en créer une nouvelle">➕ crate</button>
      <button class="btn" onclick={bulkAnalyze} title="Pré-analyser la sélection (waveform, BPM, tonalité) en silence">⚡</button>
      <button class="btn" onclick={() => (selectedIds = new Set())} title="Vider la sélection">✕</button>
    </div>
  {/if}
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

  .filter {
    flex: 0 1 340px;
    min-width: 90px;
    align-self: center;
    margin: 4px 6px 4px 12px;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 12px;
    padding: 3px 10px;
    font-size: 11px;
    outline: none;
  }

  .filter:focus {
    border-color: var(--yt-deck-a);
  }

  .tab.match {
    color: var(--yt-deck-c);
  }

  .tab.match:disabled {
    color: var(--yt-text-dim);
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tab.match.on {
    border-bottom-color: var(--yt-deck-c);
    color: var(--yt-deck-c);
  }

  .toolrow {
    border-bottom: 1px solid var(--yt-border);
  }

  .toolrow > :global(.sortbar) {
    border-bottom: none;
  }

  .smart {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 0 10px 6px;
  }

  select {
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 4px;
    color: var(--yt-text);
    padding: 4px 6px;
    font-size: 11px;
  }

  .head-count {
    color: var(--yt-text-dim);
    font-size: 11px;
  }

  .head-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* actions groupées sur la sélection multiple */
  .bulkbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 10px;
    border-top: 1px solid var(--yt-deck-a);
    background: var(--yt-panel-deep);
  }

  .bulkbar .count {
    font-size: 11px;
    font-weight: 700;
    color: var(--yt-deck-a);
  }

  .bulkbar .grp {
    display: inline-flex;
    gap: 2px;
  }

  /* --- Mobile : onglets sur deux lignes, filtre pleine largeur --- */
  @media (max-width: 900px) {
    nav {
      flex-wrap: wrap;
    }

    .filter {
      flex: 1 1 100%;
      order: 10;
      margin: 4px 8px 8px;
    }

    .nav-spacer {
      display: none;
    }
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
