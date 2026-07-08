<script lang="ts">
  import DeckView from './components/DeckView.svelte';
  import MixerCenter from './components/MixerCenter.svelte';
  import Browser from './components/Browser.svelte';
  import Settings from './components/Settings.svelte';
  import Avatar from './components/Avatar.svelte';
  import WaveformStrip from './components/WaveformStrip.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import Logo from './components/Logo.svelte';
  import { ONBOARDING_SKIP_KEY, shouldShowOnboarding } from './lib/onboarding.js';
  import { Mixer, MAX_DECKS } from './lib/mixer.svelte.js';
  import { ghost } from './lib/ghost.svelte.js';
  import { midi } from './lib/midi.svelte.js';
  import { ui } from './lib/ui.svelte.js';
  import { isBrowserHidden } from './lib/ui-prefs.js';
  import { recordHistory } from './lib/library.js';
  import { meta } from './lib/meta.svelte.js';
  import { preview } from './lib/preview.svelte.js';
  import { session } from './lib/session.svelte.js';
  import { loadYouTubeApi } from './lib/yt-iframe.js';
  import type { Track } from './lib/tracks.js';

  const mixer = new Mixer();
  if (import.meta.env.DEV) (window as unknown as { __mixer: Mixer }).__mixer = mixer;
  let apiReady = $state(false);
  let showSettings = $state(false);
  let perfMode = $state(false);
  let showOnboarding = $state(false);

  function togglePerf(): void {
    perfMode = !perfMode;
    if (perfMode) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen();
  }

  // splitter : redimensionner la zone browser au drag
  let splitStartY = 0;
  let splitStartH = 0;

  function onSplitMove(e: PointerEvent): void {
    ui.setBrowserHeight(splitStartH + (splitStartY - e.clientY));
  }

  function onSplitEnd(): void {
    window.removeEventListener('pointermove', onSplitMove);
    window.removeEventListener('pointerup', onSplitEnd);
  }

  function onSplitStart(e: PointerEvent): void {
    e.preventDefault();
    splitStartY = e.clientY;
    splitStartH = ui.browserHeight;
    window.addEventListener('pointermove', onSplitMove);
    window.addEventListener('pointerup', onSplitEnd);
  }
  let browser = $state<ReturnType<typeof Browser>>();
  let ghostContainer: HTMLDivElement;
  let previewContainer: HTMLDivElement;

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
    preview.attach(previewContainer);
    // accueil : connexion Google proposée avant l'interface, au premier lancement
    void session.init().then(() => {
      showOnboarding = shouldShowOnboarding(
        session.accounts.length,
        localStorage.getItem(ONBOARDING_SKIP_KEY) === '1',
      );
    });
    void meta.init();
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
    preview.stop(); // la pré-écoute cède la place au vrai chargement
    await deck.loadTrack(track);
    await recordHistory(track, deckId, session.attribution);
    await meta.recordPlay(track.videoId); // compteurs de lecture (session + total)
    ui.setBrowserMax(false); // morceau trouvé et chargé : retour à la vue mix
    mixer.refresh();
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    // Échap quitte le plein écran browser, même depuis le champ de recherche
    if (e.key === 'Escape' && ui.browserMax) {
      ui.setBrowserMax(false);
      (target as HTMLElement & { blur?: () => void }).blur?.();
      return;
    }
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
        // browser masqué (☰ off ou mode performance) : plein écran momentané
        if (isBrowserHidden({ perfMode, visible: ui.browserVisible, maximized: ui.browserMax }))
          ui.setBrowserMax(true);
        setTimeout(() => browser?.focusSearch());
        break;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if showOnboarding}
  <Onboarding onDone={() => (showOnboarding = false)} />
{/if}

