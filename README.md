# 🎛️ Youtubator

![version](https://img.shields.io/badge/version-0.9.0-blue) — voir [CHANGELOG.md](CHANGELOG.md). La version vit dans `apps/web/package.json`, est injectée au build (`__APP_VERSION__`) et affichée dans la topbar de l'app.

> **Table de mixage DJ dans le navigateur, dont les platines sont des players YouTube.**
> Interface inspirée de Traktor : decks vidéo, mixer central (volume, EQ 3 bandes, tempo), sync, recherche/historique/favoris, playlists.

**🕹️ App en ligne : [yrbane.github.io/youtubator](https://yrbane.github.io/youtubator/)** — l'EQ, les modes tempo, les waveforms réelles et les boucles exactes nécessitent l'[extension](#16-démarrage-rapide) (zip dans les artefacts CI).

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
8. [`potard` — lib de contrôles style Ableton (repo externe)](#8-potard--lib-de-contrôles-style-ableton-repo-externe)
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
- **Compte connecté (OAuth)** : via Google Identity Services (token implicite, scope `youtube.readonly`, Client ID OAuth fourni par l'utilisateur), la recherche fonctionne **sans clé API** (header `Authorization: Bearer`), et l'app accède aux « J'aime » et playlists du compte (§ 6.4 F-BRW-05).
- Fallback sans clé ni compte : saisie/collage direct d'une URL ou d'un ID YouTube dans le champ de recherche (regex de parsing d'URL).

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
| Monorepo | **pnpm workspaces** | `apps/web`, `packages/audio-engine`, `extension` ; contrôles UI externalisés dans [potard](https://github.com/yrbane/potard). |
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
     potard (Web Components, repo externe)   packages/audio-engine
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
- **F-SYNC-04** : beatmatching automatique — quand les deux grilles sont connues, rate esclave = BPM effectif maître / BPM esclave (appariement d'octave ½×/2×), puis **verrouillage de phase continu par PLL** : correction toutes les 250 ms, micro-bends de rate bornés à ±2 % (inaudibles, surtout en Master Tempo), **zone morte de ±2 ms** une fois calé, convergence ~1 s ; seek uniquement au-delà de 35 % de période. Bouton **φ** sur le bandeau pour recaler la phase manuellement, jauge d'écart en ms sur la waveform.
- **F-SYNC-05 — master clock (façon Traktor)** : panneau **MASTER** en haut du mixer. **AUTO** (défaut) : le deck maître donne le tempo, BPM effectif affiché en continu. **CLOCK** : l'horloge adopte le BPM du maître à l'armement puis **fait loi** — tous les decks SYNC égalisent leur BPM effectif sur elle, deck maître compris ; boutons −/+ 0,5 BPM pour faire glisser le tempo du set, re-clic pour revenir en AUTO.

### 6.4 Browser (zone basse, 3 onglets)

- **F-BRW-01 — Recherche** : champ texte (déclenchement à Entrée, debounce 300 ms en saisie continue), résultats en liste (miniature, titre, chaîne, durée). Chaque ligne porte des boutons **→ A**, **→ B** (et C/D si présents) + ⭐ favori. Accepte aussi une URL/ID YouTube collée.
- **F-BRW-02 — Historique** : tout morceau chargé dans un deck est horodaté et ajouté en tête. Regroupement par session de mix. Mêmes actions de routage. Vidage possible.
- **F-BRW-03 — Favoris** : liste ordonnable (drag & drop), ajout/retrait par ⭐ partout dans l'app.
- **F-BRW-04 — Playlists** : créer/renommer/supprimer une playlist ; y ajouter depuis recherche/historique/favoris (menu contextuel) ; export/import JSON.
- **F-BRW-05 — Onglet ▶ YouTube (multi-comptes)** : connexion OAuth (Google Identity Services, scopes `youtube.readonly openid email profile`). Les **profils des comptes connectés sont mémorisés** (IndexedDB : avatar, nom de chaîne, email, playlist « J'aime ») et affichés en chips — on **switche de compte d'un clic** (re-token silencieux via `login_hint`, sans sélecteur). Chaque compte retrouve ses « J'aime » et ses playlists. Les tokens restent en `sessionStorage` (par compte, ~1 h) : jamais de secret persistant. « Oublier » supprime le profil.
- **F-BRW-07 — Miroir favoris ↔ « J'aime » YouTube** : quand un compte est actif et connecté, mettre un morceau en favori dans Youtubator pose aussi un **« J'aime » sur YouTube** (`videos.rate`, scope `youtube.force-ssl`) ; retirer le favori retire le « J'aime ». Sans compte connecté : favori local uniquement, sans erreur. Un token trop ancien (scope readonly) déclenche un message invitant à se reconnecter.
- **F-BRW-06 — Attribution multi-utilisateurs** : chaque entrée d'**historique**, chaque **favori** et chaque **recherche** porte l'utilisateur actif au moment de l'action (badge « · Nom » sur les lignes). Historique et favoris se **filtrent par utilisateur** (chips Tous / Nom). L'onglet Recherche garde les **20 dernières recherches** (dédoublonnées, cliquables pour relancer, supprimables) — le tout persistant d'une session à l'autre.

### 6.4 bis Bandeau waveforms (entre les decks et le browser)

- **F-WAV-01** : un bandeau par deck chargé, style Serato : **tête de lecture fixe au centre**, la waveform défile (30 px/s, interpolation entre timeupdates), partie jouée pleine / à venir translucide, couleur du deck.
- **F-WAV-02 — capture progressive** : avec l'extension, les niveaux réels (METER) remplissent des buckets de 250 ms (max par bucket) pendant la lecture — la waveform se complète au fil des lectures et n'est **jamais recalculée** (cache IndexedDB par vidéo, sauvegarde périodique + au changement de morceau). Sans extension : pseudo-waveform déterministe (graine = videoId), marquée « ~ ».
- **F-WAV-03 — points de cue** : **Shift+clic** pose/retire un cue (max 8, persistés par vidéo), **clic** = seek aimanté sur le cue le plus proche (±0,5 s), marqueurs jaunes numérotés sur la waveform.
- **F-WAV-04 — hot cues** : boutons **1–8** à droite de chaque waveform (allumés quand le cue existe) → saut instantané ; au clavier : touches **1–8** (deck A) et **Maj+1–8** (deck B), via `e.code` donc indépendant du layout AZERTY.
- **F-LOOP-01 — boucles manuelles** : boutons **IN** (pose l'entrée au temps courant), **OUT** (pose la sortie et active), **∞** (coupe/relance en gardant les points — reloop). Zone surlignée sur la waveform (verte si active). Avec l'extension : sample-accurate (F-LOOP-02) ; sinon garde temporelle à 80 ms (précision du seek YouTube, boucles de phrase ≥ 1 s).
- **F-LOOP-02 — boucles sample-accurate (extension)** : un ScriptProcessor en dérivation du `MediaElementSource` alimente un **ring buffer PCM stéréo de 48 s** + la correspondance bloc → temps vidéo. À l'engagement, la région [IN, OUT] est extraite en `AudioBuffer` et jouée en boucle via `AudioBufferSourceNode` (`loop=true`) **à travers l'EQ**, vidéo en pause — zéro seek YouTube dans la boucle. À la sortie, la vidéo reprend à la position de phase courante. Contrainte assumée : on boucle de l'audio **déjà capturé** (les N derniers beats), l'audio futur n'existant pas localement.
- **F-BEAT-01 — grille de beats** : l'extension expose l'**enveloppe d'énergie** du ring (RMS par bloc de 1024, ~43 Hz) ; la page détecte le BPM par **autocorrélation du flux d'attaques** (plage 60–180, anti-octave, interpolation parabolique) + phase par peigne — en JS pur, pas besoin de WASM. Analyse automatique après ~12 s de lecture, grille (BPM + ancre) **persistée avec la waveform**. Affichage : BPM effectif sur la waveform + graduations de beats (mesures 4/4 marquées).
- **F-BEAT-02 — boucles de N beats exacts** : boutons **1 / 2 / 4 / 8 / 16 / 32 beats** par deck — sortie calée sur le beat courant (floor), entrée N périodes plus tôt, sample-accurate via F-LOOP-02 (vérifié : 4 beats à 112,7 BPM = 2,130 s pile).
- **F-BEAT-03 — beatmatch** : quand les deux grilles sont connues, SYNC égalise les **BPM effectifs** (rate esclave = rate maître × BPM maître / BPM esclave) et **recale la phase de beat** de l'esclave (seek du plus court chemin, seuil 40 ms) à chaque refresh.

### 6.4 ter Performance & bibliothèque (lot « améliorations »)

- **F-ROLL** : bouton ROLL — à la sortie de boucle, saut à la **position fantôme** (comme si on n'avait jamais bouclé).
- **F-KEY** : tonalité par **Krumhansl-Schmuckler** sur chromagramme accumulé in-frame, code **Camelot** affiché/persisté ; compatibilité harmonique (`camelotCompatible`).
- **F-FILT** : **filtre bipolaire** LP/HP par deck (un knob, zone morte au centre, Q 1,1).
- **F-DLY** : **delay synchronisé au BPM** (¼ ½ ¾ 1 beat, wet + feedback, temps réel = fraction × période ÷ rate).
- **F-AG** : **auto-gain** ±6 dB (cible RMS 0,25, hors silences), persisté.
- **F-GHOST** : **analyse fantôme** ⚡ — deck caché silencieux (gain 0 au graphe, capture intacte) qui pré-analyse la file à ×2.
- **F-TAP** : **tap tempo** (8 derniers taps, l'ancre se cale sur le dernier) + **Alt+clic** pour déplacer l'ancre.
- **F-META** : badges **BPM · tonalité** sur toutes les listes de morceaux.
- **F-CRATE** : **export/import JSON** du crate (dossiers, favoris, playlists) avec fusion.
- **F-SUGG** : bandeau 💡 **« à mixer ensuite »** — bibliothèque filtrée à ±6 % de tempo (octave près), tonalités compatibles d'abord.
- **F-MIDI** : **Web MIDI** avec **learn** — 23 actions mappables, mappings persistés.
- **F-PERF** : mode **performance** ⛶ (plein écran, browser masqué, waveforms ×2).
- **F-REC** : **enregistrement du mix** via l'icône d'extension (tabCapture + offscreen + MediaRecorder → webm ; Chrome uniquement, usage personnel).

### 6.4 quater Browser pro (v0.9)

Le browser est un outil de mix complet, calqué sur Traktor. **Toute l'UI est auto-documentée** (infobulle sur chaque contrôle).

- **F-BRW-08 — pagination + cache local partout** : « J'aime » et playlists YouTube chargés 50 par 50 au scroll (sentinelle `IntersectionObserver`) et **intégralement cachés** (Dexie ; reprise du jeton de pagination d'une session à l'autre, nouveautés fusionnées en tête). Recherche paginée, cachée 1 h par requête (une recherche = 100 unités de quota). Historique par tranches de 50, favoris/playlists fenêtrés.
- **F-BRW-09 — filtre libre** : champ « ⧩ filtrer » dans la barre d'onglets — live sur la liste affichée quel que soit l'onglet, insensible casse/accents, multi-mots en ET, cherche titre + chaîne + style + BPM + tonalité. `Échap` efface.
- **F-BRW-10 — tri des colonnes** : barre « Trier » (titre, chaîne, durée, BPM, note, lectures, style, couleur) — 1ᵉʳ clic croissant, 2ᵉ décroissant, 3ᵉ ordre d'origine ; valeurs absentes toujours en fin.
- **F-BRW-11 — métadonnées DJ** : **note 1-5 ★**, **style musical** (chip éditable, suggestions des styles existants), **couleur par style** (partagée par tous les morceaux du style — clic = couleur suivante, clic droit = nuancier), **compteur de lectures** total·session, lien **↗ YouTube**, retraits contextuels (entrée d'historique 🗑, « J'aime » YouTube via `videos.rate none`). Persistance Dexie (`trackMeta`, `styleColors`).
- **F-BRW-12 — MATCH** : ne garder que les morceaux **mixables avec le deck maître** (BPM ±6 %, octaves ½×/2× comprises, tonalités compatibles Camelot).
- **F-BRW-13 — navigation clavier** : `↑`/`↓` curseur, `Entrée` → deck A, `Maj+Entrée` → deck B, `F` favori.
- **F-BRW-14 — sélection multiple** : clic / Ctrl+clic / Maj+clic (plage) → barre d'actions groupées : noter, styler, **➕ crate**, ⚡ analyser.
- **F-BRW-15 — crates éditables** : « + crate », renommer ✎, réordonner ↑↓, retirer 🗑, **▶ publier en playlist YouTube privée** (`playlists.insert` + `playlistItems.insert`, coût quota annoncé avant confirmation).
- **F-BRW-16 — smart crates** : 💾 sauvegarde le couple filtre + tri courant ; chips ✨ pour le réappliquer d'un clic.
- **F-BRW-17 — ⚡ liste** : pré-analyse toute la liste affichée via l'analyse fantôme (les morceaux déjà analysés sont sautés).
- **F-BRW-18 — pré-écoute 🎧** : écouter sans occuper de deck (lecteur caché, départ au tiers du morceau, sortie principale ; s'arrête au chargement d'un morceau sur un deck).
- **F-BRW-19 — export de tracklist** : ⤓ txt (numéroté, minutage relatif, publiable) et ⤓ csv depuis l'historique — la liste affichée, filtres appliqués.
- **F-BRW-20 — stats 📊** : les plus joués, répartition par style (avec couleurs), morceaux « endormis » (30 j+).
- **F-BRW-21 — recherche affinée** : durée (tracks 4-20 min / mixes +20 min — écarte aussi les Shorts) et tri (pertinence / plus récents) ; seul le réglage par défaut est mis en cache.
- **F-BRW-22 — plein écran momentané** : ⛶ sur le browser (ou `/` quand il est masqué) le temps de chercher ; `Échap` ou chargement d'un morceau pour revenir au mix.
- **F-BRW-23 — virtualisation légère** : `content-visibility: auto` sur les lignes — les longues listes ne rendent que ce qui est à l'écran.

### 6.5 Réglages

- **F-SET-01** : clé API YouTube Data v3 (champ masqué + lien d'aide) et **Client ID OAuth Google** (connexion compte, origine autorisée = URL de l'app).
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
| `S` / `L` | Sync A / B |
| `←→` | Crossfader par pas |
| `1..8` / `Maj+1..8` | Hot cues deck A / deck B |
| `/` | Focus recherche (browser en plein écran s'il est masqué) |
| `↑↓` | Curseur dans la liste du browser |
| `Entrée` / `Maj+Entrée` | Charger le morceau sous le curseur sur A / B |
| `F` | Favori du morceau sous le curseur |
| `Échap` | Effacer le filtre / réduire le browser plein écran |

## 8. `potard` — lib de contrôles style Ableton (repo externe)

Lib **externalisée dans son propre repo** : **[github.com/yrbane/potard](https://github.com/yrbane/potard)** (« potard » = potentiomètre en argot sondier). Zéro dépendance runtime, Custom Elements, consommée ici via `"potard": "github:yrbane/potard"` :

| Composant | Tag | Attributs/props principaux |
|---|---|---|
| Potentiomètre | `<pt-knob>` | `min max value default step curve="lin|log" label unit sensitivity disabled` |
| Fader | `<pt-fader>` | `min max value default curve label unit sensitivity disabled` |
| Crossfader | `<pt-crossfader>` | `value default label` |
| Surface XY | `<pt-xy>` | `min-x max-x value-x default-x` (idem `-y`) `label disabled` |
| Interrupteur | `<pt-switch>` | `checked label disabled` |
| Sélecteur cranté | `<pt-stepper>` | `options value label disabled` |
| VU-mètre | `<pt-vumeter>` | propriétés `level peak` ; attrs `segments orientation="v|h"` |
| LED | `<pt-led>` | `on color blink` |
| Bouton | `<pt-button>` | `toggle` ; propriété `active` |

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
| **M1 — Controls** | [potard](https://github.com/yrbane/potard) complet + démo HTML | Tous composants testés, démo interactive |
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
pnpm dev          # lance apps/web sur http://localhost:5199
pnpm test         # Vitest sur tout le monorepo
pnpm build        # build de production (app + extension)
```

**Déploiements** : chaque push sur `main` publie **automatiquement** sur [yrbane.github.io/youtubator](https://yrbane.github.io/youtubator/) (GitHub Pages, base `/youtubator/`) **et** sur le miroir auto-hébergé **[youtubator.nethttp.net](https://youtubator.nethttp.net)** (workflow `deploy-nethttp.yml` : build base `/`, rsync SSH, secrets `NETHTTP_SSH_KEY`/`NETHTTP_KNOWN_HOSTS` ; `scripts/deploy-nethttp.sh` reste utilisable à la main). La CSP du miroir est portée par `apps/web/public/.htaccess` (celle du vhost bloquait YouTube et Google Sign-In). ⚠️ Pour la connexion compte YouTube sur un nouveau domaine, ajouter son origine aux **origines JavaScript autorisées** du Client ID OAuth (console Google).

**Activer l'EQ et les modes tempo (extension)** :

1. `pnpm --filter @youtubator/extension build`
2. Chrome → `chrome://extensions` → « Mode développeur » → « Charger l'extension non empaquetée » → dossier **`extension/dist/`** (⚠️ bien `dist/`, pas `extension/` — le dossier source n'est pas chargeable)
3. Recharger Youtubator : le badge **● EXT** passe au vert, l'EQ et MT/VINYL se déverrouillent.

---

*Projet sous licence MIT. Idée d'origine : [idea.md](./idea.md).*
