# Guidelines

Règles de contribution propres à Youtubator, en complément de la spécification
(`README.md`) et de la procédure de release (`docs/RELEASE.md`). Ce fichier
s'étoffe au fil des passages — pas de déversement en une fois : chaque règle
doit être vraie pour ce dépôt aujourd'hui, ou accompagnée du changement qui la
rend vraie.

## 1. Audit de sécurité des dépendances avant chaque release

Avant de taguer une version (`docs/RELEASE.md` § 1), lancer :

```bash
pnpm audit
```

- Ce qui se corrige par un simple bump de version (`package.json`) : bump.
- Ce qui ne se corrige que via une dépendance transitive non patchable
  directement : forcer le correctif dans `pnpm-workspace.yaml: overrides`,
  avec un **commentaire daté** expliquant d'où vient la dépendance
  (`pnpm why <paquet>`) et quand réévaluer (ex. « au prochain bump de
  web-ext »).
- Ce qui n'a **aucun correctif publié en amont** : le documenter en commentaire
  à côté de l'override le plus proche (paquet, avisory GHSA, dernière version
  disponible), pas de suppression silencieuse de l'alerte.

⚠️ Après une modification de `pnpm-workspace.yaml` (ex. ajout d'un override) ou
d'un `package.json`, si `pnpm install` répond « Already up to date » sans
toucher `pnpm-lock.yaml` ni installer quoi que ce soit : `rm -rf node_modules`
puis réinstaller. La résolution ne se relance pas toujours toute seule.

Youtubator n'a aucune dépendance runtime de production concernée à ce jour
(`dexie`, `potard`) — le risque connu vit entièrement dans l'outillage dev
(`web-ext` → `addons-linter`, `vite`/`vitest`). Ne pas relâcher la vigilance
pour autant : une dépendance runtime future suit la même procédure, avec une
priorité plus élevée (impact utilisateur final, pas seulement CI/poste dev).

**État réel sur `main` au 2026-08-26** : `pnpm audit` y remonte toujours
**19 alertes (14 *high* + 5 *moderate*)**, toutes dev-only (`web-ext` →
`addons-linter` → `cheerio`/`undici`/`js-yaml`/`fast-uri`/`brace-expansion`/
`image-size`/`adm-zip`/`shell-quote`/`nanoid`, plus `postcss` côté Vite). Les
correctifs (bump + `pnpm-workspace.yaml: overrides`) sont déjà écrits et
vérifiés sur la branche `lutin/ameliorations` (PR #2, ouverte le 2026-08-14,
CI verte, **toujours pas fusionnée 12 nuits plus tard** — arbitrage demandé en
issues #10 et #13) : une fois mergée, il ne restera que les 2 alertes *high* sur
`image-size` sans correctif publié en amont (`>=2.0.3` annoncé par l'avisory
GHSA-5p2g-fcmc-qvqq, jamais paru sur npm à ce jour ; `web-ext@10.6.0` est déjà
sa dernière version publiée, rien à bumper de plus côté outillage). Tant que
la PR n'est pas mergée, ne pas répéter les correctifs déjà préparés — les
relire sur la branche, pas les rejouer à la main sur `main`.

## 2. Les stores `*.svelte.ts` (runes) doivent être testables sans monter de composant

Les classes d'état partagé (`Deck`, `Mixer`, `Automix`…) vivent dans des
fichiers `*.svelte.ts` utilisant les runes Svelte 5 (`$state`). Elles doivent
rester unitairement testables en `import` direct dans un fichier
`*.svelte.test.ts`, sans avoir à monter un composant `.svelte` — c'est ce qui
permet d'écrire un test qui reproduit un bug de cycle de vie (fuite de
`setInterval`, listener non nettoyé) en quelques lignes, à la `vi.mock` près
sur les dépendances lourdes (backends audio, IndexedDB).

Ceci suppose que le plugin Svelte soit chargé dans la config Vitest du paquet
concerné (`apps/web/vitest.config.ts`, avec son propre `defineConfig` et
`svelte()`) — introduit par la PR qui corrige la fuite de ticker de
`Deck#wireBackend` et ajoute `Mixer#destroy()` (branche `lutin/ameliorations`,
PR #2). **Sur `main`, pas encore fusionnée à ce jour** : `apps/web` n'a pas ce
fichier, le projet Vitest racine le déclare inline sans le plugin, et un
`import` direct d'un `*.svelte.ts` dans un test y échoue (runes non
transformées). Tout nouveau paquet introduisant des fichiers `*.svelte.ts`
doit répliquer ce réglage — dès la fusion de la PR sur `main`, ou immédiatement
s'il est développé sur une branche qui en dépend déjà.

## 3. La configuration serveur (vhost, Apache) vit hors du dépôt

Le miroir auto-hébergé `youtubator.nethttp.net` tourne sur un vhost Apache
partagé (« websecurity »), configuré côté serveur — ce dépôt ne versionne que
`apps/web/public/.htaccess` (surcharge de la CSP, cf. §1 de son en-tête) et
les scripts de déploiement (`scripts/deploy-nethttp.sh`,
`.github/workflows/deploy-nethttp.yml`). Youtubator est une app 100 %
statique (aucune route serveur, aucun `RewriteRule` dans `.htaccess`, pas de
service worker) : une anomalie HTTP qui ressemble à un problème serveur
(redirections internes en boucle — `AH00124`, 500 générique) **ne peut pas
être causée par ce dépôt**. Vérifier d'abord que le build (`dist/index.html`
présent, `.htaccess` inchangé) est sain ; si oui, l'incident relève de
l'opérateur du vhost nethttp.net, pas d'un correctif de code ici.

