// Build de l'extension : bundle IIFE du content script + copie du manifest
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

await build({
  entryPoints: [
    { in: 'src/main.ts', out: 'frame-agent' },
    { in: 'src/background.ts', out: 'background' },
    { in: 'src/offscreen.ts', out: 'offscreen' },
    { in: 'src/worklet.ts', out: 'worklet' },
  ],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outdir: 'dist',
});
mkdirSync('dist', { recursive: true });
cpSync('manifest.src.json', 'dist/manifest.json');
cpSync('offscreen.html', 'dist/offscreen.html');
console.log('extension construite dans dist/');
