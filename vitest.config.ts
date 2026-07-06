import { defineConfig } from 'vitest/config';

// Config racine : un projet vitest par paquet du monorepo
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
      {
        test: {
          name: 'web',
          root: 'apps/web',
          environment: 'happy-dom',
        },
      },
    ],
  },
});
