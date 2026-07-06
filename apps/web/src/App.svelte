<script lang="ts">
  import DeckView from './components/DeckView.svelte';
  import MixerCenter from './components/MixerCenter.svelte';
  import Browser from './components/Browser.svelte';
  import Settings from './components/Settings.svelte';
  import Avatar from './components/Avatar.svelte';
  import WaveformStrip from './components/WaveformStrip.svelte';
  import { Mixer, MAX_DECKS } from './lib/mixer.svelte.js';
  import { ghost } from './lib/ghost.svelte.js';
  import { midi } from './lib/midi.svelte.js';
  import { recordHistory } from './lib/library.js';
  import { session } from './lib/session.svelte.js';
  import { loadYouTubeApi } from './lib/yt-iframe.js';
  import type { Track } from './lib/tracks.js';

  const mixer = new Mixer();
  if (import.meta.env.DEV) (window as unknown as { __mixer: Mixer }).__mixer = mixer;
  let apiReady = $state(false);
  let showSettings = $state(false);
  let perfMode = $state(false);

  function togglePerf(): void {
    perfMode = !perfMode;
    if (perfMode) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen();
  }
  let browser = $state<ReturnType<typeof Browser>>();
  let ghostContainer: HTMLDivElement;

  // contrôleur MIDI → actions sur les decks et le mixer
  midi.onAction((action, value) => {
    const deck = action.includes('A') ? mixer.decks[0] : mixer.decks[1];
    switch (action) {
      case 'crossfader':
        mixer.crossfader = value * 2 - 1;
        mixer.applyVolumes();
        return;
      case 'volumeA':
      case 'volumeB':
        if (deck) {
          deck.volume = value;
          mixer.applyVolumes();
        }
        return;
      case 'tempoA':
      case 'tempoB':
        void deck?.setRate(1 + (value * 2 - 1) * mixer.tempoRange, mixer.tempoRange);
        mixer.refresh();
        return;
      case 'filterA':
      case 'filterB':
        deck?.setFilter(value * 2 - 1);
        return;
      case 'playA':
      case 'playB':
        deck?.togglePlay();
        mixer.refresh();
        return;
      case 'cueA':
      case 'cueB':
        deck?.cue();
        return;
      case 'syncA':
      case 'syncB':
        if (deck) {
          deck.synced = !deck.synced;
          mixer.refresh();
        }
        return;
    }
    const hotcue = /^hotcue[AB]([1-4])$/.exec(action);
    if (hotcue) deck?.jumpToCue(Number(hotcue[1]) - 1);
  });

  $effect(() => {
    ghost.attach(ghostContainer);
    void session.init();
    void loadYouTubeApi().then(() => {
      apiReady = true;
      mixer.addDeck();
      mixer.addDeck();
    });
  });

  const anyExtension = $derived(mixer.decks.some((d) => d.hasExtension));

  async function routeTrack(track: Track, deckId: string): Promise<void> {
    const deck = mixer.decks.find((d) => d.id === deckId);
    if (!deck) return;
    if (deck.isPlaying && !confirm(`Remplacer le morceau en cours sur le deck ${deckId} ?`)) return;
    await deck.loadTrack(track);
    await recordHistory(track, deckId, session.attribution);
    mixer.refresh();
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    const deckA = mixer.decks[0];
    const deckB = mixer.decks[1];
    // hot cues : 1-8 = deck A, Maj+1-8 = deck B (e.code → indépendant du layout AZERTY)
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 8) {
        e.preventDefault();
        (e.shiftKey ? deckB : deckA)?.jumpToCue(n - 1);
        return;
      }
    }
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
  {#if ghost.current}
    <span class="ghost-badge" title="Analyse fantôme : {ghost.current.title}{ghost.queue.length ? ` (+${ghost.queue.length} en file)` : ''}">
      ⚡ {ghost.queue.length + 1}
    </span>
  {/if}
  {#if session.active}
    <span class="user" title="Compte YouTube actif — les actions lui sont attribuées">
      <Avatar name={session.active.title} url={session.active.avatarUrl} size={26} />
      {session.active.title}
    </span>
  {/if}
  <span class="spacer"></span>
  <span class="hint mono">espace/Q : play · S/L : sync · 1-8 : cues (Maj = deck B) · ←→ : crossfader · / : recherche</span>
  <button class="btn" class:on={perfMode} onclick={togglePerf} title="Mode performance : plein écran, browser masqué, grosses waveforms">⛶</button>
  <button class="btn" onclick={() => (showSettings = true)} title="Réglages">⚙</button>
</header>

{#if apiReady}
  <main class:four={mixer.decks.length > 2}>
    <div class="col left">
      {#each mixer.decks.filter((_, i) => i % 2 === 0) as deck (deck.id)}
        <DeckView {deck} {mixer} />
      {/each}
    </div>
    <div class="mixer-slot" style="width: {44 + Math.max(2, mixer.decks.length) * 76}px">
      <MixerCenter {mixer} />
    </div>
    <div class="col right">
      {#each mixer.decks.filter((_, i) => i % 2 === 1) as deck (deck.id)}
        <DeckView {deck} {mixer} />
      {/each}
    </div>
  </main>
{:else}
  <main class="loading">Chargement de l’API YouTube…</main>
{/if}

<WaveformStrip {mixer} rowH={perfMode ? 110 : 56} />

<div class="ghost-hole" bind:this={ghostContainer}></div>

<div class="browser-zone" class:hidden={perfMode}>
  <Browser
    bind:this={browser}
    {mixer}
    onRoute={(t, d) => void routeTrack(t, d)}
    onOpenSettings={() => (showSettings = true)}
  />
</div>

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

  .browser-zone {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 220px; /* la playlist respire toujours */
  }

  .browser-zone > :global(.browser) {
    flex: 1;
    min-height: 0;
    margin: 0 10px 10px;
  }

  .browser-zone.hidden {
    display: none;
  }

  .btn.on {
    background: var(--yt-deck-a);
    color: #101318;
    border-color: transparent;
  }

  .ghost-badge {
    font-size: 11px;
    color: var(--yt-deck-d);
    font-weight: 700;
  }

  :global(.ghost-hole) {
    position: fixed;
    width: 2px;
    height: 2px;
    left: -10px;
    bottom: 0;
    overflow: hidden;
    opacity: 0.01;
    pointer-events: none;
  }

  .user {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--yt-deck-c);
    border: 1px solid var(--yt-deck-c);
    border-radius: 16px;
    padding: 3px 12px 3px 4px;
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
    flex: 0 0 auto; /* les decks dictent la hauteur, le browser prend le reste */
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  /* le mixer ne participe pas à la hauteur de la rangée : il est plafonné
     à la hauteur des decks (scroll interne au besoin) */
  .mixer-slot {
    position: relative;
    align-self: stretch;
  }

  .mixer-slot > :global(.mixer) {
    position: absolute;
    inset: 0;
    overflow-y: auto;
  }

  /* à 3-4 decks : vidéos compactées, adaptées au viewport, pour que
     les decks restent en haut et que la playlist garde sa place */
  main.four :global(.video) {
    max-height: clamp(80px, calc((100vh - 700px) / 2), 220px);
  }

  main.four :global(.deck header) {
    padding: 3px 8px;
  }

  main.four :global(.deck .body) {
    padding: 5px;
    align-items: flex-start;
  }

  main.four :global(.tempo) {
    height: 150px;
  }

  main.four :global(.tempo pt-fader) {
    min-height: 0;
  }

  main.four :global(.deck .transport) {
    gap: 3px;
  }

  .loading {
    display: grid;
    place-items: center;
    color: var(--yt-text-dim);
    padding: 40px;
  }

</style>
