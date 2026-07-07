import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5199 },
  // version affichée dans l'UI (topbar) — source unique : package.json
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
