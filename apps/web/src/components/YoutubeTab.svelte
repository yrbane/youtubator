<script lang="ts">
  import TrackRow from './TrackRow.svelte';
  import {
    fetchLikedPlaylistId,
    fetchMyPlaylists,
    fetchPlaylistTracks,
    type YtPlaylist,
  } from '../lib/youtube-account.js';
  import { getClientId } from '../lib/youtube-auth.js';
  import { session } from '../lib/session.svelte.js';
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

  let loading = $state(false);
  let error = $state<string | null>(null);
  let playlists = $state<YtPlaylist[]>([]);
  let likedId = $state<string | null>(null);
  let activeListId = $state<string | null>(null);
  let tracks = $state<Track[]>([]);
  let loadedFor = $state<string | null>(null); // compte dont les listes sont affichées

  const hasClientId = $derived(getClientId() !== null);

  async function addAccount(): Promise<void> {
    error = null;
    try {
      await session.addAccount();
      await loadActiveAccount();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function activate(accountId: string): Promise<void> {
    error = null;
    try {
      await session.switchTo(accountId);
      await loadActiveAccount();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function forget(accountId: string, title: string): Promise<void> {
    if (!confirm(`Oublier le compte « ${title} » sur cet ordinateur ?`)) return;
    await session.forget(accountId);
    if (loadedFor === accountId) {
      playlists = [];
      tracks = [];
      likedId = null;
      loadedFor = null;
    }
  }

  async function loadActiveAccount(): Promise<void> {
    const token = session.activeToken;
    const active = session.active;
    if (!token || !active) return;
    loading = true;
    error = null;
    try {
      likedId = active.likedPlaylistId ?? (await fetchLikedPlaylistId(token));
      playlists = await fetchMyPlaylists(token);
      loadedFor = active.accountId;
      await openList(likedId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function openList(id: string): Promise<void> {
    const token = session.activeToken;
    if (!token) return;
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

  // token de session encore valide au montage → recharge automatiquement
  $effect(() => {
    if (session.activeToken && loadedFor !== session.activeId && !loading) {
      void loadActiveAccount();
    }
  });
</script>

{#if !hasClientId}
  <div class="empty">
    <p>
      Pour lire les <strong>« J'aime »</strong> et playlists des comptes YouTube, il faut un
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
{:else}
  <div class="accounts">
    {#each session.accounts as account (account.accountId)}
      <span
        class="account"
        class:active={account.accountId === session.activeId && session.activeToken}
        title={account.email}
      >
        <button class="who" onclick={() => void activate(account.accountId)}>
          {#if account.avatarUrl}<img src={account.avatarUrl} alt="" />{/if}
          {account.title}
          {#if account.accountId === session.activeId && !session.activeToken}
            <em>(session expirée)</em>
          {/if}
        </button>
        <button class="del" title="Oublier ce compte" onclick={() => void forget(account.accountId, account.title)}>✕</button>
      </span>
    {/each}
    <button class="btn add" onclick={() => void addAccount()} disabled={session.connecting}>
      {session.connecting ? 'Connexion…' : '+ Ajouter un compte'}
    </button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if session.activeToken && loadedFor === session.activeId}
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
    {#if loading}
      <p class="hint">Chargement…</p>
    {:else}
      {#each tracks as track (track.videoId)}
        <TrackRow {track} {mixer} favorite={favoriteIds.has(track.videoId)} {onRoute} {onToggleFavorite} />
      {:else}
        <p class="hint">Cette liste est vide (ou ne contient que des vidéos privées).</p>
      {/each}
    {/if}
  {:else if session.accounts.length === 0}
    <p class="hint">Ajoute un premier compte : chacun retrouvera ses « J'aime » et ses playlists, et on switche d'un clic pendant la soirée. 🎧</p>
  {:else if loading || session.connecting}
    <p class="hint">Chargement…</p>
  {:else}
    <p class="hint">Clique sur un compte pour reprendre sa session.</p>
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

  .accounts {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px;
    border-bottom: 1px solid var(--yt-border);
  }

  .account {
    display: inline-flex;
    align-items: center;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 16px;
    overflow: hidden;
  }

  .account.active {
    border-color: var(--yt-deck-c);
  }

  .who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--yt-text);
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
  }

  .who img {
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }

  .who em {
    color: var(--yt-text-dim);
    font-style: normal;
    font-size: 10px;
  }

  .account.active .who {
    color: var(--yt-deck-c);
    font-weight: 700;
  }

  .del {
    background: none;
    border: none;
    color: var(--yt-text-dim);
    cursor: pointer;
    padding: 4px 8px 4px 2px;
  }

  .del:hover {
    color: var(--yt-danger);
  }

  .error {
    color: var(--yt-danger);
    padding: 6px 10px;
  }

  .hint {
    color: var(--yt-text-dim);
    padding: 8px 10px;
  }

  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 8px 10px;
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
