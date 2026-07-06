<script lang="ts">
  import TrackRow from './TrackRow.svelte';
  import {
    fetchLikedPlaylistId,
    fetchMyPlaylists,
    fetchPlaylistTracks,
    type YtPlaylist,
  } from '../lib/youtube-account.js';
  import { getClientId, getValidToken, signIn, signOut } from '../lib/youtube-auth.js';
  import type { Track } from '../lib/tracks.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let {
    mixer,
    favoriteIds,
    onRoute,
    onToggleFavorite,
    onOpenSettings,
  }: {
    mixer: Mixer;
    favoriteIds: Set<string>;
    onRoute: (track: Track, deckId: string) => void;
    onToggleFavorite: (track: Track) => void;
    onOpenSettings: () => void;
  } = $props();

  let connected = $state(getValidToken() !== null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let playlists = $state<YtPlaylist[]>([]);
  let likedId = $state<string | null>(null);
  let activeListId = $state<string | null>(null);
  let tracks = $state<Track[]>([]);

  const hasClientId = $derived(getClientId() !== null);

  async function connect(): Promise<void> {
    error = null;
    loading = true;
    try {
      await signIn();
      connected = true;
      await loadAccount();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function disconnect(): void {
    signOut();
    connected = false;
    playlists = [];
    tracks = [];
    activeListId = null;
  }

  async function loadAccount(): Promise<void> {
    const token = getValidToken();
    if (!token) {
      connected = false;
      return;
    }
    loading = true;
    error = null;
    try {
      [likedId, playlists] = await Promise.all([fetchLikedPlaylistId(token), fetchMyPlaylists(token)]);
      await openList(likedId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (String(e).includes('expirée')) connected = false;
    } finally {
      loading = false;
    }
  }

  async function openList(id: string): Promise<void> {
    const token = getValidToken();
    if (!token) {
      connected = false;
      return;
    }
    activeListId = id;
    loading = true;
    error = null;
    try {
      tracks = await fetchPlaylistTracks(token, id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // au montage : si un token de session est encore valide, charge le compte
  $effect(() => {
    if (connected && playlists.length === 0 && !loading) void loadAccount();
  });
</script>

{#if !hasClientId}
  <div class="empty">
    <p>
      Pour lire tes <strong>« J'aime »</strong> et tes playlists YouTube, il faut un
      <strong>Client ID OAuth</strong> Google (gratuit) :
    </p>
    <ol>
      <li>
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
          console.cloud.google.com/apis/credentials
        </a> → « Créer des identifiants » → « ID client OAuth » → type <em>Application Web</em>.
      </li>
      <li>Ajoute l'origine JavaScript autorisée : <code>{location.origin}</code></li>
      <li>Active l'API « YouTube Data API v3 » sur le projet.</li>
      <li>Colle le Client ID dans <button class="linklike" onclick={onOpenSettings}>⚙ Réglages</button>.</li>
    </ol>
  </div>
{:else if !connected}
  <div class="empty center">
    <button class="btn connect" onclick={() => void connect()} disabled={loading}>
      {loading ? 'Connexion…' : '🔑 Se connecter à YouTube'}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
  </div>
{:else}
  <div class="list-head">
    <div class="chips">
      {#if likedId}
        <button class="chip" class:on={activeListId === likedId} onclick={() => void openList(likedId!)}>
          ❤️ J'aime
        </button>
      {/if}
      {#each playlists as p (p.id)}
        <button class="chip" class:on={activeListId === p.id} onclick={() => void openList(p.id)}>
          {p.title} ({p.itemCount})
        </button>
      {/each}
    </div>
    <button class="btn" onclick={disconnect} title="Se déconnecter">Déconnexion</button>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  {#if loading}
    <p class="hint">Chargement…</p>
  {:else}
    {#each tracks as track (track.videoId)}
      <TrackRow
        {track}
        {mixer}
        favorite={favoriteIds.has(track.videoId)}
        {onRoute}
        {onToggleFavorite}
      />
    {:else}
      <p class="hint">Cette liste est vide (ou ne contient que des vidéos privées).</p>
    {/each}
  {/if}
{/if}

<style>
  .empty {
    padding: 14px 18px;
    color: var(--yt-text-dim);
    max-width: 640px;
  }

  .empty ol {
    margin: 8px 0 0;
    padding-left: 20px;
  }

  .empty li {
    margin-bottom: 4px;
  }

  .empty a,
  .linklike {
    color: var(--yt-deck-a);
  }

  .linklike {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px;
  }

  .connect {
    font-size: 13px;
    padding: 10px 18px;
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
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
  }

  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 12px;
    color: var(--yt-text);
    padding: 3px 10px;
    cursor: pointer;
    font-size: 12px;
  }

  .chip.on {
    border-color: var(--yt-deck-a);
    color: var(--yt-deck-a);
  }
</style>
