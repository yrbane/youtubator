<script lang="ts">
  import DeckView from './components/DeckView.svelte';
  import MixerCenter from './components/MixerCenter.svelte';
  import Browser from './components/Browser.svelte';
  import Settings from './components/Settings.svelte';
  import { Mixer, MAX_DECKS } from './lib/mixer.svelte.js';
  import { recordHistory } from './lib/library.js';
  import { loadYouTubeApi } from './lib/yt-iframe.js';
  import type { Track } from './lib/tracks.js';

  const mixer = new Mixer();
  if (import.meta.env.DEV) (window as unknown as { __mixer: Mixer }).__mixer = mixer;
  let apiReady = $state(false);
  let showSettings = $state(false);
  let browser = $state<ReturnType<typeof Browser>>();

  $effect(() => {
    void loadYouTubeApi().then(() => {
      apiReady = true;
      mixer.addDeck();
      mixer.addDeck();
    });
  });

  const anyExtension = $derived(mixer.decks.some((d) => d.hasExtension));
  const anyLoaded = $derived(mixer.decks.some((d) => d.track !== null));

  async function routeTrack(track: Track, deckId: string): Promise<void> {
    const deck = mixer.decks.find((d) => d.id === deckId);
    if (!deck) return;
    if (deck.isPlaying && !confirm(`Remplacer le morceau en cours sur le deck ${deckId} ?`)) return;
    await deck.loadTrack(track);
    await recordHistory(track, deckId);
    mixer.refresh();
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    const deckA = mixer.decks[0];
    const deckB = mixer.decks[1];
    switch (e.key) {
      case ' ':
        e.preventDefault();
        deckA?.togglePlay();
        mixer.refresh();
        break;
      case 'q':
      case 'Q':
        deckB?.togglePlay();
        mixer.refresh();
        break;
      case 's':
      case 'S':
        if (deckA) {
          deckA.synced = !deckA.synced;
          mixer.refresh();
        }
        break;
      case 'l':
      case 'L':
        if (deckB) {
          deckB.synced = !deckB.synced;
          mixer.refresh();
        }
        break;
      case 'ArrowLeft':
        mixer.crossfader = Math.max(-1, mixer.crossfader - 0.1);
        mixer.applyVolumes();
        break;
      case 'ArrowRight':
        mixer.crossfader = Math.min(1, mixer.crossfader + 0.1);
        mixer.applyVolumes();
        break;
      case '/':
        e.preventDefault();
        browser?.focusSearch();
        break;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<header class="topbar">
  <h1>YOU<span>TUBATOR</span></h1>
  <button
    class="btn"
    onclick={() => {
      mixer.addDeck();
      mixer.refresh();
    }}
    disabled={mixer.decks.length >= MAX_DECKS}
  >
    + deck
  </button>
  <span class="ext" class:on={anyExtension} title={anyExtension ? 'Extension active : EQ et tempo continus' : 'Mode dégradé : installe l’extension pour l’EQ et les modes tempo'}>
    {anyExtension ? '● EXT' : '○ EXT'}
  </span>
  <span class="spacer"></span>
  <span class="hint mono">espace/Q : play · S/L : sync · ←→ : crossfader · / : recherche</span>
  <button class="btn" onclick={() => (showSettings = true)} title="Réglages">⚙</button>
</header>

{#if apiReady}
  <main class:four={mixer.decks.length > 2}>
    <div class="col left">
      {#each mixer.decks.filter((_, i) => i % 2 === 0) as deck (deck.id)}
        <DeckView {deck} {mixer} />
      {/each}
    </div>
    <MixerCenter {mixer} />
    <div class="col right">
      {#each mixer.decks.filter((_, i) => i % 2 === 1) as deck (deck.id)}
        <DeckView {deck} {mixer} />
      {/each}
    </div>
  </main>
{:else}
  <main class="loading">Chargement de l’API YouTube…</main>
{/if}

{#if !anyLoaded && apiReady}
  <p class="onboarding">👇 Cherche un morceau (ou colle une URL YouTube) puis route-le vers un deck avec →A / →B</p>
{/if}

<Browser
  bind:this={browser}
  {mixer}
  onRoute={(t, d) => void routeTrack(t, d)}
  onOpenSettings={() => (showSettings = true)}
/>

{#if showSettings}
  <Settings {mixer} onClose={() => (showSettings = false)} />
{/if}

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--yt-border);
    background: var(--yt-panel);
  }

  h1 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.12em;
    color: var(--yt-deck-a);
  }

  h1 span {
    color: var(--yt-text);
  }

  .ext {
    font-size: 10px;
    font-weight: 800;
    color: var(--yt-text-dim);
    letter-spacing: 0.08em;
  }

  .ext.on {
    color: var(--yt-deck-c);
  }

  .spacer {
    flex: 1;
  }

  .hint {
    color: var(--yt-text-dim);
    font-size: 10px;
  }

  main {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 10px;
    padding: 10px;
    min-height: 0;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .loading {
    display: grid;
    place-items: center;
    color: var(--yt-text-dim);
    padding: 40px;
  }

  .onboarding {
    margin: 0;
    padding: 4px 14px 8px;
    color: var(--yt-text-dim);
    text-align: center;
  }
</style>
