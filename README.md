# 🎛️ Youtubator

> **Table de mixage DJ dans le navigateur, dont les platines sont des players YouTube.**
> Interface inspirée de Traktor : decks vidéo, mixer central (volume, EQ 3 bandes, tempo), sync, recherche/historique/favoris, playlists.

Ce document est **la spécification de référence et le prompt de développement structuré** du projet. Il est exhaustif volontairement : chaque section est directement actionnable pour implémenter le produit.

---

## Table des matières

1. [Vision & pitch](#1-vision--pitch)
2. [Glossaire](#2-glossaire)
3. [Contraintes techniques & réalité du terrain](#3-contraintes-techniques--réalité-du-terrain)
4. [Stack technique retenue](#4-stack-technique-retenue)
5. [Architecture générale](#5-architecture-générale)
6. [Spécifications fonctionnelles détaillées](#6-spécifications-fonctionnelles-détaillées)
7. [Spécification UI/UX (layout Traktor-like)](#7-spécification-uiux-layout-traktor-like)
8. [`@youtubator/controls` — lib de contrôles style Ableton](#8-youtubatorcontrols--lib-de-contrôles-style-ableton)
9. [`@youtubator/audio-engine` — moteur audio](#9-youtubatoraudio-engine--moteur-audio)
10. [Modèle de données & persistance](#10-modèle-de-données--persistance)
11. [Exigences de performance](#11-exigences-de-performance)
12. [Méthodologie : TDD, SOLID, DRY, KISS](#12-méthodologie--tdd-solid-dry-kiss)
13. [Roadmap par jalons](#13-roadmap-par-jalons)
14. [Structure du dépôt](#14-structure-du-dépôt)
15. [Critères d'acceptation globaux](#15-critères-dacceptation-globaux)
16. [Démarrage rapide](#16-démarrage-rapide)

---

## 1. Vision & pitch

Youtubator permet de **mixer plusieurs morceaux YouTube simultanément** comme sur des platines DJ :

- Chaque **deck** est un player YouTube visible (on voit la vidéo).
- Un **mixer central** offre : fader de volume par deck, crossfader, 3 potentiomètres d'égalisation (aigus / médiums / basses) par deck, un fader de **vitesse de lecture (tempo)** par deck.
- Une case **SYNC** permet d'asservir le tempo d'un deck à celui du deck maître, avec **deux modes au choix par deck** : *Master Tempo* (time-stretch : la vitesse change, la tonalité reste) ou *Vinyle* (le pitch suit la vitesse, comme une platine).
- La moitié basse de l'écran est un **browser** à 3 onglets : Recherche (routage d'un résultat vers le deck A ou B), Historique, Favoris.
- Le nombre de decks est **dynamique** (ajouter / retirer des platines, 2 par défaut).
- Les sélections sont sauvegardables en **playlists**.

Cible : Chrome (desktop), sous forme d'**extension Chrome** — c'est elle qui rend possibles l'EQ réel et les modes tempo (cf. § 3.2) ; une page web seule reste utilisable en mode dégradé. Public : DJs amateurs, curieux, mashup lovers.

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Deck** | Une platine : un player YouTube + ses contrôles de transport (play/pause/cue), son tempo-fader et son état. |
| **Mixer** | La section centrale : volumes, EQ 3 bandes, crossfader, VU-mètres. |
| **Tempo fader** | Fader vertical réglant la vitesse de lecture (`playbackRate`) d'un deck. |
| **Sync** | Asservissement du tempo d'un deck sur le deck maître (case à cocher). |
| **Browser** | Zone basse de l'écran : Recherche / Historique / Favoris. |
| **Routage** | Envoi d'un résultat de recherche vers le deck A, B, … n. |
| **Knob / potar** | Potentiomètre rotatif façon Ableton (drag vertical, double-clic = reset). |

## 3. Contraintes techniques & réalité du terrain

⚠️ **Section critique — à lire avant toute implémentation.** Elle conditionne l'architecture.

### 3.1 NaCl est mort, vive WebAssembly

**NaCl / PNaCl est déprécié et retiré de Chrome depuis 2020.** La question posée dans l'idée initiale est tranchée : si du DSP natif est nécessaire, c'est **WebAssembly dans un `AudioWorklet`**. Mais dans les faits, les nœuds natifs de la **Web Audio API** (`BiquadFilterNode`, `GainNode`, `AnalyserNode`) tournent déjà en code natif optimisé côté navigateur : **le WASM n'est justifié que pour du DSP avancé** (time-stretch, détection de BPM). On le garde en option, pas en fondation.

### 3.2 La vraie contrainte : l'iframe YouTube est cross-origin

L'API officielle [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) impose :

| Capacité | Disponible via IFrame API ? |
|---|---|
| Play / pause / seek / cue | ✅ oui |
| Volume par player (`setVolume` 0–100) | ✅ oui |
| Vitesse (`setPlaybackRate`) | ⚠️ oui, mais **paliers imposés** (0.25 → 2, pas de 0.25 en général — cf. `getAvailablePlaybackRates()`) |
| Accès au flux audio (Web Audio) | ❌ **non** — l'iframe est cross-origin, impossible de brancher `MediaElementSourceNode` |
| EQ 3 bandes réel | ❌ **impossible en page web pure** |
| Pitch fin / preservesPitch | ❌ non |

**Conséquence architecturale** : l'EQ réel et le choix time-stretch/pitch étant des **exigences fondatrices** du produit, **Youtubator est une extension Chrome (MV3) dès le départ**. La page web pure n'est qu'un mode dégradé de secours.

1. **Cœur du produit — extension Chrome (MV3)** : un content script injecté dans les iframes `youtube.com` (`all_frames: true`) accède au `<video>` **depuis l'intérieur de la frame** → `captureStream()` + graphe Web Audio local à la frame (EQ 3 bandes, gain, VU-mètre), `video.playbackRate` **continu** (0.0625 → 16) et bascule `preservesPitch` (cf. § 3.3). La page principale pilote les frames par `postMessage` (protocole typé). Le son sort par l'élément vidéo muté + `AudioContext.destination` de chaque frame.
2. **Mode dégradé — page web sans extension** : decks, volume, tempo par paliers, browser et playlists fonctionnent via l'IFrame API. L'EQ et le choix de mode tempo sont **grisés**, avec un bandeau invitant à installer l'extension.

L'abstraction `DeckAudioBackend` (interface) isole ces deux mondes : `ExtensionBackend` (nominal) et `IframeApiBackend` (dégradé). C'est le point d'application du **D** de SOLID.

### 3.3 Time-stretch vs pitch : les deux modes existent nativement

Chrome expose `HTMLMediaElement.preservesPitch` sur l'élément `<video>` (accessible uniquement depuis l'intérieur de la frame → autre raison d'être de l'extension) :

| Mode deck | `preservesPitch` | Comportement | Équivalent matériel |
|---|---|---|---|
| **Master Tempo** (défaut) | `true` | Time-stretch : la vitesse change, la **tonalité reste constante** | Touche « Master Tempo » des CDJ |
| **Vinyle** | `false` | Le **pitch suit la vitesse** (+6 % = plus aigu) | Platine vinyle |

Le time-stretch de Chrome (WSOLA) est de qualité correcte jusqu'à environ ±15–20 % ; au-delà, artefacts audibles — plage de tempo par défaut limitée à ±16 % (extensible à ±50 % dans les réglages, avec avertissement). **Aucun WASM requis** pour ces deux modes. La **transposition indépendante** (changer la tonalité *sans* changer le tempo, « key shift ») n'est pas couverte par `preservesPitch` : c'est le seul cas qui justifiera un pitch-shifter WASM (SoundTouch) en V3.

### 3.4 Recherche YouTube

- **YouTube Data API v3** (`search.list`) avec clé API fournie par l'utilisateur (champ réglages, stockée en `localStorage`). Quota : 100 unités/recherche, 10 000/jour → mettre en cache les recherches (IndexedDB, TTL 24 h).
- Fallback sans clé : saisie/collage direct d'une URL ou d'un ID YouTube dans le champ de recherche (regex de parsing d'URL).

### 3.5 Conditions d'utilisation YouTube

- Les players restent **visibles** (taille ≥ 200×200, pas de superposition) — exigence des ToS de l'IFrame API.
- Pas de téléchargement ni d'extraction de flux hors navigateur (pas de yt-dlp côté serveur). Tout se passe dans le lecteur officiel.

## 4. Stack technique retenue

| Couche | Choix | Justification |
|---|---|---|
| Langage | **TypeScript strict** partout | Fiabilité, refactors sûrs, contrats d'interface (SOLID). |
| Build | **Vite** (+ `vite-plugin-...` si besoin) | DX rapide, HMR, builds multi-cibles (page web + extension MV3). |
| UI framework | **Svelte 5 (runes)** | Réactivité fine sans virtual DOM → 60 fps garantis sur les knobs/faders/VU-mètres, bundle minuscule. |
| Lib de contrôles | **Custom Elements (Web Components) + Canvas 2D** | Framework-agnostique (réutilisable hors Svelte), rendu canvas = zéro layout/reflow pendant le drag. |
| Audio | **Web Audio API** (`BiquadFilterNode`, `GainNode`, `AnalyserNode`), `AudioWorklet` + **WASM (Rust)** en option V3 (BPM, time-stretch) | Les nœuds natifs suffisent pour EQ/gain ; WASM seulement là où il apporte réellement. |
| Player | **Extension Chrome MV3** (nominal) + YouTube IFrame Player API (mode dégradé) | Cf. § 3.2 — EQ et modes tempo exigent l'accès in-frame. |
| État | Stores Svelte (runes) + machine à états par deck | Un deck est un automate : `empty → loading → cued → playing → paused → error`. |
| Persistance | **IndexedDB** via **Dexie** | Historique, favoris, playlists, cache de recherche. `localStorage` pour les réglages simples. |
| Tests | **Vitest** (unitaires, TDD), **Playwright** (E2E Chrome) | TDD obligatoire, cf. § 12. |
| Lint/format | **ESLint + Prettier** | Convention unique. |
| Monorepo | **pnpm workspaces** | 3 paquets : `apps/web`, `packages/controls`, `packages/audio-engine`. |
| CI | **GitHub Actions** | lint + tests + build sur chaque PR. |

## 5. Architecture générale

```
┌────────────────────────────────────────────────────────────┐
│                        apps/web (Svelte)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ DeckView │ │ MixerView│ │ Browser  │ │ SettingsView  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬────────┘  │
│       │            │           │               │           │
│  ┌────▼────────────▼───────────▼───────────────▼────────┐  │
│  │              Stores (état applicatif, runes)          │  │
│  └────┬──────────────────┬──────────────────┬───────────┘  │
│       │                  │                  │              │
│  ┌────▼─────┐   ┌────────▼───────┐   ┌──────▼──────────┐   │
│  │ DeckCore │   │ SearchService  │   │ LibraryService  │   │
│  │ (machine │   │ (Data API v3 + │   │ (Dexie: favoris,│   │
│  │ à états) │   │  cache + URL)  │   │ historique,     │   │
│  └────┬─────┘   └────────────────┘   │ playlists)      │   │
│       │                              └─────────────────┘   │
│  ┌────▼──────────────────────────┐                         │
│  │ DeckAudioBackend (interface)  │  ◄── inversion de dép.  │
│  ├───────────────┬───────────────┤                         │
│  │IframeApiBackend│ExtensionBackend│                        │
│  │ (MVP)          │ (V2, MV3)     │                        │
│  └───────────────┴───────────────┘                         │
└────────────────────────────────────────────────────────────┘
     packages/controls (Web Components)   packages/audio-engine
```

### Contrat central : `DeckAudioBackend`

```ts
interface DeckAudioBackend {
  load(videoId: string): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setVolume(v: number): void;              // 0..1
  setPlaybackRate(rate: number): Promise<number>; // retourne le rate effectif
  getAvailableRates(): number[];           // paliers (MVP) ou continu (V2)
  setEq(band: 'low' | 'mid' | 'high', gainDb: number): boolean; // false si non supporté
  setTempoMode(mode: 'master-tempo' | 'vinyl'): boolean; // preservesPitch true/false
  readonly capabilities: DeckCapabilities; // { eq: boolean; continuousRate: boolean; tempoModes: boolean; ... }
  onStateChange(cb: (s: PlayerState) => void): Unsubscribe;
  onTimeUpdate(cb: (t: TimeInfo) => void): Unsubscribe;
  destroy(): void;
}
```

L'UI interroge `capabilities` pour griser l'EQ en MVP — **jamais** de `if (isExtension)` disséminés dans les vues.

## 6. Spécifications fonctionnelles détaillées

### 6.1 Decks (platines)

- **F-DECK-01** : 2 decks par défaut (A à gauche, B à droite), vidéos **visibles** (16:9, ≥ 320 px de large).
- **F-DECK-02** : transport par deck — Play/Pause, Cue (retour au point de cue, défini au dernier arrêt), Stop, seek par clic sur barre de progression.
- **F-DECK-03** : affichage — titre, chaîne, durée, temps écoulé/restant, vitesse effective (`×1.06`), état (machine à états visible via couleur du deck).
- **F-DECK-04** : **tempo fader** vertical par deck, **continu**, plage ±16 % par défaut (±50 % en réglage avancé, avec avertissement qualité). Double-clic = retour à ×1.00. En mode dégradé sans extension : snap aux paliers de l'IFrame API avec indication des crans.
- **F-DECK-04b** : bascule **mode tempo** par deck — bouton `MT` (Master Tempo, time-stretch, défaut) / `VINYL` (le pitch suit la vitesse), via `preservesPitch` (§ 3.3). Changement possible en cours de lecture, sans coupure. Affichage du pitch résultant en demi-tons en mode Vinyle (ex. « −0.8 st »).
- **F-DECK-05** : ajouter un deck (bouton `+`, max 4) / retirer un deck (croix, avec confirmation si en lecture). Les decks C et D s'insèrent dans la grille, le mixer s'adapte (un channel strip par deck).
- **F-DECK-06** : chargement d'un morceau dans un deck **en lecture** → confirmation (« Remplacer le morceau en cours ? »).

### 6.2 Mixer

- **F-MIX-01** : un **channel strip** par deck : fader de volume vertical (loi logarithmique, 0 dB en haut, −∞ en bas) + 3 knobs EQ (HI / MID / LOW, ±12 dB, centre cranté) + bouton **kill** par bande + VU-mètre.
- **F-MIX-02** : **crossfader** horizontal A↔B (courbe réglable : constant power / sharp cut). Avec > 2 decks, chaque deck est assignable au côté A, B ou THRU.
- **F-MIX-03** : EQ **réel dès le nominal** : `BiquadFilterNode` low-shelf 320 Hz / peaking 1 kHz / high-shelf 3.2 kHz, kill = −40 dB. En mode dégradé sans extension : contrôles grisés + bandeau « Installer l'extension Youtubator ».
- **F-MIX-04** : VU-mètres réels par deck (`AnalyserNode`). Mode dégradé : approximation depuis le volume.

### 6.3 Sync

- **F-SYNC-01** : case **SYNC** par deck. Le premier deck en lecture est **maître** (badge « MASTER »).
- **F-SYNC-02** : cocher SYNC sur un deck esclave aligne son `playbackRate` sur le rate du maître ; bouger le tempo du maître propage aux esclaves synchronisés. Chaque deck garde **son propre mode tempo** (Master Tempo ou Vinyle) pendant la sync — le mode définit l'effet sonore du rate, pas sa valeur.
- **F-SYNC-03** : sync de phase basique — boutons « nudge » (+/− momentané, ±2 % tant que pressé) pour caler manuellement les temps.
- **F-SYNC-04 (V3)** : beatmatching automatique — détection de BPM (WASM, autocorrélation) et alignement rate = BPM_maître / BPM_esclave, puis calage de phase assisté.

### 6.4 Browser (zone basse, 3 onglets)

- **F-BRW-01 — Recherche** : champ texte (déclenchement à Entrée, debounce 300 ms en saisie continue), résultats en liste (miniature, titre, chaîne, durée). Chaque ligne porte des boutons **→ A**, **→ B** (et C/D si présents) + ⭐ favori. Accepte aussi une URL/ID YouTube collée.
- **F-BRW-02 — Historique** : tout morceau chargé dans un deck est horodaté et ajouté en tête. Regroupement par session de mix. Mêmes actions de routage. Vidage possible.
- **F-BRW-03 — Favoris** : liste ordonnable (drag & drop), ajout/retrait par ⭐ partout dans l'app.
- **F-BRW-04 — Playlists** : créer/renommer/supprimer une playlist ; y ajouter depuis recherche/historique/favoris (menu contextuel) ; export/import JSON.

### 6.5 Réglages

- **F-SET-01** : clé API YouTube Data v3 (champ masqué + lien d'aide).
- **F-SET-02** : courbe du crossfader, nombre de decks par défaut, plage du tempo fader (±16 % défaut / ±50 % avec avertissement), mode tempo par défaut (Master Tempo), thème (dark par défaut).
- **F-SET-03** : raccourcis clavier (voir § 7.4).

## 7. Spécification UI/UX (layout Traktor-like)

### 7.1 Layout global (dark theme, esthétique Traktor/Ableton)

```
┌───────────────────────────────────────────────────────────────────┐
│ HEADER  ── logo ── [+ deck] ─────────────── [réglages ⚙] [aide ?] │
├───────────────────────────┬───────────┬───────────────────────────┤
│         DECK A            │   MIXER   │          DECK B           │
│ ┌───────────────────────┐ │ ┌──┐ ┌──┐ │ ┌───────────────────────┐ │
│ │      VIDÉO A          │ │ │HI│ │HI│ │ │       VIDÉO B         │ │
│ │      (16:9)           │ │ │MD│ │MD│ │ │       (16:9)          │ │
│ └───────────────────────┘ │ │LO│ │LO│ │ └───────────────────────┘ │
│ titre ─ temps ─ ×1.00     │ │  │ │  │ │ titre ─ temps ─ ×1.00     │
│ [CUE][PLAY][SYNC☐] ▐TEMPO │ │V │ │V │ │ TEMPO▌ [SYNC☐][PLAY][CUE] │
│ [MT|VINYL]          ▐FADER│ │O │ │O │ │ FADER▌         [MT|VINYL] │
│                           │ │L │ │L │ │                           │
│                           │ └──┘ └──┘ │                           │
│                           │ ◄─XFADER─►│                           │
├───────────────────────────┴───────────┴───────────────────────────┤
│ [ RECHERCHE ] [ HISTORIQUE ] [ FAVORIS ]              [playlists ▾]│
│ ┌────────────────────────────────────────────────────────────────┐│
│ │ 🔍 champ de recherche / URL                                     ││
│ │ ▸ résultat 1 ─ miniature ─ titre ─ durée ─ [→A] [→B] [⭐]       ││
│ │ ▸ résultat 2 ...                                                ││
│ └────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

- Ratio vertical : ~60 % decks+mixer / ~40 % browser (splitter ajustable).
- À 3–4 decks : grille 2×2 de vidéos plus petites, mixer élargi à n channel strips.

### 7.2 Interactions des contrôles (héritées d'Ableton/Traktor)

- **Knob** : drag **vertical** (pas horizontal), sensibilité 200 px = pleine course ; `Shift` = précision ×10 ; double-clic = valeur par défaut ; molette = incréments fins ; anneau de valeur lumineux autour du potar.
- **Fader** : drag vertical, double-clic = défaut, molette supportée.
- **Crossfader** : drag horizontal, double-clic = centre.
- Tous les contrôles éditables au clavier (focus + flèches) — accessibilité ARIA (`role="slider"`, `aria-valuenow`…).

### 7.3 Thème

Palette sombre type Traktor : fond `#1a1d21`, panneaux `#24282e`, accents deck A **cyan** `#19c2ff`, deck B **orange** `#ff8a1e` (C vert, D violet), texte `#d7dce2`. Typo : Inter / mono pour les temps. Tokens CSS custom properties (`--yt-deck-a`, …) — **une seule source de vérité** (DRY).

### 7.4 Raccourcis clavier

| Touche | Action |
|---|---|
| `Espace` / `Q` | Play/Pause deck A / deck B |
| `Maj+Q` etc. | Cue |
| `S` / `L` | Sync A / B |
| `←→` | Crossfader par pas |
| `1..4` | Focus deck n |
| `/` | Focus recherche |

## 8. `@youtubator/controls` — lib de contrôles style Ableton

Paquet **autonome, publiable sur npm**, zéro dépendance runtime, Custom Elements :

| Composant | Tag | Attributs/props principaux |
|---|---|---|
| Potentiomètre | `<yt-knob>` | `min max value default step curve="lin|log" arc bipolar label unit` |
| Fader | `<yt-fader>` | `min max value default orientation="v|h" curve detents` |
| Crossfader | `<yt-crossfader>` | `value curve="constant-power|sharp"` |
| VU-mètre | `<yt-vumeter>` | `value peak segments` |
| Bouton | `<yt-button>` | `toggle latching led-color` |
| Sélecteur cranté | `<yt-stepper>` | `options value` |

- **Rendu** : Canvas 2D dans shadow DOM, `devicePixelRatio`-aware, redraw uniquement sur changement (dirty flag) via `requestAnimationFrame`.
- **Événements** : `input` (continu), `change` (relâchement), `CustomEvent<number>` typés.
- **Accessibilité** : `role="slider"`, gestion clavier, `aria-label`.
- **Theming** : via CSS custom properties héritées (`--ctl-accent`, `--ctl-track`…).
- **Tests** : chaque composant est développé en TDD (Vitest + happy-dom, tests d'interaction pointeur simulée).
- Interdiction de dépendre de Svelte : la lib doit fonctionner dans une page HTML nue (fichier `demo/index.html` de démonstration/documentation vivante).

## 9. `@youtubator/audio-engine` — moteur audio

- Implémente `DeckAudioBackend` (× 2 : `ExtensionBackend` nominal, `IframeApiBackend` dégradé).
- **`ExtensionBackend`** (nominal) : protocole `postMessage` versionné (`{ v: 1, type: 'SET_EQ', band, gainDb }` / `SET_TEMPO_MODE` / `SET_RATE` / …), handshake de détection de l'extension, timeouts et retries.
- **Graphe audio (dans la frame YouTube)** : `videoEl.captureStream() → MediaStreamSource → low-shelf → peaking → high-shelf → GainNode → AnalyserNode → destination`, vidéo mutée. Modes tempo : `videoEl.playbackRate` (continu) + `videoEl.preservesPitch` (`true` = Master Tempo / `false` = Vinyle).
- **`IframeApiBackend`** (dégradé) : wrapper typé et testable de l'IFrame API (chargement du script `https://www.youtube.com/iframe_api` isolé derrière une factory injectable → mockable en test).
- Module `sync/` : logique maître/esclaves pure (fonctions pures, 100 % testables sans DOM).
- Module V3 (optionnel, WASM Rust via `AudioWorklet`) : détection de BPM (autocorrélation / onset detection) et **key shift** (transposer la tonalité à tempo constant, SoundTouch) — le seul besoin que `preservesPitch` ne couvre pas.

## 10. Modèle de données & persistance

```ts
interface Track   { videoId: string; title: string; channel: string;
                    durationS: number; thumbnailUrl: string; }
interface HistoryEntry { track: Track; loadedAt: number; deckId: string; sessionId: string; }
interface Favorite     { track: Track; addedAt: number; order: number; }
interface Playlist     { id: string; name: string; tracks: Track[];
                         createdAt: number; updatedAt: number; }
interface Settings     { ytApiKey?: string; xfaderCurve: 'constant-power' | 'sharp';
                         defaultDeckCount: 2 | 3 | 4; shortcuts: Record<string, string>; }
```

- Dexie : tables `history`, `favorites`, `playlists`, `searchCache` (clé = requête normalisée, TTL 24 h).
- Export/import playlists : fichier JSON versionné (`{ schema: 1, playlists: [...] }`).

## 11. Exigences de performance

- **P-01** : interactions des contrôles à **60 fps** pendant le drag (aucun re-layout : canvas + `transform` uniquement).
- **P-02** : l'application reste fluide avec **4 players YouTube actifs** — les vues non critiques (browser) se mettent à jour hors `rAF` des contrôles.
- **P-03** : bundle initial de `apps/web` < 200 kB gzip (hors iframes YouTube).
- **P-04** : audio V2 — latence de traitement EQ imperceptible (graphe natif, pas de worklet JS sur le chemin critique).
- **P-05** : budget mémoire mesuré (heap snapshot) à chaque jalon ; pas de fuite au montage/démontage de decks (tests dédiés `destroy()`).
- **P-06** : Lighthouse perf ≥ 90 sur la page sans decks chargés.

## 12. Méthodologie : TDD, SOLID, DRY, KISS

- **TDD strict** : red → green → refactor. Aucun code de prod sans test qui échoue d'abord. Cibles : logique de sync, machines à états des decks, services (search/library), composants controls (interactions), backends (mockés).
- **SOLID** :
  - *S* — un module = une responsabilité (`DeckCore` ne connaît ni YouTube ni le DOM).
  - *O* — nouveaux backends/decks sans modifier l'existant.
  - *L* — `IframeApiBackend` et `ExtensionBackend` interchangeables via `capabilities`.
  - *I* — interfaces fines (`Playable`, `RateControllable`, `Equalizable`).
  - *D* — les vues dépendent d'abstractions, injection par factories.
- **DRY** : tokens de thème uniques, protocole `postMessage` défini une fois (types partagés), pas de duplication MVP/V2 (le backend est la seule variance).
- **KISS** : pas de WASM tant que la Web Audio native suffit ; pas de Redux ; pas de serveur (app 100 % statique, déployable sur GitHub Pages).
- **Conventions** : code et identifiants **en anglais**, commentaires et messages de commit **en français** (Conventional Commits : `feat: ajoute le tempo fader du deck`).

## 13. Roadmap par jalons

| Jalon | Contenu | Definition of Done |
|---|---|---|
| **M0 — Socle** | Monorepo pnpm, TS strict, Vite, Vitest, ESLint/Prettier, CI GitHub Actions | `pnpm test` et `pnpm build` verts en CI |
| **M1 — Controls** | `@youtubator/controls` complet + démo HTML | Tous composants testés, démo interactive |
| **M2 — Extension & Decks** | Extension MV3 minimale, `ExtensionBackend`, `DeckCore`, 2 decks avec vidéo, transport, volume, **tempo continu + modes MT/Vinyle** | Ralentir un morceau à −8 % en Master Tempo (tonalité stable) puis en Vinyle (pitch qui baisse) |
| **M3 — Mixer & Sync** | Channel strips, **EQ 3 bandes réel + kills**, VU réels, crossfader, SYNC maître/esclave, nudge, raccourcis clavier | Scénario E2E Playwright « mix de 2 titres avec kill des basses » vert |
| **M4 — Browser** | Recherche (Data API + URL), historique, favoris, playlists, Dexie | Routage → deck fonctionnel, données persistées |
| **M5 — Decks dynamiques** | Ajout/retrait de decks (2→4), layout adaptatif | 4 decks fluides (P-02) |
| **M6 — Mode dégradé** | `IframeApiBackend`, détection d'extension, bandeau d'installation, EQ/modes grisés | L'app reste utilisable (volume + tempo à paliers) sans extension |
| **M7 — Polish** | Thème final, a11y, i18n fr/en, GitHub Pages + Chrome Web Store | Lighthouse ≥ 90, publication CWS |

## 14. Structure du dépôt

```
youtubator/
├── apps/
│   └── web/                    # Application Svelte 5 (Vite)
│       ├── src/
│       │   ├── components/     # DeckView, MixerView, Browser, Settings
│       │   ├── stores/         # état applicatif (runes)
│       │   ├── services/       # SearchService, LibraryService
│       │   └── main.ts
│       └── ...
├── packages/
│   ├── controls/               # @youtubator/controls (Web Components, 0 dép.)
│   │   ├── src/
│   │   └── demo/index.html
│   └── audio-engine/           # @youtubator/audio-engine (backends, sync, types)
│       └── src/
│           ├── backends/       # iframe-api/, extension/
│           ├── sync/
│           └── types.ts
├── extension/                  # (M2) Extension Chrome MV3 — cœur du produit
├── docs/                       # décisions d'architecture (ADR)
├── idea.md                     # idée d'origine
└── README.md                   # ce document
```

## 15. Critères d'acceptation globaux

1. Je peux charger deux morceaux YouTube, les lire **simultanément**, voir les deux vidéos, et passer de l'un à l'autre au crossfader sans coupure.
2. Je peux ralentir un deck à −8 % **sans que la tonalité change** (Master Tempo), basculer en mode **Vinyle** et entendre le pitch descendre, cocher SYNC sur l'autre deck et voir son tempo s'aligner.
3. Je peux chercher « daft punk », router un résultat vers B, le retrouver dans l'historique, le mettre en favori, et le sauver dans une playlist qui survit au rechargement de la page.
4. Je peux passer à 4 decks puis revenir à 2 sans fuite mémoire ni freeze.
5. Couper les basses du deck A (kill LOW) s'entend immédiatement ; sans extension, l'app fonctionne en mode dégradé avec EQ grisé et bandeau d'installation.
6. `pnpm test` : 100 % vert ; couverture ≥ 90 % sur `packages/*`.

## 16. Démarrage rapide

```bash
pnpm install
pnpm dev          # lance apps/web
pnpm test         # Vitest sur tout le monorepo
pnpm build        # build de production
```

---

*Projet sous licence MIT. Idée d'origine : [idea.md](./idea.md).*
