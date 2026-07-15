# Publication d'une version

Procédure de release de Youtubator — chaque commit sur `main` est une version.

## Vue d'ensemble

Deux mécanismes distincts :

- **Déploiement** : automatique à chaque push sur `main` (aucune action manuelle).
- **Publication** : le rituel ci-dessous — version, changelog, tag, release GitHub.

## Déploiement automatique (au push)

Trois workflows se déclenchent en parallèle :

| Workflow | Fichier | Rôle |
|---|---|---|
| CI | `.github/workflows/ci.yml` | Tests unitaires (Vitest) + e2e (Playwright) |
| Pages | `.github/workflows/pages.yml` | Build `--base=/youtubator/` → [yrbane.github.io/youtubator](https://yrbane.github.io/youtubator/) + zip d'extension en artefact |
| Deploy nethttp | `.github/workflows/deploy-nethttp.yml` | Build base `/` → rsync SSH (secrets `NETHTTP_SSH_KEY`, `NETHTTP_KNOWN_HOSTS`) → [youtubator.nethttp.net](https://youtubator.nethttp.net) |

Plan B manuel pour le miroir : `scripts/deploy-nethttp.sh` (nécessite l'hôte SSH `nethttp` configuré).
La CSP du miroir vit dans `apps/web/public/.htaccess` (celle du vhost bloquerait YouTube et Google Sign-In) — ne pas le supprimer.

## Étapes de publication, dans l'ordre

### 1. Vérifier avant tout

```bash
pnpm typecheck      # TypeScript strict sur tout le monorepo
pnpm test           # depuis la RACINE uniquement (config vitest racine : happy-dom + setup)
pnpm build          # build de production (app + extension)
npx playwright test # e2e si l'UI ou le comportement change
```

⚠️ Ne jamais lancer `vitest` depuis `apps/web` : sans la config racine, les tests
qui touchent `window` cassent.

### 2. Rédiger la doc

Mettre à jour le `README.md` (spécification de référence : sections F-XXX) et
vérifier que ce qu'il raconte correspond encore au comportement réel.

### 3. Un seul commit : code + version + changelog

- **Bump SemVer** dans `package.json` **et** `apps/web/package.json` (les deux,
  identiques) : `patch` pour un correctif/ajustement, `minor` pour une
  fonctionnalité, `major` pour une rupture. La version est injectée au build
  (`__APP_VERSION__`, voir `apps/web/vite.config.ts`) et affichée dans la topbar.
- **Nouvelle entrée en tête de `CHANGELOG.md`** :
  `## X.Y.Z — AAAA-MM-JJ · « titre »` + puces détaillées.
- Message de commit en français, descriptif, **sans mention d'assistant**.
- `git add` **ciblé** (jamais `-A` : risque d'embarquer caches et artefacts).
- Push sur `main` → les trois workflows déploient.

### 4. Attendre la CI verte avant de taguer

```bash
# le flag --commit de `gh run list` est cassé : filtrer soi-même par SHA
gh run list --limit 10 --json status,conclusion,headSha
```

Tous les workflows du SHA doivent être `completed`/`success` (la file d'attente
GitHub peut prendre plusieurs minutes). Lancer les commandes depuis la **racine**
du repo (les extractions de notes utilisent des chemins relatifs).

### 5. Tag annoté

```bash
git tag -a vX.Y.Z -m "vX.Y.Z — titre"
git push origin vX.Y.Z
```

### 6. Release GitHub avec artefact

```bash
cd extension && pnpm build && cd dist && zip -r youtubator-extension-vX.Y.Z.zip .
# notes = section CHANGELOG de la version, rien d'autre
gh release create vX.Y.Z --title 'vX.Y.Z — titre' \
  --notes "$(sed -n '/^## X.Y.Z/,/^## <version précédente>/p' CHANGELOG.md | head -n -1 | tail -n +2)" \
  youtubator-extension-vX.Y.Z.zip
```

### 7. Vitrines publiques

À chaque version, mettre à jour :

- le **profil GitHub** ([yrbane/yrbane](https://github.com/yrbane/yrbane)) ;
- le **site vitrine** ([yrbane/yrbane.github.io](https://github.com/yrbane/yrbane.github.io)) —
  projets, descriptions, liens démo/release, et **captures d'écran fraîches**
  (headless Chromium, stockées dans `yrbane.github.io/shots/`, réutilisées par
  le README de profil).

## Rappels

- Après ajout d'un **nouveau domaine** servant l'app : autoriser son origine sur
  le Client ID OAuth Google (console), sinon la connexion compte échoue.
- Les migrations **Dexie** ne se suppriment jamais : toujours ajouter une
  `version(n+1)` avec migration.
