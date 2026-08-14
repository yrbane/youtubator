import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Config Vitest locale (résolution des deps du paquet) : le plugin svelte
// compile les runes ($state, $derived) des stores `*.svelte.ts`, y compris
// hors composants, pour que les tests puissent les importer directement.
export default defineConfig({
  plugins: [svelte()],
  test: {
    name: 'web',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
