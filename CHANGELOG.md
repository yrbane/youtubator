# Changelog

Versionnage [SemVer](https://semver.org/lang/fr/) : la version vit dans `apps/web/package.json`,
est injectée au build (`__APP_VERSION__`) et affichée dans la topbar de l'app.

## 0.14.0 — 2026-07-09 · « Extension explicite & mobile »

- **Extension mise en avant** : le badge EXT devient un bouton qui ouvre un **guide complet** — statut détecté/absent, ce qu'elle débloque (EQ réel, modes tempo, waveforms, boucles exactes, BPM/tonalité, enregistrement), ce qui marche sans elle, et l'installation pas à pas Chrome **et** Firefox avec lien de téléchargement direct. L'écran d'accueil gagne un encart extension explicite.
- **Version mobile** : l'app s'empile et défile sur petit écran (decks pleine largeur, mixer en dessous, contrôles du bandeau défilables, filtre pleine largeur, cibles tactiles agrandies, raccourcis clavier masqués) — testée sans débordement horizontal en 390×844 (test e2e dédié).
- **PWA installable** : manifest + icône SVG + theme-color — « Ajouter à l'écran d'accueil » sur Android/iOS ouvre Youtubator en plein écran.

## 0.13.1 — 2026-07-08 · « Accueil (fix CI) »

- Tests e2e adaptés à l'écran d'accueil (nouveau test dédié + choix « sans compte » pré-mémorisé pour les autres).

## 0.13.0 — 2026-07-08 · « Accueil, logo & presets MIDI »

- **Écran d'accueil** au premier lancement : logo, pitch en trois points et **connexion Google avant l'interface** ; « Continuer sans compte » reste possible (choix mémorisé, l'écran ne revient jamais dès qu'un compte est connu).
- **Logo SVG** original — hexagones concentriques façon Traktor + triangle play façon YouTube, dégradé deck A → deck B. En topbar, sur le splash, et en favicon.
- **Presets MIDI par contrôleur** (un fichier par contrôleur, `lib/midi-presets/`) : sélecteur dans les réglages, premier preset **NI Traktor Kontrol X1 (mode MIDI)** — gabarit d'usine, chaque touche reste ajustable via Learn. Les tests valident automatiquement tout nouveau preset (actions connues, bindings MIDI valides, pas de touche en double).
- **Réglages épurés** : le Client ID OAuth migre dans une section « Avancé » repliée (l'ID de l'instance suffit au quotidien).

## 0.12.2 — 2026-07-08 · « Connexion en un clic »

- Le Client ID OAuth de l'instance est embarqué : la connexion YouTube se fait désormais **juste avec un compte Google**, sur les deux domaines — plus d'onboarding console pour les visiteurs (rappel : l'origine `https://youtubator.nethttp.net` doit être autorisée sur le projet Google).

## 0.12.1 — 2026-07-07 · « Connexion Google sans console »

- **Client ID OAuth d'instance** : l'app peut embarquer un Client ID par défaut (`app-config.ts`, public par conception, protégé par les origines autorisées du projet Google). Les visiteurs se connectent alors « juste avec leur compte Google », sans créer d'identifiants. L'ID collé dans ⚙ Réglages prime toujours (instance ≠ obligation).
- Reste à renseigner `DEFAULT_CLIENT_ID` avec l'ID du projet de l'instance et à autoriser les deux origines (github.io + nethttp.net) dans la console Google.

## 0.12.0 — 2026-07-07 · « Déploiement continu du miroir »

- **Workflow GitHub `deploy-nethttp.yml`** : chaque push sur main construit (base `/`) et déploie automatiquement sur https://youtubator.nethttp.net (clé SSH dédiée en secret, rsync, installation www-data, vérification en ligne). Déclenchable aussi à la main (workflow_dispatch).
- **Fix miroir** : la CSP du vhost (`default-src 'self'`) bloquait l'IFrame API YouTube, les embeds, Google Sign-In et l'API Data — `apps/web/public/.htaccess` la remplace par une CSP adaptée (youtube.com, accounts.google.com, googleapis.com, miniatures/avatars), inerte sur GitHub Pages.

## 0.11.2 — 2026-07-07 · « Miroir auto-hébergé »

- Déploiement sur **https://youtubator.nethttp.net** (vhost wildcard Apache, docroot `/var/www/nethttp.net/youtubator/public`) — script reproductible `scripts/deploy-nethttp.sh` (build base `/`, rsync, installation www-data).
- README § 16 : les deux cibles de déploiement documentées + rappel d'ajouter l'origine du nouveau domaine au Client ID OAuth Google.

## 0.11.1 — 2026-07-07 · « Spec à jour »

- README : la spécification Sync (§ 6.3) documente la PLL de verrouillage de phase (F-SYNC-04) et la master clock (F-SYNC-05) livrées en 0.11.0.
- Processus de publication durci : CI verte exigée avant le tag, zip de l'extension joint à chaque release.

## 0.11.0 — 2026-07-07 · « Master clock »

Synchro peaufinée façon Traktor.

- **Horloge maître (CLOCK)** dans le mixer : armée, elle adopte le BPM du deck maître puis **fait loi** — tous les decks SYNC la suivent, deck maître compris (appariement d'octave). Boutons −/+ 0,5 BPM ; retour AUTO d'un clic ; BPM effectif affiché en continu.
- **PLL resserrée** : verrouillage de phase 3× plus rapide (correction toutes les 250 ms au lieu de 700, convergence ~1 s au lieu de ~3,5), avec **zone morte de ±2 ms** — plus de micro-tremblement quand les decks sont calés, jamais de seek sous 35 % de période.

## 0.10.1 — 2026-07-07 · « Colonnes pleine hauteur »

- Les blocs cues/loops occupent désormais **toute la hauteur des waveforms** : colonne A (et C) à gauche, colonne B (et D) à droite, waveforms empilées au centre. Chaque bloc porte le badge et le liseré couleur de son deck.

## 0.10.0 — 2026-07-07 · « Bandeau miroir »

Révision waveforms / synchro / cues / loops, et layout en miroir du bandeau.

- **Layout miroir** : les contrôles (hot cues, TAP/octave, beat loops, IN/OUT/∞/ROLL) du deck A (et C) sont regroupés **à gauche** de sa waveform, ceux du deck B (et D) **à droite** — face à face, comme sur une vraie table.
- **Waveform** : **zoom à la molette** (10-120 px/s, commun aux bandeaux), double-clic pour revenir au zoom par défaut.
- **Cues** : **clic droit sur un pad** pour supprimer le cue (plus besoin de retrouver sa position sur la waveform).
- **Loops** : **÷2 / ×2** — redimensionne la boucle en gardant le point IN (ré-extraction sample-accurate si engagée).
- **Synchro** : **saut de beats ◀/▶** (1 mesure, Maj = 1 beat) et bouton **φ** qui recale immédiatement la phase sur le deck maître (saut du plus court chemin).

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