## 4. Les décisions d'architecture actées vont dans `docs/adr/`, numérotées

Toute décision qui change la structure du projet (choix de stack, découpage
en étages, dépendance imposée par une contrainte externe — cross-origin,
API tierce…) devient une ADR : `docs/adr/NNNN-titre-court.md` avec
**Statut**, **Date**, section *Contexte* puis *Décision* puis *Conséquences*.
Une ADR qui en amende une autre le dit explicitement dans son **Statut**
(ex. ADR 0002 : « amende le point 3 de l'ADR 0001 ») plutôt que de laisser
les deux documents se contredire silencieusement.

## 5. Scan de secrets systématique avant chaque commit

`gitleaks` tourne en hook pre-commit (`.githooks/pre-commit`, activé par
`scripts/install-hooks.sh` — `git config core.hooksPath .githooks`) : il
scanne le diff indexé (`gitleaks protect --staged`) et refuse le commit si un
secret y apparaît. Un poste sans `gitleaks` installé laisse passer le commit
avec un avertissement plutôt que de bloquer un contributeur non équipé.

**Ce hook n'existe que sur la branche `lutin/ameliorations` (PR #2), pas
encore fusionnée sur `main` à ce jour** : `main` n'a ni `.githooks/`, ni
`scripts/install-hooks.sh`. Tant que la PR n'est pas mergée, quiconque clone
`main` n'a donc aucun filet local — le scan complet de l'historique
(`gitleaks detect --source . --log-opts="--all"`) reste la seule garantie
réelle, et doit être relancé à chaque passage du lutin, hook ou pas.
Aucun secret trouvé lors du scan du 2026-08-26 (93 commits, historique complet
+ arbre de travail).

## 6. La logique avec cycle de vie propre (minuteurs, séquencement) s'extrait dans un module `*-core.ts` sans DOM

Même principe de testabilité que la règle 2, étendu au-delà des stores : toute
logique de calcul ou d'orchestration temporelle qui n'a pas besoin du DOM vit
dans un module `*-core.ts` dédié plutôt que dans le composant `.svelte` ou le
backend qui l'utilise — `packages/audio-engine/src/deck-core.ts`,
`apps/web/src/lib/automix-core.ts` et `midi-core.ts` en sont les exemples de
référence déjà sur `main`, chacun testé en `*-core.test.ts` par `import`
direct, sans `happy-dom` ni composant monté.

Un composant qui orchestre plusieurs minuteurs enchaînés (par exemple un
`setTimeout` qui réarme lui-même un `requestAnimationFrame` une fois l'onglet
redevenu visible) ne doit pas garder cette logique inline dans son `$effect` :
elle s'extrait dans un tel module, avec une fonction d'arrêt qui annule
strictement **tout** ce qu'elle a armé — pas seulement le dernier identifiant
capturé par la dernière itération de la boucle. C'est la même famille de bug
que la fuite de ticker visée par la règle 2 (une ressource asynchrone non
suivie survit à son `$effect`), version « minuteur en cascade » : le cleanup
doit suivre chaque ressource créée, y compris celles armées indirectement par
une autre.

## 7. `.gitignore` se met à jour dans le même commit que l'outil qui génère le dossier

Tout outil de dev qui écrit un dossier de sortie sur disque (rapport, cache,
état de dernier run) doit voir ce dossier ajouté à `.gitignore` **dans le
commit qui l'introduit** — pas après coup, une fois qu'un fichier généré s'est
déjà glissé dans un commit. C'est déjà arrivé deux fois : `node-compile-cache/`
et `playwright-transform-cache-*/` (corrigés en v0.20.2, après coup) puis
`test-results/.last-run.json` — écrit par Playwright après chaque run local
(état pass/fail pour `--last-failed`), tracké par erreur depuis le commit qui a
introduit les tests e2e (`88fcc02`, jamais rattrapé) et retiré seulement en
v0.20.8, avec `playwright-report/` (dossier du rapport HTML, déjà référencé
par `.github/workflows/ci.yml` en artefact CI) ajouté au passage par
anticipation.

Avant de committer l'ajout d'un nouvel outil (test runner, bundler, linter…),
vérifier sa doc pour son dossier de sortie par défaut et l'ajouter à
`.gitignore` immédiatement — `git status` ne doit jamais faire apparaître un
fichier généré comme candidat au prochain commit.

## 8. `any` n'est toléré qu'aux frontières avec une API navigateur non typée

`tsconfig.base.json` active `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` et `verbatimModuleSyntax` sur tout le monorepo —
mais `any` apparaît bel et bien dans le code (`grep -rn ": any\|as any"
apps/web/src extension/src`, une vingtaine d'occurrences à ce jour). Elles se
concentrent **exclusivement** sur des globaux ou API sans typage officiel dans
le projet : `chrome.*` (`extension/src/background.ts`, `offscreen.ts`,
`capture.ts` — pas de `@types/chrome` installé), le global `YT` de l'IFrame
API et `google` du Sign-In (`apps/web/src/lib/yt-iframe.ts`,
`youtube-auth.ts`), `navigator.requestMIDIAccess` (Web MIDI, `midi.svelte.ts`)
et la File System Access API (`FileSystemDirectoryHandle.values()`,
`webkitRelativePath`, `local-library.ts`).

`packages/audio-engine/src` (le cœur pur) et tous les modules `*-core.ts`
(règle 6) sont à zéro `any` aujourd'hui — c'est vérifiable par le même grep.
Un nouvel `any` en dehors d'une frontière API non typée équivalente (nouveau
SDK tiers sans types, nouvelle API navigateur expérimentale) doit être vu
comme une régression, pas une commodité ; le typage se resserre dès que
possible juste après la frontière (variable locale re-typée, pas de
propagation du `any` dans les signatures publiques du module).

## 9. Une capacité partagée entre backends vit dans `DeckAudioBackend` ; une capacité propre à un seul backend s'atteint par `instanceof` depuis `Deck`

Le contrat `DeckAudioBackend` (`packages/audio-engine/src/types.ts`) documente
déjà : « L'UI ne consulte que `capabilities`, jamais le type concret » — vrai
pour le comportement commun aux backends (lecture, seek, EQ, tempo). Mais
`LocalFileBackend` expose en plus des méthodes que `ExtensionBackend` et
`IframeApiBackend` n'ont pas (`decodeForAnalysis`, `onMeter`, `engageLoop` /
`exitLoop`, `setFilter`) : `apps/web/src/lib/deck.svelte.ts` y accède par
narrowing `instanceof LocalFileBackend`, jamais l'inverse — un backend n'importe
jamais `Deck` ni ne connaît son orchestrateur.

