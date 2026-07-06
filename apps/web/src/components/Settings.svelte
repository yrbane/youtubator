<script lang="ts">
  import { DEFAULT_TEMPO_RANGE } from '@youtubator/audio-engine';
  import { getApiKey, setApiKey } from '../lib/search.js';
  import { getClientId, setClientId } from '../lib/youtube-auth.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { mixer, onClose }: { mixer: Mixer; onClose: () => void } = $props();

  import { exportCrate, importCrate } from '../lib/crate.js';

  let apiKey = $state(getApiKey() ?? '');
  let clientId = $state(getClientId() ?? '');
  let crateStatus = $state<string | null>(null);

  async function doExport(): Promise<void> {
    const crate = await exportCrate();
    const blob = new Blob([JSON.stringify(crate)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `youtubator-crate-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    crateStatus = `Exporté : ${crate.waveforms.length} morceaux analysés, ${crate.favorites.length} favoris, ${crate.playlists.length} playlists.`;
  }

  async function doImport(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const counts = await importCrate(JSON.parse(await file.text()));
      crateStatus = counts
        ? `Importé : ${counts.waveforms} dossiers mis à jour, ${counts.favorites} favoris, ${counts.playlists} playlists.`
        : 'Fichier invalide (pas un crate Youtubator).';
    } catch {
      crateStatus = 'Fichier illisible.';
    }
  }
</script>

<div class="backdrop" onclick={onClose} role="presentation">
  <div class="dialog panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Réglages">
    <h2>Réglages</h2>

    <label>
      Clé API YouTube Data v3 <small>(recherche textuelle — <a
          href="https://developers.google.com/youtube/v3/getting-started"
          target="_blank"
          rel="noreferrer">obtenir une clé</a
        >)</small>
      <input
        type="password"
        bind:value={apiKey}
        onchange={() => setApiKey(apiKey)}
        placeholder="AIza…"
      />
    </label>

    <label>
      Client ID OAuth Google <small>(connexion au compte YouTube — onglet ▶ YOUTUBE ; <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer">créer un ID client</a
        >, origine autorisée : ce site)</small>
      <input
        type="text"
        bind:value={clientId}
        onchange={() => setClientId(clientId)}
        placeholder="1234567890-xxxx.apps.googleusercontent.com"
      />
    </label>

    <label>
      Plage du tempo fader
      <select
        value={String(mixer.tempoRange)}
        onchange={(e) => {
          mixer.tempoRange = Number((e.currentTarget as HTMLSelectElement).value);
        }}
      >
        <option value={String(DEFAULT_TEMPO_RANGE)}>±16 % (qualité optimale)</option>
        <option value="0.5">±50 % (artefacts possibles)</option>
      </select>
    </label>

    <label>
      Courbe du crossfader
      <select
        value={mixer.curve}
        onchange={(e) => {
          mixer.curve = (e.currentTarget as HTMLSelectElement).value as typeof mixer.curve;
          mixer.applyVolumes();
        }}
      >
        <option value="constant-power">Équi-puissance (mix)</option>
        <option value="sharp">Sharp (cut / scratch)</option>
      </select>
    </label>

    <div class="crate">
      <span>Crate (waveforms, BPM, tonalités, cues, favoris, playlists)</span>
      <div class="crate-actions">
        <button class="btn" onclick={() => void doExport()}>Exporter</button>
        <label class="btn">
          Importer<input type="file" accept="application/json" hidden onchange={(e) => void doImport(e)} />
        </label>
      </div>
      {#if crateStatus}<small>{crateStatus}</small>{/if}
    </div>

    <button class="btn" onclick={onClose}>Fermer</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: center;
    z-index: 50;
  }

  .dialog {
    width: min(440px, 90vw);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h2 {
    margin: 0;
    font-size: 15px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--yt-text-dim);
    font-size: 12px;
  }

  small a {
    color: var(--yt-deck-a);
  }

  .crate {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--yt-text-dim);
    font-size: 12px;
    border-top: 1px solid var(--yt-border);
    padding-top: 12px;
  }

  .crate-actions {
    display: flex;
    gap: 8px;
  }

  input,
  select {
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--yt-text);
  }
</style>
