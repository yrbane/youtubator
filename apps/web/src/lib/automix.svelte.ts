import { fadeProgress, pickNextTrack, type AutomixCandidate } from './automix-core.js';
import {
  AUTOMIX_SETTINGS_DEFAULTS,
  AUTOMIX_STORAGE_KEY,
  parseAutomixSettings,
  sanitizeAutomixSettings,
  serializeAutomixSettings,
  type AutomixSettings,
} from './automix-settings.js';
import { db, listFavorites, listHistory } from './library.js';
import { listLocalTracks } from './local-library.js';
import { toTrack } from './local-files.js';
import type { Mixer } from './mixer.svelte.js';
import type { Deck } from './deck.svelte.js';
import type { Track } from './tracks.js';

/**
 * Automix intelligent : quand il est armé, l'app mixe toute seule sur les
 * decks A/B — choix du morceau suivant au tempo/tonalité compatibles selon
 * les réglages (sources, tolérance BPM, mode tonalité, durées, hasard),
 * chargement sur le deck opposé avec SYNC, départ sur cue ou début,
 * transition au crossfader (courbe et durée réglables, basses échangées),
 * et rotation à l'infini. « Mixer maintenant » force la transition.
 */
class Automix {
  enabled = $state(false);
  status = $state('');
  next = $state<Track | null>(null);
  settings = $state<AutomixSettings>(loadSettings());

