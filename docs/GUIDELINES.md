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

## 2. Les stores `*.svelte.ts` (runes) doivent être testables sans monter de composant

Les classes d'état partagé (`Deck`, `Mixer`, `Automix`…) vivent dans des
fichiers `*.svelte.ts` utilisant les runes Svelte 5 (`$state`). Elles doivent
rester unitairement testables en `import` direct dans un fichier
`*.svelte.test.ts`, sans avoir à monter un composant `.svelte` — c'est ce qui
permet d'écrire un test qui reproduit un bug de cycle de vie (fuite de
`setInterval`, listener non nettoyé) en quelques lignes, à la `vi.mock` près
sur les dépendances lourdes (backends audio, IndexedDB).

Ceci suppose que le plugin Svelte soit chargé dans la config Vitest du paquet
concerné (`apps/web/vitest.config.ts`) — c'est le cas depuis la PR qui a
corrigé la fuite de ticker de `Deck#wireBackend` et ajouté `Mixer#destroy()`.
Tout nouveau paquet introduisant des fichiers `*.svelte.ts` doit répliquer ce
réglage avant d'écrire son premier test.

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
