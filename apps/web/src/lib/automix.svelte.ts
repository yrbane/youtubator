import { pickNextTrack, type AutomixCandidate } from './automix-core.js';
import { db, listFavorites, listHistory } from './library.js';
import { listLocalTracks } from './local-library.js';
import { toTrack } from './local-files.js';
import type { Mixer } from './mixer.svelte.js';
import type { Deck } from './deck.svelte.js';
import type { Track } from './tracks.js';

/** L'automix prépare le morceau suivant quand il reste moins que ça. */
const PREPARE_AT_S = 50;
/** Durée de la transition au crossfader. */
const FADE_S = 12;
/** On ne rejoue pas un des N derniers morceaux du set. */
const NO_REPEAT = 12;

/**
 * Automix intelligent : quand il est armé, l'app mixe toute seule sur les
 * decks A/B — choix du morceau suivant au tempo/tonalité compatibles
 * (bibliothèque locale + favoris + historique), chargement sur le deck
 * opposé avec SYNC, départ sur le premier cue, transition douce au
 * crossfader, et rotation à l'infini.
 */
class Automix {
  enabled = $state(false);
  status = $state('');
  next = $state<Track | null>(null);

  #mixer: Mixer | null = null;
  #route: ((track: Track, deckId: string) => Promise<void>) | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #fadeTimer: ReturnType<typeof setInterval> | null = null;
  #preparedFor: string | null = null; // videoId du morceau joué pour lequel le suivant est prêt
  #played: string[] = []; // derniers morceaux du set (anti-répétition)
  #busy = false;

  attach(mixer: Mixer, route: (track: Track, deckId: string) => Promise<void>): void {
    this.#mixer = mixer;
    this.#route = route;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.status = 'Automix armé…';
      this.#timer = setInterval(() => void this.#tick(), 1000);
      void this.#tick();
    } else {
      if (this.#timer) clearInterval(this.#timer);
      if (this.#fadeTimer) clearInterval(this.#fadeTimer);
      this.#timer = null;
      this.#fadeTimer = null;
      this.#preparedFor = null;
      this.next = null;
      this.status = '';
    }
  }

  /** Bibliothèque candidate : morceaux locaux + favoris + historique, enrichis de leur analyse. */
  async #pool(): Promise<AutomixCandidate[]> {
    const [locals, favorites, history, waveforms] = await Promise.all([
      listLocalTracks(),
      listFavorites(),
      listHistory(200),
      db.waveforms.toArray(),
    ]);
    const analysis = new Map(waveforms.map((w) => [w.videoId, { bpm: w.bpm ?? null, key: w.keyCamelot ?? null }]));
    const byId = new Map<string, Track>();
    for (const t of locals.map(toTrack)) byId.set(t.videoId, t);
    for (const f of favorites) byId.set(f.videoId, f.track);
    for (const h of history) byId.set(h.track.videoId, h.track);
    return [...byId.values()].map((t) => ({
      ...t,
      bpm: analysis.get(t.videoId)?.bpm ?? null,
      key: analysis.get(t.videoId)?.key ?? null,
    }));
  }

  async #tick(): Promise<void> {
    if (!this.enabled || this.#busy || this.#fadeTimer) return;
    const mixer = this.#mixer;
    const route = this.#route;
    if (!mixer || !route || mixer.decks.length < 2) return;
    const [a, b] = [mixer.decks[0]!, mixer.decks[1]!];
    const playing = a.isPlaying ? a : b.isPlaying ? b : null;
    const idle = playing === a ? b : a;

    this.#busy = true;
    try {
      // rien ne joue : on lance le set
      if (!playing) {
        const first = pickNextTrack(null, await this.#pool(), this.#exclusions(a, b), Math.random);
        if (!first) {
          this.status = 'Bibliothèque vide : ajoute des favoris ou des fichiers locaux.';
          return;
        }
        await route(first, a.id);
        this.#remember(first.videoId);
        this.#startDeck(a);
        mixer.crossfader = -1;
        mixer.applyVolumes();
        this.status = `▶ ${first.title}`;
        return;
      }

      const remaining = playing.durationS > 0 ? playing.durationS - playing.displayTimeS() : Infinity;

      // préparation : le morceau suivant est choisi et chargé sur le deck opposé
      if (this.#preparedFor !== playing.track?.videoId && remaining <= PREPARE_AT_S) {
        const reference = playing.track
          ? {
              videoId: playing.track.videoId,
              bpm: playing.grid ? playing.grid.bpm * playing.effectiveRate : null,
              key: playing.musicalKey?.camelot ?? null,
            }
          : null;
        const next = pickNextTrack(reference, await this.#pool(), this.#exclusions(a, b), Math.random);
        if (!next) {
          this.status = 'Plus rien à jouer : automix en pause.';
          return;
        }
        await route(next, idle.id);
        idle.synced = true;
        this.next = next;
        this.#preparedFor = playing.track?.videoId ?? null;
        this.status = `Ensuite : ${next.title}`;
        return;
      }

      // transition : départ du deck opposé + fondu au crossfader
      if (this.#preparedFor === playing.track?.videoId && remaining <= FADE_S + 3) {
        this.#startDeck(idle);
        mixer.refresh(); // sync : rate + phase
        this.#fade(playing, idle);
      }
    } finally {
      this.#busy = false;
    }
  }

  /** Jamais deux fois le même morceau : decks courants + N derniers joués. */
  #exclusions(a: Deck, b: Deck): Set<string> {
    const ids = new Set(this.#played);
    if (a.track) ids.add(a.track.videoId);
    if (b.track) ids.add(b.track.videoId);
    return ids;
  }

  #remember(videoId: string): void {
    this.#played = [...this.#played.slice(-(NO_REPEAT - 1)), videoId];
  }

  /** Démarre un deck sur son premier cue s'il en a un (on saute l'intro). */
  #startDeck(deck: Deck): void {
    if (deck.cues.length > 0) deck.seekToS(deck.cues[0]!);
    if (!deck.isPlaying) deck.togglePlay();
  }

  /** Fondu linéaire du crossfader vers le deck entrant, puis pause du sortant. */
  #fade(from: Deck, to: Deck): void {
    const mixer = this.#mixer!;
    const target = to === mixer.decks[1] ? 1 : -1;
    const start = mixer.crossfader;
    const startedAt = performance.now();
    this.status = `Transition → ${to.track?.title ?? to.id}`;
    this.#fadeTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (FADE_S * 1000));
      mixer.crossfader = start + (target - start) * progress;
      mixer.applyVolumes();
      if (progress >= 1 || !this.enabled) {
        if (this.#fadeTimer) clearInterval(this.#fadeTimer);
        this.#fadeTimer = null;
        if (this.enabled) {
          if (from.isPlaying) from.togglePlay();
          if (to.track) this.#remember(to.track.videoId);
          this.#preparedFor = null;
          this.next = null;
          this.status = `▶ ${to.track?.title ?? ''}`;
          mixer.refresh();
        }
      }
    }, 200);
  }
}

export const automix = new Automix();