  #mixer: Mixer | null = null;
  #route: ((track: Track, deckId: string) => Promise<void>) | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #fadeTimer: ReturnType<typeof setInterval> | null = null;
  #preparedFor: string | null = null; // videoId du morceau joué pour lequel le suivant est prêt
  #played: string[] = []; // derniers morceaux du set (anti-répétition)
  #busy = false;
  #skipAsked = false; // « Mixer maintenant » : transition dès que possible

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
      this.#skipAsked = false;
      this.next = null;
      this.status = '';
    }
  }

  /** Applique et persiste un changement de réglage (bornes garanties). */
  updateSettings(patch: Partial<AutomixSettings>): void {
    this.settings = sanitizeAutomixSettings({ ...this.settings, ...patch });
    saveSettings(this.settings);
  }

  resetSettings(): void {
    this.settings = { ...AUTOMIX_SETTINGS_DEFAULTS };
    saveSettings(this.settings);
  }

  /** Force la transition vers le morceau suivant sans attendre la fin. */
  skip(): void {
    if (!this.enabled || this.#fadeTimer) return;
    this.#skipAsked = true;
    void this.#tick();
  }

  /** Bibliothèque candidate selon les sources cochées, enrichie de son analyse. */
  async #pool(): Promise<AutomixCandidate[]> {
    const s = this.settings;
    const [locals, favorites, history, waveforms] = await Promise.all([
      s.sourceLocal ? listLocalTracks() : Promise.resolve([]),
      s.sourceFavorites ? listFavorites() : Promise.resolve([]),
      s.sourceHistory ? listHistory(200) : Promise.resolve([]),
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

  #pickOptions(): Parameters<typeof pickNextTrack>[4] {
    const s = this.settings;
    return {
      bpmTolerancePct: s.bpmTolerancePct,
      keyMode: s.keyMode,
      minDurationS: s.minDurationS,
      maxDurationS: s.maxDurationS,
      pickFrom: s.pickFrom,
    };
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
        this.#skipAsked = false;
        const first = pickNextTrack(null, await this.#pool(), this.#exclusions(a, b), Math.random, this.#pickOptions());
        if (!first) {
          this.status = 'Bibliothèque vide (ou sources décochées) : rien à jouer.';
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
      const mustPrepare = remaining <= this.settings.prepareAtS || this.#skipAsked;
      if (this.#preparedFor !== playing.track?.videoId && mustPrepare) {
        const reference = playing.track
          ? {
              videoId: playing.track.videoId,
              bpm: playing.grid ? playing.grid.bpm * playing.effectiveRate : null,
              key: playing.musicalKey?.camelot ?? null,
            }
          : null;
        const next = pickNextTrack(reference, await this.#pool(), this.#exclusions(a, b), Math.random, this.#pickOptions());
        if (!next) {
          this.status =
            this.settings.keyMode === 'strict'
              ? 'Rien d’harmoniquement compatible : automix en attente (mode strict).'
              : 'Plus rien à jouer : automix en pause.';
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
      const mustFade = remaining <= this.settings.fadeS + 3 || this.#skipAsked;
      if (this.#preparedFor === playing.track?.videoId && mustFade) {
        this.#skipAsked = false;
        const restoreKills = this.#prepareBassSwap(playing, idle);
        this.#startDeck(idle);
        mixer.refresh(); // sync : rate + phase
        this.#fade(playing, idle, restoreKills);
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
    const n = this.settings.noRepeat;
    if (n <= 0) {
      this.#played = [];
      return;
    }
    this.#played = [...this.#played.slice(-(n - 1)), videoId].slice(-n);
  }

  /** Démarre un deck selon le réglage : premier cue (on saute l'intro) ou début. */
  #startDeck(deck: Deck): void {
    const cue = this.settings.startMode === 'cue' ? deck.cues[0] : undefined;
    if (cue !== undefined) deck.seekToS(cue);
    if (!deck.isPlaying) deck.togglePlay();
  }

  /**
   * Échange de basses : le low du deck entrant est coupé avant son départ,
   * puis les kills basculent au milieu du fondu. Retourne la restauration
   * des états initiaux (déclenchée en fin de transition).
   */
  #prepareBassSwap(from: Deck, to: Deck): () => void {
    if (!this.settings.bassSwap) return () => {};
    const fromKilled = from.kills.low;
    const toKilled = to.kills.low;
    if (!to.kills.low) to.toggleKill('low');
    return () => {
      if (from.kills.low !== fromKilled) from.toggleKill('low');
      if (to.kills.low !== toKilled) to.toggleKill('low');
    };
  }

  /** Fondu du crossfader vers le deck entrant (courbe réglable), puis pause du sortant. */
  #fade(from: Deck, to: Deck, restoreKills: () => void): void {
    const mixer = this.#mixer!;
    const target = to === mixer.decks[1] ? 1 : -1;
    const start = mixer.crossfader;
    const startedAt = performance.now();
    const { fadeS, fadeCurve, bassSwap } = this.settings;
    let swapped = !bassSwap; // rien à basculer si l'échange est désactivé
    this.status = `Transition → ${to.track?.title ?? to.id}`;
    this.#fadeTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (fadeS * 1000));
      const eased = fadeProgress(progress, fadeCurve);
      mixer.crossfader = start + (target - start) * eased;
      mixer.applyVolumes();
      if (!swapped && progress >= 0.5) {
        swapped = true;
        if (!from.kills.low) from.toggleKill('low');
        if (to.kills.low) to.toggleKill('low');
      }
      if (progress >= 1 || !this.enabled) {
        if (this.#fadeTimer) clearInterval(this.#fadeTimer);
        this.#fadeTimer = null;
        if (from.isPlaying && this.enabled) from.togglePlay();
        restoreKills();
        if (this.enabled) {
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

function loadSettings(): AutomixSettings {
  try {
    return parseAutomixSettings(globalThis.localStorage?.getItem(AUTOMIX_STORAGE_KEY) ?? null);
  } catch {
    return { ...AUTOMIX_SETTINGS_DEFAULTS };
  }
}

function saveSettings(settings: AutomixSettings): void {
  try {
    // copie plane : settings est un Proxy $state, non clonable tel quel
    globalThis.localStorage?.setItem(AUTOMIX_STORAGE_KEY, serializeAutomixSettings({ ...settings }));
  } catch {
    // stockage indisponible (navigation privée…) : réglages de session seulement
  }
}

export const automix = new Automix();
