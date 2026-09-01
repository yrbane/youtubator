import { defineConfig } from 'vitest/config';

// Config racine : un projet vitest par paquet du monorepo. `web` a sa propre
// config (apps/web/vitest.config.ts, plugin svelte pour les runes) car les
// deps ne sont pas hissées à la racine dans le workspace pnpm.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'audio-engine',
          root: 'packages/audio-engine',
          environment: 'happy-dom',
        },
      },
      {
        test: {
          name: 'extension',
          root: 'extension',
          environment: 'happy-dom',
        },
      },
      'apps/web',
    ],
  },
});
