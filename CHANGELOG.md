# Changelog

Versionnage [SemVer](https://semver.org/lang/fr/) : la version vit dans `apps/web/package.json`,
est injectée au build (`__APP_VERSION__`) et affichée dans la topbar de l'app.

## 0.9.0 — 2026-07-07 · « Browser pro »

Le browser devient un outil de mix complet façon Traktor (README § 6.4 quater).

- **MATCH** : filtre « mixable avec le deck maître » (BPM ±6 % octaves comprises, Camelot).
- **Navigation clavier** : ↑/↓ curseur, Entrée → deck A, Maj+Entrée → deck B, F favori.
- **Sélection multiple** (clic / Ctrl / Maj) + actions groupées : note, style, ➕ crate, ⚡ analyse.
- **Crates éditables** : création, renommage, réordonnancement ↑↓, retrait, **publication en playlist YouTube privée**.
- **Smart crates** : filtre + tri sauvegardés (💾), réappliqués d'un clic (✨).
- **Pré-écoute 🎧** sans occuper de deck (départ au tiers du morceau).
- **⚡ liste** : pré-analyse de toute la liste affichée (ghost analyzer).
- **Export de tracklist** : ⤓ txt publiable (minutage relatif) et ⤓ csv depuis l'historique.
- **Stats 📊** : plus joués, répartition par style, morceaux endormis (30 j+).
- **Recherche affinée** : durée (tracks / mixes, écarte les Shorts) et tri par date.
- **Crate v2** : l'export/import de bibliothèque embarque aussi notes, styles, couleurs, smartlists et historique.
- **Virtualisation légère** des listes (`content-visibility: auto`).
- Numéro de version affiché dans la topbar ; base Dexie migrée en v8 (`smartlists`).

### Précédemment (résumé, avant le versionnage)

- Filtre libre façon Traktor (accents/casse, multi-mots, tous champs). Couleurs par **style** + nuancier (clic droit).
- Métadonnées DJ : note 1-5 ★, style, compteur de lectures, ↗ YouTube, retraits (historique, « J'aime »). Tri des colonnes.
- Pagination au scroll + cache local : « J'aime »/playlists YouTube, recherche (1 h), historique, favoris.
- Browser plein écran momentané (⛶, `/`, Échap). Échelle A−/A+ limitée aux vignettes.
- Beatmatch à grille de beats, boucles sample-accurate 1-32 beats, tonalité Camelot, waveforms défilantes, multi-comptes YouTube, miroir favoris ↔ « J'aime », extension Chrome/Firefox (EQ, tempo, capture).
