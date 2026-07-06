# ADR 0001 — Stack et architecture en deux étages

- **Statut** : accepté — point 3 (« MVP page web d'abord ») amendé par [ADR 0002](./0002-extension-first-et-modes-tempo.md)
- **Date** : 2026-07-06

## Contexte

L'idée d'origine (`idea.md`) demandait « NaCl ou WebAssembly ? » pour la performance,
et un EQ 3 bandes par platine YouTube.

## Décision

1. **NaCl est écarté** : déprécié et retiré de Chrome depuis 2020.
2. **Web Audio API native d'abord** (`BiquadFilterNode`, `GainNode`, `AnalyserNode`) ;
   WebAssembly (Rust + `AudioWorklet`) réservé au DSP avancé (BPM, time-stretch) en V3.
3. **Architecture en deux étages** imposée par le cross-origin de l'iframe YouTube :
   - MVP page web pure via l'IFrame Player API (pas d'accès au flux audio → EQ grisé) ;
   - V2 extension Chrome MV3 : content script dans les frames youtube.com,
     `captureStream()` + graphe Web Audio local, `playbackRate` continu.
4. L'interface **`DeckAudioBackend`** (avec `capabilities`) isole les deux backends —
   l'UI ne connaît jamais le mode d'exécution (inversion de dépendance).
5. Stack : TypeScript strict, Vite, Svelte 5, Web Components + Canvas pour les
   contrôles, Dexie/IndexedDB pour la persistance, Vitest + Playwright, pnpm workspaces.

## Conséquences

- Le MVP est livrable sans extension, 100 % statique (GitHub Pages).
- L'EQ et le tempo continu sont conditionnés à l'installation de l'extension (M6).
- Voir README §3 à §5 pour le détail.
