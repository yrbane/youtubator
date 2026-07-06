# ADR 0002 — Extension-first et modes tempo natifs (Master Tempo / Vinyle)

- **Statut** : accepté (amende le point 3 de l'ADR 0001)
- **Date** : 2026-07-06

## Contexte

L'ADR 0001 prévoyait un MVP en page web pure (IFrame API, EQ grisé) puis une extension
Chrome en V2. Le porteur du projet a requalifié **l'égalisation** et la **synchronisation
avec choix time-stretch ou pitch** en exigences fondatrices — non négociables dès la
première version utilisable. Or ces deux capacités exigent l'accès au `<video>` à
l'intérieur de la frame YouTube (cross-origin), donc l'extension.

## Décision

1. **Extension-first** : Youtubator est une extension Chrome MV3 dès le jalon M2.
   La page web sans extension devient un **mode dégradé** (volume + tempo à paliers,
   EQ et modes tempo grisés), livré en M6.
2. **Modes tempo via `HTMLMediaElement.preservesPitch`** — aucun WASM requis :
   - `preservesPitch = true` → **Master Tempo** (time-stretch : la tonalité reste) ;
   - `preservesPitch = false` → **Vinyle** (le pitch suit la vitesse).
   Bascule par deck, à chaud, exposée par `DeckAudioBackend.setTempoMode()`.
3. **Plage de tempo** : ±16 % par défaut (qualité du WSOLA de Chrome), ±50 % en
   réglage avancé avec avertissement d'artefacts.
4. Le **key shift** (transposer la tonalité à tempo constant) reste hors périmètre
   de `preservesPitch` : c'est le seul cas justifiant un pitch-shifter WASM
   (SoundTouch) en V3, avec la détection de BPM.
5. L'alternative « éviter l'iframe » (extraction des flux `googlevideo.com` façon
   yt-dlp/Piped) est **rejetée** : violation des ToS YouTube, fragilité chronique
   (signatures/throttling), nécessité d'un proxy serveur. L'interface
   `DeckAudioBackend` laisse néanmoins la porte ouverte à un éventuel
   `DirectStreamBackend` expérimental privé.

## Conséquences

- Roadmap réordonnée : M2 = extension + decks + modes tempo ; M3 = mixer/EQ réel/sync ;
  M6 = mode dégradé (`IframeApiBackend`).
- Le protocole `postMessage` page ↔ frames devient un livrable central dès M2
  (versionné, typé, testé).
- Publication sur le Chrome Web Store requise dès la première release publique (M7).
- Voir README § 3.2, § 3.3, § 6 et § 13.