Ce n'est pas une incohérence avec le docblock : c'est le critère qui tranche
où loger une nouvelle capacité. Avant d'écrire du code pour une capacité
nouvelle (typiquement au moment d'ajouter le backend SoundCloud, issue #1) :
si elle a du sens pour au moins deux backends (même dégradée), elle rejoint
`DeckAudioBackend`/`DeckCapabilities` et `capabilities` en signale la
disponibilité ; si elle est propre à un seul backend, elle reste une méthode
publique de ce backend, atteinte depuis `Deck` par le même `instanceof` que
`LocalFileBackend` — jamais ajoutée à l'interface commune pour un seul
utilisateur.

## 10. Un token OAuth vit en `sessionStorage`, jamais en `localStorage`

`apps/web/src/lib/youtube-auth.ts` distingue explicitement les deux : le
Client ID (`youtubator.ytClientId`) et le compte actif
(`youtubator.activeAccountId`) sont des identifiants non sensibles, persistés
en `localStorage` pour survivre d'une session à l'autre ; l'access token
YouTube lui-même (`storeToken`/`getValidToken`, préfixe
`youtubator.ytToken.`) vit exclusivement en `sessionStorage` — effacé à la
fermeture de l'onglet, jamais écrit sur disque à plus long terme. Le
commentaire au-dessus de `DEFAULT_CLIENT_ID` (`app-config.ts`) précise
pourquoi le Client ID, lui, peut être public sans risque : protégé par les
« origines JavaScript autorisées » du projet Google, pas par le secret.

Un token d'accès (contrairement au Client ID) donne un accès réel au compte
YouTube de l'utilisateur (scope `youtube.force-ssl`, lecture/écriture) : le
faire migrer vers `localStorage` pour un confort quelconque (survie au
redémarrage du navigateur, partage entre onglets sans re-connexion) briserait
cette limite volontaire sans qu'aucun test ne le signale. Toute nouvelle
donnée d'authentification (nouveau backend avec OAuth, ex. SoundCloud —
issue #1) suit le même partage : secret de session en `sessionStorage`,
identifiant non sensible seul en `localStorage`.

## 11. Un listener `message` cross-frame filtre par `e.source`, jamais par confiance implicite dans l'origine

Deux frontières `postMessage` traversent une origine cross-origin par
construction : `apps/web/src/lib/deck-channel.ts` (app ↔ iframe YouTube) et
`extension/src/main.ts` (content script ↔ page parente, mode extension). Dans
les deux cas, l'émission se fait avec un origin générique (`'*'`, YouTube ne
publie pas d'origine stable à cibler) mais la réception filtre strictement
par référence de fenêtre — `e.source === iframe.contentWindow` d'un côté,
`e.source === window.parent` de l'autre — avant de traiter `e.data`. Un
listener `message` qui traiterait `e.data` sans ce filtre laisserait
n'importe quelle page insérée dans l'onglet (autre iframe, extension tierce)
injecter des messages arbitraires dans le protocole `FrameAgent`/`Deck`.

Un nouveau canal `postMessage` (nouveau backend embarqué en iframe, nouveau
pont content-script) reprend ce même filtre par `e.source` — jamais de
vérification par `e.origin` seule (l'origine de l'iframe YouTube change selon
la vidéo/domaine `-nocookie`) ni, pire, aucune vérification du tout.

## 12. `any` à la frontière d'une API HTTP externe se résout dès le `fetch`, jamais par un `Promise<any>` générique

Contrairement aux frontières API navigateur non typées de la règle 8
(`chrome.*`, `YT`, `google`, Web MIDI, File System Access — un SDK ou un
global qu'on ne contrôle pas), une réponse JSON d'API HTTP externe
(`fetch(...).json()`) n'impose aucun `any` : rien n'empêche de déclarer
l'interface de la réponse, même minimaliste et à champs optionnels, puisqu'il
s'agit seulement de documenter un contrat qu'on lit déjà. `main` illustrait le
contre-exemple dans `apps/web/src/lib/youtube-account.ts` : `apiGet(): Promise<any>`
propageait `any` jusque dans la signature publique de
`fetchAccountIdentity(): Promise<{ channels: any; userinfo: any }>` — alors
que `accounts.ts` définissait déjà `RawChannels`/`RawUserinfo` pour le même
usage, seulement non exportées.

**Corrigé sur la branche `lutin/ameliorations` (PR #2), pas encore sur
`main`** : `apiGet<T>` est désormais générique, chaque appel précise sa forme
(`RawChannels`, `RawPlaylistsResponse`, `RawVideosResponse`,
`RawPlaylistItemsResponse`) — zéro `any` restant dans `youtube-account.ts`,
vérifié par le même grep que la règle 8. Un futur endpoint HTTP externe
(SoundCloud oEmbed, issue #1) suit le même principe : une interface `Raw*`
minimale dès le premier appel, jamais un `Promise<any>` de confort.

## 13. `pnpm typecheck` ne couvre que `packages/audio-engine` — vérifier `apps/web`/`extension` à la main tant que l'issue #3 n'est pas tranchée

Le script racine `typecheck` (`package.json`) est `tsc -p packages/audio-engine
--noEmit` : il ne voit ni `apps/web` (aucun `tsconfig.json`), ni `extension`
(même constat). `pnpm build` ne comble pas ce trou — `vite build` transpile
via esbuild sans vérifier les types. Une régression de type dans un fichier
`.ts` de ces deux paquets (par exemple un `any` qu'on resserre, comme la
règle 12 ce soir) passe donc `pnpm typecheck` et `pnpm build` sans être
détectée nulle part.

En attendant l'arbitrage de l'issue #3, toute modification de type dans
`apps/web/src/**/*.ts` ou `extension/src/**/*.ts` se vérifie explicitement
avant commit, avec les mêmes options que `tsconfig.base.json` faute de
`tsconfig.json` dédié à ces paquets :

```bash
npx tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes \
  --verbatimModuleSyntax --noImplicitOverride --target ES2022 --module ESNext \
  --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --skipLibCheck \
  <fichiers .ts modifiés et leurs imports directs>
```

Preuve que ce n'est pas un risque théorique : lancée pour la première fois ce
soir sur les 78 fichiers `.ts` (hors `*.svelte.ts`) de `apps/web/src` et
`extension/src`, cette commande a trouvé quatre violations réelles, toutes
invisibles jusqu'ici — `WaveformRecord#gridV` (`library.ts`), l'indexation de
`TRACK_COLORS` (`track-meta.ts`), `LocalTrack#album`/`#genre`
(`local-library.ts`) et l'incrémentation de `chroma[bin]`
(`extension/audio-graph.ts`) — voir CHANGELOG v0.20.12 et v0.20.14. Une
cinquième (`local-files.test.ts`, assertion sur un élément de tableau
possiblement `undefined`) reste ouverte, test-only et sans impact production.
⚠️ Ne pas compiler plusieurs fichiers d'entrée d'extension indépendants
(`background.ts`, `offscreen.ts`) en un seul appel `tsc` : chacun déclare son
propre `declare const chrome: any`, et les compiler ensemble déclenche un faux
« Cannot redeclare block-scoped variable » qui n'existe pas en isolation —
vérifié en compilant `background.ts` seul.

Les fichiers `.svelte` et les stores `*.svelte.ts` à runes (`$state`,
`$effect`…, règle 2) ne passent pas par cette voie — vérifié ce soir sur
`deck.svelte.ts` : `tsc` seul échoue avec `Cannot find name '$state'`, faute
du préprocesseur Svelte. Pour ceux-là, seule une revue manuelle attentive
protège tant que `svelte-check` n'est pas configuré (issue #3).

## 14. Un nouveau domaine externe contacté par l'app se déclare dans la CSP du miroir, dans le même commit

`apps/web/public/.htaccess` réécrit la CSP du vhost partagé (règle 3) pour
autoriser explicitement chaque origine externe dont l'app a besoin :
`script-src`/`frame-src`/`connect-src` pour YouTube et Google Sign-In,
`img-src` pour les vignettes (`i.ytimg.com`, `*.ggpht.com`,
`*.googleusercontent.com`). C'est une liste blanche stricte —
`default-src 'self'` — donc toute ressource non listée y est bloquée
silencieusement sur `youtubator.nethttp.net` uniquement (GitHub Pages ignore
les `.htaccess`, cf. commentaire en tête du fichier : l'incident ne s'y
reproduit jamais, ce qui retarde sa détection).

Déjà arrivé deux fois pour le même type d'oubli : la bibliothèque de fichiers
locaux (lecture par `blob:`, v0.16.0) a fonctionné sans accroc sur GitHub
Pages mais cassait le miroir nethttp — `media-src` n'avait pas été mis à jour
pour autoriser `blob:`, corrigé seulement 3 versions plus tard (v0.19.1, puis
re-précisé en v0.19.2 « + lien RELEASE.md »). Un nouveau backend qui charge
une ressource cross-origin (nouvel embed SoundCloud, issue #1 ; nouvelle
police, nouvelle API tierce) suit le même réflexe : mettre à jour cette ligne
**avant** de considérer la fonctionnalité terminée, pas seulement quand un
rapport signale que « ça marche sur GitHub Pages mais pas sur le miroir ».

## 15. Le schéma Dexie (`YoutubatorDb`) s'étend par version cumulative, jamais par modification d'une version existante — mais reste sans test de migration à ce jour

`apps/web/src/lib/library.ts` déclare 9 versions Dexie successives
(`this.version(1)` à `this.version(9)`), chacune réécrivant l'intégralité du
schéma `.stores()` jusque-là plutôt qu'un simple diff — `version(2)` et
`version(7)` ajoutent en plus un `.upgrade(async (tx) => …)` qui transforme
les données existantes (attribution `by`/`byId` par défaut pour les entrées
v1 ; dérivation de `styleColors` depuis `trackMeta` pour les entrées v6). Une
évolution de schéma modifie donc toujours la **dernière** version si elle
n'a jamais été publiée, ou en ajoute une **nouvelle** si elle l'a été — jamais
de réécriture d'une version déjà taguée, sous peine de casser la migration
des utilisateurs qui ont une base IndexedDB existante à cette version.

Angle mort réel et vérifié ce soir : il n'existe aucun `library.test.ts`, ni
de dépendance `fake-indexeddb` dans `package.json` — `YoutubatorDb` et ses
deux `.upgrade()` ne sont exercés qu'en production, jamais par la suite
Vitest (`happy-dom` ne fournit pas d'IndexedDB, `apps/web/src/test-setup.ts`
ne comble que `localStorage`/`sessionStorage`). Une régression dans un futur
`.upgrade()` ne serait donc détectée par aucun test avant d'atteindre un
utilisateur avec des données réelles à migrer. Combler ce point suppose
d'introduire une dépendance de test (`fake-indexeddb`, la solution documentée
par Dexie lui-même) — un choix qui dépasse une simple correction et reste à
trancher plutôt qu'à imposer ce soir.

## 16. L'installation en CI tourne en `--frozen-lockfile=false` depuis l'origine du workflow — un garde-fou manquant, pas un correctif

Les deux jobs de `.github/workflows/ci.yml` (`ci` et `e2e`) installent avec
`pnpm install --frozen-lockfile=false`, présent tel quel depuis le premier
commit du fichier (jamais commenté, jamais réévalué). Ce flag autorise pnpm à
**recalculer** la résolution de dépendances en mémoire si `package.json` ne
correspond plus exactement à `pnpm-lock.yaml`, au lieu d'échouer
immédiatement — c'est l'inverse du comportement par défaut de pnpm hors CI
(`--frozen-lockfile` strict) et l'inverse de ce que `pnpm-lock.yaml` est censé
garantir : un commit qui élargit une plage de version dans un `package.json`
sans régénérer le lockfile passerait la CI silencieusement, avec une
résolution différente de celle qu'installerait un contributeur en local.

Vérifié ce soir : `pnpm install --frozen-lockfile` (strict, sans `=false`)
réussit sans aucune modification sur `main` — le lockfile est à jour, ce
n'est donc pas un correctif qui répare quelque chose d'actuellement cassé,
seulement un garde-fou absent. Retirer `=false` dans les deux occurrences du
workflow est bloqué par la même limite que l'issue #20 : le token OAuth du
lutin n'a pas le scope `workflow`, GitHub refuse toute mise à jour de
`.github/workflows/*.yml` par ce canal — la correction reste décrite ici pour
application manuelle par le mainteneur, ou automatique dès que le scope sera
ajouté.

## 17. Un workflow qui n'appelle pas l'API GitHub déclare des `permissions` minimales explicites, comme `pages.yml`

`.github/workflows/pages.yml` déclare `permissions: contents: read, pages:
write, id-token: write` — strictement ce dont `configure-pages`/`deploy-pages`
a besoin. `.github/workflows/deploy-nethttp.yml`, lui, ne déclare **aucun**
bloc `permissions` : son seul contact avec l'API GitHub est le `checkout`
initial (`contents: read`) — tout le reste du job (build Vite, rsync par SSH
vers `nethttp.net`) ne touche jamais `GITHUB_TOKEN`. Sans bloc explicite, le
token hérite du réglage par défaut du dépôt (Settings → Actions → Workflow
permissions), plus large que nécessaire ici et non documenté par ce fichier.
`.github/workflows/ci.yml` a le même trou.

Vérifié ce soir : ni `ci.yml` ni `deploy-nethttp.yml` ne déclarent de
`permissions`, alors que `pages.yml` (même dépôt) le fait déjà correctement.
Correction identique pour les deux (`permissions: contents: read` en tête de
job) bloquée par la même limite que la règle 16 et l'issue #20 : décrite ici
pour application manuelle par le mainteneur, ou automatique dès que le scope
`workflow` sera ajouté au token du lutin. Tout nouveau workflow doit partir de
la déclaration minimale dès sa création — comme `pages.yml` le fait déjà —
plutôt que d'hériter implicitement du réglage par défaut du dépôt.

## 18. `extension/manifest.src.json` ne déclare que les permissions Chrome réellement appelées dans `extension/src`

Trois permissions aujourd'hui : `tabCapture`, `offscreen`, `downloads`.
Vérifiable par grep — chaque permission déclarée a un appel `chrome.*`
correspondant dans le code, et chaque appel `chrome.*` du code qui **exige**
une permission manifest en a une :

```bash
grep -rn "chrome\.\(tabCapture\|offscreen\|downloads\)" extension/src/
grep -rohn "chrome\.[a-zA-Z]*\." extension/src/*.ts | sort -u
```

La seconde commande remonte aussi `chrome.action` et `chrome.runtime`,
disponibles sans déclaration dans `permissions` (API de base de toute
extension MV3) — ne pas les y ajouter par réflexe. Même logique pour
`content_scripts`/`web_accessible_resources` : les deux ne ciblent que
`https://www.youtube.com/*` et `https://www.youtube-nocookie.com/*`, jamais
`<all_urls>` ni un domaine plus large que ce que `frame-agent.ts`/
`worklet.ts` utilisent réellement — c'est ce périmètre étroit qui rend la
revue d'une future demande de permission (nouveau backend embarqué, issue
#1) immédiate : toute permission qui n'apparaît pas dans ce grep est soit
un oubli de nettoyage après une fonctionnalité retirée, soit une extension de
périmètre à justifier explicitement (et à documenter dans `docs/STORES.md`
une fois l'issue #9 tranchée), jamais une addition silencieuse.