<header class="topbar">
  <Logo size={26} />
  <h1>YOU<span>TUBATOR</span></h1>
  <span class="version mono" title="Version de l'application (CHANGELOG.md pour le détail)">v{__APP_VERSION__}</span>
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
  <span class="hint mono">espace/Q : play · S/L : sync · 1-8 : cues (Maj = deck B) · ←→ : crossfader · / : recherche (plein écran si masqué) · Échap : réduire</span>
  <div class="toggles" role="group" aria-label="Affichage">
    <button class="btn" class:on={ui.showVideo} onclick={() => ui.toggleVideo()} title="Afficher / masquer les vidéos (la lecture continue, seul l'affichage est replié)">🎞</button>
    <button class="btn" class:on={ui.showWaves} onclick={() => ui.toggleWaves()} title="Afficher / masquer les waveforms (les blocs cues et loops restent)">〰</button>
    <button class="btn" class:on={ui.browserVisible} onclick={() => ui.toggleBrowser()} title="Afficher / masquer le browser (recherche, historique, favoris) — redimensionnable en glissant sa poignée">☰</button>
    <button class="btn" onclick={() => ui.bumpFontScale(-0.1)} title="Réduire les vignettes des morceaux (listes du browser)">A−</button>
    <button class="btn" onclick={() => ui.bumpFontScale(0.1)} title="Agrandir les vignettes des morceaux (listes du browser)">A+</button>
  </div>
  <button class="btn" class:on={perfMode} onclick={togglePerf} title="Mode performance : plein écran, browser masqué, grosses waveforms">⛶</button>
  <button class="btn" onclick={() => (showSettings = true)} title="Réglages : clés API, compte YouTube, MIDI, crate, tempo">⚙</button>
</header>

{#if apiReady}
  <main class:four={mixer.decks.length > 2} class:no-video={!ui.showVideo}>
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

<WaveformStrip {mixer} rowH={perfMode ? 110 : 56} showWaves={ui.showWaves} />

<div class="ghost-hole" bind:this={ghostContainer}></div>
<div class="ghost-hole" bind:this={previewContainer}></div>

<div
  class="browser-zone"
  class:hidden={isBrowserHidden({ perfMode, visible: ui.browserVisible, maximized: ui.browserMax })}
  class:max={ui.browserMax}
  style="height: {ui.browserMax ? 'auto' : `${ui.browserHeight}px`}; --track-scale: {ui.fontScale}"
>
  <div
    class="splitter"
    onpointerdown={onSplitStart}
    title="Glisser pour redimensionner le browser · bouton ☰ en haut pour le masquer"
    role="separator"
    aria-orientation="horizontal"
  ></div>
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

  .version {
    font-size: 9px;
    color: var(--yt-text-dim);
    align-self: flex-end;
    margin: 0 0 2px -8px;
    cursor: help;
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
    flex: 0 1 auto; /* hauteur pilotée par le splitter, borne basse garantie */
    min-height: 140px;
    margin-top: auto; /* colle le browser en bas quand il reste de la place */
  }

  .toggles {
    display: flex;
    gap: 4px;
  }

  .splitter {
    height: 8px;
    margin: 0 10px;
    cursor: row-resize;
    border-radius: 4px;
    background: transparent;
    position: relative;
    flex: 0 0 auto;
  }

  .splitter::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 3px;
    transform: translateX(-50%);
    width: 64px;
    height: 3px;
    border-radius: 2px;
    background: var(--yt-border);
  }

  .splitter:hover::after {
    background: var(--yt-deck-a);
  }

  /* vidéos repliées : la lecture continue, seul l'affichage est réduit */
  main.no-video :global(.video) {
    aspect-ratio: auto;
    height: 6px;
    max-height: 6px;
    opacity: 0.25;
  }

  main.no-video :global(.placeholder) {
    display: none;
  }

  .browser-zone > :global(.browser) {
    flex: 1;
    min-height: 0;
    margin: 0 10px 10px;
  }

  .browser-zone.hidden {
    display: none;
  }

  /* plein écran momentané : recouvre les decks, la lecture continue dessous */
  .browser-zone.max {
    position: fixed;
    inset: 0;
    z-index: 60;
    min-height: 0;
    margin: 0;
    padding-top: 6px;
    background: var(--yt-bg);
  }

  .browser-zone.max .splitter {
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
