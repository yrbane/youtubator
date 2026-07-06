// Build de l'extension : bundle IIFE du content script + copie du manifest
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/frame-agent.js',
});
mkdirSync('dist', { recursive: true });
cpSync('manifest.json', 'dist/manifest.json');
console.log('extension construite dans dist/');
