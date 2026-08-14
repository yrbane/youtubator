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
