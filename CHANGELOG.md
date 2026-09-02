# Changelog

Versionnage [SemVer](https://semver.org/lang/fr/) : la version vit dans `apps/web/package.json`,
est injectée au build (`__APP_VERSION__`) et affichée dans la topbar de l'app.

## 0.20.18 — 2026-09-02 · « Les trois permissions et rien de plus »

- **`docs/GUIDELINES.md`** : règle 18 — `extension/manifest.src.json` ne
  déclare que les permissions Chrome effectivement appelées dans
  `extension/src` (`tabCapture`, `offscreen`, `downloads`), vérifiable par
  grep : chaque permission a son appel `chrome.*`, et les seuls autres appels
  `chrome.*` du code (`chrome.action`, `chrome.runtime`) sont des API de base
  MV3 qui ne se déclarent pas. Même minimalisme côté `content_scripts` et
  `web_accessible_resources` : uniquement `youtube.com`/`youtube-nocookie.com`,
  jamais `<all_urls>`. Vérifié ce soir, les deux grep confirment un périmètre
  exact — ni permission orpheline, ni appel non couvert.
- Audit dépendances (`pnpm audit`) toujours à 19 alertes dev-only (5
  modérées + 14 hautes), identiques à celles déjà corrigées sur
  `lutin/ameliorations` (PR #2, `MERGEABLE`/`CLEAN`, CI verte, ouverte depuis
  le 2026-08-14, en attente d'arbitrage — issues #10/#13) : correctifs déjà
  écrits sur la branche, pas rejoués à la main sur `main` pour ne pas la
  dupliquer.
- `pnpm test` (296 tests), `pnpm typecheck` et `pnpm build` verts ce soir ;
  `gitleaks detect --source . --log-opts="--all"` (102 commits) sans fuite.

## 0.20.17 — 2026-09-01 · « Le bloc permissions qu'on n'a jamais écrit »

- **`docs/GUIDELINES.md`** : règle 17 — `.github/workflows/pages.yml` déclare
  un bloc `permissions` minimal (`contents: read, pages: write, id-token:
  write`), strictement ce dont `deploy-pages` a besoin. `deploy-nethttp.yml`
  et `ci.yml`, eux, n'en déclarent aucun alors qu'ils n'appellent jamais
  `GITHUB_TOKEN` au-delà du `checkout` initial : le token hérite donc du
  réglage par défaut du dépôt, plus large que nécessaire et non documenté par
  ces fichiers. Correction (`permissions: contents: read` en tête de job)
  bloquée par la même limite que la règle 16 et l'issue #20 (token du lutin
  sans le scope OAuth `workflow`) : décrite ici pour application manuelle par
  le mainteneur.
- Incident production écarté : les logs signalent un scan de `/.git/config`
  (bot, 3.71.7.238) — 404 immédiat, bloqué en amont par ModSecurity/OWASP CRS
  (`930130`, score d'anomalie dépassé). Vérifié dans ce dépôt :
  `scripts/deploy-nethttp.sh` et `.github/workflows/deploy-nethttp.yml` ne
  rsyncent jamais que `apps/web/dist/` vers le docroot — `.git` n'a jamais été
  exposé, rien à corriger côté application.
- `pnpm test` (296 tests), `pnpm typecheck`, `pnpm build` et `gitleaks detect
  --source . --log-opts="--all"` (101 commits) tous verts ce soir ; `pnpm
  audit` toujours à 19 alertes dev-only, identiques à celles déjà corrigées
  sur `lutin/ameliorations` (PR #2, toujours `MERGEABLE`/`CLEAN`, CI verte,
  ouverte depuis le 2026-08-14, en attente d'arbitrage — issues #10/#13).

## 0.20.16 — 2026-08-31 · « Le lockfile qui ne mord pas »

- **`docs/GUIDELINES.md`** : règle 16 — les jobs `ci`/`e2e` de
  `.github/workflows/ci.yml` installent avec `pnpm install
  --frozen-lockfile=false` depuis le premier commit du fichier, jamais
  commenté. Ce flag autorise pnpm à recalculer la résolution de dépendances
  en mémoire si `package.json` dérive de `pnpm-lock.yaml`, au lieu d'échouer
  — l'inverse du comportement strict par défaut hors CI. Vérifié ce soir :
  `pnpm install --frozen-lockfile` (strict) réussit sans aucune modification
  sur `main`, ce n'est donc pas un correctif à un problème actuel, seulement
  un garde-fou absent. Correction bloquée par la même limite que l'issue
  #20 (token du lutin sans le scope OAuth `workflow`, GitHub refuse toute
  mise à jour de `.github/workflows/*.yml` par ce canal) : décrite en
  guidelines pour application manuelle, ou automatique dès que le scope sera
  ajouté.
- `pnpm test` (296 tests), `pnpm typecheck`, `pnpm build` et `gitleaks
  detect --source . --log-opts="--all"` (100 commits) tous verts ce soir ;
  `pnpm audit` toujours à 19 alertes dev-only déjà corrigées sur
  `lutin/ameliorations` (PR #2, `MERGEABLE`/`CLEAN`, CI verte, toujours en
  attente d'arbitrage — issues #10/#13).

## 0.20.15 — 2026-08-30 · « Deux règles de plus, un incident écarté »

- **`docs/GUIDELINES.md`** : deux nouvelles règles convergées ce soir.
  - Règle 14 — tout nouveau domaine externe contacté par l'app doit être
    ajouté à la CSP du miroir (`apps/web/public/.htaccess`) **dans le même
    commit** : liste blanche stricte (`default-src 'self'`), déjà oubliée
    deux fois pour le même type de ressource (`media-src blob:` pour les
    fichiers locaux, v0.16.0 → corrigé seulement en v0.19.1/v0.19.2, invisible
    sur GitHub Pages qui ignore les `.htaccess`).
  - Règle 15 — le schéma Dexie (`YoutubatorDb`, `library.ts`) s'étend par
    version cumulative, jamais par modification d'une version déjà publiée ;
    angle mort réel documenté au passage : aucun `library.test.ts`, aucune
    dépendance `fake-indexeddb`, les deux `.upgrade()` existants ne sont
    exercés qu'en production.
- **Investigation production (issue #8)** : nouvelles alertes 502/503 en
  volume sur `/presence`, `/qrdata`, `/score`, `/state`, `/toucher` (host
  `machine.nethttp.net`, backend `127.0.0.1:8723` injoignable par
  intermittence) — confirmé hors périmètre de ce dépôt : aucune de ces
  routes n'existe ici, aucun code serveur, et le déploiement de ce dépôt vise
  exclusivement `youtubator.nethttp.net`. Troisième vhost distinct rencontré
  dans cette issue.
- `pnpm test` (296 tests), `pnpm typecheck` et `gitleaks detect` (99 commits)
  toujours verts ce soir ; `pnpm audit` toujours à 19 alertes dev-only déjà
  corrigées sur `lutin/ameliorations` (PR #2, en attente d'arbitrage — voir
  issues #10/#13).

## 0.20.14 — 2026-08-26 · « Le balayage complet »

- **Balayage `tsc --noEmit` étendu aux 78 fichiers `.ts` (hors `*.svelte.ts`)**
  de `apps/web/src` et `extension/src`, au lieu des deux seuls fichiers
  corrigés en v0.20.12 — deux violations réelles supplémentaires trouvées et
  corrigées, poussées sur `lutin/ameliorations` (PR #2) :
  - `local-library.ts` : `LocalTrack#album`/`#genre` (`string`, sans `| null`)
    recevaient explicitement `undefined` dans `collect()`/`importFiles()` —
    même famille que `gridV`, corrigé pareil (`| null`, défaut `?? null`) ;
    aucun consommateur (`Browser.svelte`) ne distingue `undefined` de `null`.
  - `extension/audio-graph.ts` : `accumulateChroma()` incrémentait
    `chroma[bin]` par `+=` direct — `noUncheckedIndexedAccess` ne peut pas
    prouver que `bin` (modulo 12) reste dans les bornes du `Float64Array(12)`,
    toujours vrai à l'exécution ; lecture explicite avec repli `?? 0` avant
    l'écriture, comportement inchangé.
  - Une cinquième violation identifiée (`local-files.test.ts`, assertion sur
    un élément de tableau potentiellement `undefined`) reste ouverte :
    test-only, sans impact production, non corrigée ce soir par prudence de
    budget.
  - Un faux positif écarté : compiler `background.ts` et `offscreen.ts`
    ensemble déclenche un « Cannot redeclare … chrome » qui disparaît en
    compilant chaque fichier seul — artefact de la méthode de balayage, pas
    un bug du projet.
- `docs/GUIDELINES.md` §13 mis à jour avec le décompte final (4 violations
  réelles corrigées, 1 restante, 1 faux positif écarté) et l'avertissement sur
  la compilation groupée des points d'entrée de l'extension.
- 299 tests toujours verts sur la branche, build app + extension sans nouvelle
  alerte. Aucun changement sur `main` (règle 6) : `pnpm test` 296/296 inchangé.

## 0.20.13 — 2026-08-26 · « Précision sur la règle 13 »

- `docs/GUIDELINES.md` §13 précisé : l'exclusion du `tsc --noEmit` ciblé ne
  vaut pas que pour les fichiers `.svelte`, mais aussi pour les stores
  `*.svelte.ts` à runes de la règle 2 (`deck.svelte.ts`, `mixer.svelte.ts`…) —
  vérifié ce soir : `tsc` seul échoue dessus avec `Cannot find name '$state'`,
  faute du préprocesseur Svelte. La règle référence aussi désormais les deux
  correctifs trouvés ce soir (v0.20.12) comme preuve concrète que ce n'est pas
  un risque théorique.
- Aucun changement de code, `pnpm test` 296/296 vert avant et après.

## 0.20.12 — 2026-08-26 · « Ce que la règle 13 vient de trouver »

- **Deux correctifs de types poussés sur `lutin/ameliorations` (PR #2)**,
  trouvés en appliquant la commande `tsc --noEmit` ciblée de la règle 13
  (v0.20.11 ci-dessous) sur `apps/web/src` : sans elle, ni `pnpm typecheck`
  (limité à `packages/audio-engine`) ni `pnpm build` (esbuild, sans
  vérification de types) ne les auraient révélés.
  - `library.ts` : `WaveformRecord#gridV` (`number`, sans `| null`
    contrairement à ses voisins `bpm`/`anchorS`/`loopInS`/`loopOutS`)
    recevait explicitement `undefined` dans `saveWaveform` — rejeté par
    `exactOptionalPropertyTypes`. Aligné sur la convention des champs
    voisins (`| null`, défaut `?? null`), sans changement de comportement.
  - `track-meta.ts` : `nextColor` indexait `TRACK_COLORS` par un modulo sans
    que `noUncheckedIndexedAccess` puisse prouver l'index dans les bornes
    (il l'est toujours à l'exécution) — fallback explicite `TRACK_COLORS[0]`,
    comportement inchangé (299 tests toujours verts sur la branche, dont
    ceux de `nextColor`).
- Aucun changement sur `main` (règle 6) : `pnpm test` 296/296 vert avant et
  après ce commit.

## 0.20.11 — 2026-08-26 · « Un any qui ne devrait pas voyager »

- **`docs/GUIDELINES.md`** : nouvelles règles §12 et §13. §12 étend la règle 8
  aux réponses JSON d'API HTTP externe (`fetch(...).json()`) : contrairement
  à une API navigateur non typée, rien n'empêche de typer une réponse HTTP —
  `apps/web/src/lib/youtube-account.ts` propageait pourtant `any` jusque dans
  la signature publique de `fetchAccountIdentity()`, alors que `accounts.ts`
  définissait déjà `RawChannels`/`RawUserinfo` pour le même usage sans les
  exporter. §13 documente que `pnpm typecheck` ne couvre que
  `packages/audio-engine` (ni `apps/web`, ni `extension` n'ont de
  `tsconfig.json`) et que `pnpm build` ne comble pas ce trou (esbuild
  transpile sans vérifier les types) — avec la commande `tsc --noEmit` à
  lancer à la main sur ces deux paquets tant que l'issue #3 n'est pas
  tranchée.
- **Correctif de typage poussé sur la branche `lutin/ameliorations` (PR #2)**,
  pas sur `main` (règle 6) : `apiGet` devient générique, `fetchAccountIdentity`/
  `fetchMyPlaylists`/`fetchPlaylistPage`/`fetchLikedPlaylistId` n'utilisent
  plus `any` — vérifié par `tsc --noEmit` ciblé (le typecheck racine ne
  couvre pas ce fichier, cf. §13) et par la suite de tests complète
  (299/299 verts sur la branche, build sans nouvelle alerte). La branche a
  aussi été resynchronisée avec `main` (2 commits doc absorbés) ; CI verte
  après les deux push.
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec les deux
  nouveaux sujets.
- §1 et §5 revérifiées : état inchangé sur `main` (`pnpm audit` toujours 19
  alertes dev-only, correctifs prêts sur la PR #2 — CI verte, toujours pas
  fusionnée après 12 nuits ; arbitrage demandé en issues #10 et #13, aucune
  réponse à ce jour ; `pnpm test` 296/296 vert avant et après ce commit,
  aucun changement de code sur `main`) ; scan `gitleaks detect
  --log-opts="--all"` sans secret (93 commits, historique complet des deux
  branches).

## 0.20.10 — 2026-08-25 · « Où vivent les secrets de session »

- **`docs/GUIDELINES.md`** : nouvelles règles §10 et §11. §10 documente la
  distinction déjà en place dans `youtube-auth.ts` entre identifiants non
  sensibles persistés en `localStorage` (Client ID, compte actif) et l'access
  token OAuth lui-même, cantonné à `sessionStorage` (effacé à la fermeture de
  l'onglet) — un futur backend avec OAuth (SoundCloud, issue #1) suit le même
  partage. §11 documente le filtrage par `e.source` (jamais par `e.origin`
  seule ni par confiance implicite) des deux canaux `postMessage` cross-frame
  du dépôt (`deck-channel.ts` app↔iframe YouTube, `extension/src/main.ts`
  content-script↔page parente), vérifié : ce sont les deux seuls listeners
  `message` du dépôt et les deux filtrent déjà correctement.
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec les deux
  nouveaux sujets.
- §1 et §5 revérifiées : état inchangé sur `main` (`pnpm audit` toujours à 19
  alertes dev-only, correctifs prêts sur la PR #2 — CI verte, toujours pas
  fusionnée après 11 nuits ; arbitrage demandé en issues #10 et #13, aucune
  réponse à ce jour ; `pnpm test` 296/296 vert avant et après ce commit,
  aucun changement de code) ; scan `gitleaks detect --log-opts="--all"` sans
  secret (91 commits).
- Récidive du symptôme de production qui a ouvert l'issue #8 (`GET /` → 500 +
  `AH00124`, même client/horodatage entre les deux lignes, user-agent
  `python-requests`) : revérifié, même diagnostic que les quatre repassages
  précédents — hors périmètre de ce dépôt (GUIDELINES §3). Détail dans le
  commentaire ajouté à l'issue #8.

## 0.20.9 — 2026-08-24 · « Deux règles vraies aujourd'hui »

- **`docs/GUIDELINES.md`** : nouvelles règles §8 et §9. §8 documente que `any` (une vingtaine d'occurrences, `apps/web/src`, `extension/src`) reste cantonné aux frontières avec des API navigateur sans typage officiel dans le projet (`chrome.*`, le global `YT`, `google` du Sign-In, Web MIDI, File System Access) — `packages/audio-engine/src` et les modules `*-core.ts` (règle 6) sont à zéro `any`, vérifié par grep. §9 documente le critère qui distingue une capacité commune (rejoint `DeckAudioBackend`/`DeckCapabilities`) d'une capacité propre à un seul backend (narrowing `instanceof` depuis `Deck`, comme `LocalFileBackend#decodeForAnalysis`/`setFilter`/`engageLoop`) — pertinent pour le futur backend SoundCloud (issue #1).
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec les deux nouveaux sujets.
- §1 revérifiée : état inchangé sur `main` (`pnpm audit` toujours à 19 alertes dev-only, correctifs prêts sur la PR #2 — CI verte, `MERGEABLE`, toujours pas fusionnée après 10 nuits ; arbitrage demandé en issues #10 et #13, aucune réponse à ce jour). Pas de nouveau correctif rejoué à la main sur `main` en attendant.
- Investigation des nouvelles alertes de production « constatées » ce soir (scans `/.git/HEAD` et `/.git/config` bloqués par ModSecurity, règle 930130) : le nom d'hôte ciblé est `git.nethttp.net`, pas `youtubator.nethttp.net` — confirmé hors périmètre de ce dépôt (§3 des guidelines), même diagnostic que l'issue #8 (bruit de scan sur l'hébergement mutualisé, déjà bloqué en amont). Détail dans le commentaire ajouté à l'issue #8.

## 0.20.8 — 2026-08-23 · « Le rapport de test n'a rien à faire dans l'historique »

- **`.gitignore`** : `test-results/` et `playwright-report/` (sorties Playwright — état du dernier run, rapport HTML) manquaient depuis l'introduction des tests e2e (`88fcc02`). `test-results/.last-run.json` s'était glissé dans le suivi git dès ce commit et n'avait jamais été retiré — `git rm --cached`, non regénéré au prochain `pnpm test`/`playwright test`.
- **`docs/GUIDELINES.md`** : nouvelle règle §7 — tout outil de dev qui écrit un dossier de sortie doit voir `.gitignore` mis à jour dans le même commit que son introduction, pas après coup (c'est la deuxième fois que ce type d'oubli se reproduit, après `node-compile-cache/`/`playwright-transform-cache-*/` en v0.20.2). §1 et §5 revérifiés le 2026-08-23 : audit inchangé (toujours 19 alertes dev-only sur `main`, correctifs en attente sur la PR #2 — désormais ouverte depuis 9 nuits, arbitrage demandé en issue #10), scan `gitleaks` complet sans secret (89 commits).
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec le nouveau sujet.

## 0.20.7 — 2026-08-18 · « Ce que main sait vraiment »

- **`docs/GUIDELINES.md` corrigé** : les règles §1, §2 et §5 décrivaient un état déjà acquis sur `main` (audit de dépendances resserré à 2 alertes, plugin Svelte chargé pour les stores `*.svelte.ts`, hook `gitleaks` actif) — en réalité, ces trois correctifs vivent uniquement sur la branche `lutin/ameliorations` (PR #2, ouverte le 2026-08-14, **toujours pas mergée** au 2026-08-18) : sur `main`, `pnpm audit` remonte encore ses 19 alertes d'origine, `apps/web/vitest.config.ts` n'existe pas, `.githooks/` non plus. Les trois règles précisent maintenant explicitement cet écart plutôt que de l'occulter — un contributeur qui les suit à la lettre sur `main` ne doit pas être surpris.
- §1 : audit re-vérifié le 2026-08-18 — état inchangé (19 alertes dev-only sur `main`, dont 2 *high* sur `image-size` resteront sans correctif amont même après fusion de la PR ; `web-ext` déjà à sa dernière version publiée, rien de plus à bumper côté outillage).
- §5 : scan complet de l'historique re-exécuté (`gitleaks detect --log-opts="--all"`, 87 commits) — aucun secret trouvé.
- **Nouvelle règle §6** : la logique à cycle de vie propre (minuteurs, séquencement) s'extrait dans un module `*-core.ts` sans DOM, testable par `import` direct — comme `deck-core.ts`, `automix-core.ts` et `midi-core.ts`, déjà sur `main`.
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec le nouveau sujet.

## 0.20.6 — 2026-08-17 · « Scan de secrets »

- **`docs/GUIDELINES.md`** : nouvelle règle §5 — `gitleaks` tourne désormais en hook pre-commit versionné (`.githooks/pre-commit`, activé par `scripts/install-hooks.sh`), refuse le commit si un secret apparaît dans le diff indexé, dégrade proprement (avertissement) si `gitleaks` n'est pas installé sur le poste. §1 mis à jour : audit de dépendances revérifié le 2026-08-17, toujours 2 alertes *high* sans correctif amont sur `image-size` (inchangé).
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec le nouveau sujet.
- Investigation des alertes de production « constatées » sur `gravitysmtp`, scans `/.git`, `.aws/` et boucle `AH00124` : confirmé hors périmètre de ce dépôt (§3 des guidelines, déjà en place) — aucune trace de plugin WordPress, de route serveur ou de `RewriteRule` dans le code, ce sont des sondes de bots sur l'hébergement partagé. Scan complet de l'historique git (`gitleaks detect`, 85 commits) : aucun secret trouvé.
- Le hook `.githooks/pre-commit` et les correctifs de dépendances dev sont en revue sur la PR `lutin/ameliorations` (#2), pas encore mergée — voir cette PR pour le détail des correctifs de code.

## 0.20.5 — 2026-08-16 · « Frontière repo/serveur »

- **`docs/GUIDELINES.md`** : deux nouvelles règles. §3 — la configuration du vhost Apache (nethttp.net) vit hors du dépôt (seuls `.htaccess` et les scripts de déploiement sont versionnés) : une anomalie HTTP côté serveur (boucle de redirections internes, 500) sur une app 100 % statique sans `RewriteRule` ni service worker relève de l'opérateur du vhost, pas d'un correctif de code ici — investigation menée suite à des logs de production ne révélant aucune cause dans ce dépôt. §4 — les décisions d'architecture actées vont dans `docs/adr/`, numérotées, avec Statut/Date/Contexte/Décision/Conséquences (pratique déjà suivie par les ADR 0001 et 0002, désormais explicite). Ajout d'une note opérationnelle sous §1 : après modif de `pnpm-workspace.yaml`, si `pnpm install` répond « Already up to date » sans rien changer, `rm -rf node_modules` avant de réinstaller.
- README § 16 : pointeur vers `docs/GUIDELINES.md` mis à jour avec les deux nouveaux sujets.

## 0.20.4 — 2026-08-14 · « Guidelines »

- **`docs/GUIDELINES.md`** : premières règles de contribution — audit de sécurité des dépendances (`pnpm audit`) avant chaque release avec overrides justifiés et datés dans `pnpm-workspace.yaml`, et testabilité obligatoire des stores `*.svelte.ts` (runes) en import direct, sans monter de composant. Lié depuis le README § 16.
- README § 14 : arborescence corrigée pour refléter la structure réelle (`apps/web/src/lib/`, fichiers plats dans `packages/audio-engine/src/`, extension déjà livrée et non « M2 »).

## 0.20.3 — 2026-08-14 · « Changelog bilingue »

- **`CHANGELOG.en.md`** : rattrapage de tout l'historique en anglais, entrée par entrée, en miroir de `CHANGELOG.md`. Les deux évoluent désormais ensemble à chaque version.

## 0.20.2 — 2026-07-15 · « Hygiène du dépôt »

- `.gitignore` : les caches Playwright (`playwright-transform-cache-*/`) ne peuvent plus se glisser dans un commit, comme `node-compile-cache/` avant eux.

## 0.20.1 — 2026-07-15 · « Panneau automix déclippé »

- **Correctif d'affichage** : le panneau ⚙ de l'automix était rogné par la colonne étroite du mixer (libellés coupés des deux côtés). Il flotte désormais au centre de l'écran (`position: fixed`, insensible aux `overflow` des ancêtres) et s'élargit à 300 px. Vérifié par capture avant/après.

## 0.20.0 — 2026-07-15 · « Automix sur mesure »

L'automix passe de « il mixe tout seul » à « il mixe **comme toi** » : tous ses choix sont désormais réglables (⚙ à côté d'AUTOMIX, persistés, bornés, réglages d'usine en un clic ↺).

- **Sources au choix** : 💾 fichiers locaux · ♥ favoris · 🕘 historique — cochables indépendamment.
- **Tempo** : tolérance réglable de ±1 à ±25 % (octaves comprises).
- **Tonalité, trois personnalités** : *Ignorée* (tempo seul), *Préférée* (les compatibles Camelot passent devant, jamais bloquant), *Stricte* (compatibles uniquement — sinon l'automix attend, aucun repli hasardeux).
- **Hasard dosable** (pioche parmi les 1 à 10 meilleurs), **anti-répétition 0–50**, bornes de **durée min/max** (anti-jingle, anti-DJ-set d'une heure).
- **Transition façonnable** : préparation à −15…−180 s, fondu 2–60 s, **courbes** Douce/Linéaire/Coupée, **échange de basses** (le low du deck entrant reste killé jusqu'au milieu du fondu, puis les basses basculent — EQ extension ou deck local), départ sur **premier cue ou début**.
- **⏭ Mixer maintenant** : force la transition immédiate sans attendre la fin du morceau.
- Sous le capot : `pickNextTrack` et les courbes de fondu restent purs et testés (14 + 3 cas), réglages sérialisés/bornés testés à part — 296 tests unitaires, 7 E2E.

## 0.19.1 — 2026-07-15 · « Release documentée & fichiers locaux réparés sur le miroir »

- **`docs/RELEASE.md`** : la procédure complète de publication (vérifications, doc, commit unique version+changelog, CI verte avant tag, release avec zip, vitrines) est consignée dans le repo, utilisable sans outillage externe. Liée depuis le README § 16.
- **Correctif CSP** : la politique servie par youtubator.nethttp.net ne déclarait pas `media-src`, si bien que l'audio `blob:` (decks fichiers locaux et pré-écoute 🎧) y était bloqué — GitHub Pages n'impose pas de CSP, seul le miroir était touché. Ajout de `media-src 'self' blob:` dans `apps/web/public/.htaccess`.
- **`pnpm typecheck` réparé** (il ne pointait sur aucun tsconfig) : couvre l'audio-engine ; deux erreurs de types corrigées au passage (`ProtocolMessage` devient une union distributive qui se discrimine sur `type`).

## 0.19.0 — 2026-07-09 · « Automix intelligent & glisser-déposer »

- **AUTOMIX** (bouton dans le mixer) : l'app mixe toute seule — le morceau suivant est choisi **au tempo (±6 %, octaves comprises) et à la tonalité compatibles** dans la bibliothèque (fichiers locaux + favoris + historique, anti-répétition sur les 12 derniers), chargé sur le deck opposé avec SYNC, démarré **sur son premier cue**, puis **transition douce de 12 s au crossfader** et rotation à l'infini. Une pointe de hasard parmi les 3 meilleurs candidats évite les enchaînements toujours identiques. Statut affiché (« Ensuite : … », « Transition → … »).
- **Glisser-déposer** : toute ligne du browser se glisse directement sur un deck (surbrillance du deck cible), équivalent des boutons →A/→B.

## 0.18.0 — 2026-07-09 · « Deck local parité totale »

Les cinq dernières marches du deck fichiers locaux — désormais au niveau (et parfois au-dessus) du deck YouTube+extension.

- **Boucles sample-accurate locales** : la région IN→OUT est rejouée depuis l'AudioBuffer décodé, à travers l'EQ/filtre/gain — zéro seek, boucles parfaites, ÷2/×2 et beat loops compris. Le temps affiché cycle dans la région, la sortie reprend en phase.
- **Tags embarqués** : lecture des **ID3v2 (MP3) et Vorbis comments (FLAC)** au scan — artiste, titre, album, **genre** (les genres numériques ID3v1 sont traduits). Les tags priment sur le nom de fichier, et **le genre devient le style par défaut** du morceau (jamais par-dessus un choix manuel).
- **Tonalité locale** : chromagramme offline (Goertzel 36 demi-tons) → détection de clé Camelot sur tout le morceau, vérifiée E2E (La 220 Hz → 8A pile).
- **Filtre bipolaire et VU-mètre** actifs sur les decks locaux ; **pré-écoute 🎧** des fichiers locaux (audio direct, départ au tiers).
- **⚡ file d'analyse locale** : BPM + tonalité + waveform de toute la bibliothèque en tâche de fond (décodage direct, sans deck ni extension), compteur de progression dans l'onglet LOCAL — MATCH et tri BPM utiles sur toute la collection.

## 0.17.0 — 2026-07-09 · « Colonnes à la carte »

- **Colonne Artiste** dédiée (chaîne YouTube ou tag du fichier local) et colonnes **BPM** / **Tonalité** séparées.
- **⚏ Colonnes** : choisir les colonnes affichées dans toutes les listes — Vignette, Style, Artiste, BPM, Tonalité, Lectures, Durée, Note (le titre est toujours là). Choix persisté.
- **Défaut épuré : style · titre · artiste** — le reste s'active à la demande.
- Tri : « Artiste » (ex-Chaîne) et nouvelle clé **Tonalité** (Camelot, inconnues en fin).

## 0.16.0 — 2026-07-09 · « Fichiers locaux »

La brique bibliothèque locale façon Traktor — tes achats Bandcamp/Beatport, tes rips, tes prods.

- **Onglet 💾 LOCAL** : « + Dossier musique » (File System Access, permission mémorisée, ↻ rescan, ✕ retrait), scan récursif (MP3, FLAC, WAV, OGG, M4A, AAC, Opus, AIFF…), « Artiste - Titre » depuis le nom de fichier, numéros de piste nettoyés. Firefox : import ponctuel de dossier (fichiers stockés dans le navigateur).
- **Deck local sans extension** : `LocalFileBackend` (audio + graphe Web Audio en page) — **EQ 3 bandes, kills, Master Tempo/Vinyle et rate continu natifs**. Le badge EXT ne concerne plus que les decks YouTube.
- **Analyse instantanée** : le fichier est décodé entier au chargement — waveform complète immédiate, **BPM/grille et tonalité en quelques secondes** (vérifié à 140.0 pile sur un WAV de test), auto-gain. Tout est persisté comme pour YouTube (cues, boucles, notes, styles).
- Filtre, tri, MATCH, sélection multiple, crates, favoris : les morceaux locaux passent dans **tout** le pipeline du browser (ids `file:` stables). Badge 💾 sur les lignes, liens YouTube retirés. Dexie v9 (`localFolders`, `localTracks`).
- Limites v1 : filtre bipolaire/delay inactifs sur deck local, boucles précises au tick (~80 ms) — sample-accurate à venir.

## 0.15.0 — 2026-07-09 · « MIDI complet & preset S2 »

- **22 nouvelles actions MIDI mappables** par deck : **EQ 3 bandes** (knobs ±12 dB), **kills** (mute High/Mid/Low), **boucles** (IN, OUT, reloop ∞, ÷2, ×2). Les toggles ne réagissent qu'à l'appui (un bouton mappé en CC ne bascule plus deux fois).
- **Preset NI Traktor Kontrol S2** (mode MIDI) : mixer complet (crossfader, volumes, EQ, tempo faders), transport, hot cues et section loop — les knobs FX font office de filtres. Le preset **X1** gagne sa section loop.
- Réglages : la grille MIDI défile dans le dialogue.

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
