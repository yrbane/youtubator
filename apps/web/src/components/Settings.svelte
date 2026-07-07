<script lang="ts">
  import { DEFAULT_TEMPO_RANGE } from '@youtubator/audio-engine';
  import { getApiKey, setApiKey } from '../lib/search.js';
  import { getClientId, setClientId } from '../lib/youtube-auth.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { mixer, onClose }: { mixer: Mixer; onClose: () => void } = $props();

  import { exportCrate, importCrate } from '../lib/crate.js';
  import { midi, MIDI_ACTIONS } from '../lib/midi.svelte.js';

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
      Client ID OAuth Google <small>(connexion au compte YouTube — onglet ▶ YOUTUBE. Laisser vide
        pour utiliser celui fourni par l'instance s'il existe ; ou <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer">créer le tien</a
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

    <div class="midi">
      <span>Contrôleur MIDI</span>
      {#if !midi.enabled}
        <button class="btn" onclick={() => void midi.enable()}>Activer le MIDI</button>
        {#if midi.error}<small class="err">{midi.error}</small>{/if}
      {:else}
        <small>{midi.deviceNames.length ? midi.deviceNames.join(', ') : 'Aucun périphérique détecté'}</small>
        <div class="midi-grid">
          {#each MIDI_ACTIONS as action (action.id)}
            <span class="m-label">{action.label}</span>
            <span class="mono m-bind">
              {midi.map[action.id]
                ? `${midi.map[action.id]!.kind} ch${midi.map[action.id]!.channel + 1} #${midi.map[action.id]!.number}`
                : '—'}
            </span>
            <button class="btn m-learn" class:learning={midi.learning === action.id} onclick={() => midi.learn(action.id)}>
              {midi.learning === action.id ? 'Bouge…' : 'Learn'}
            </button>
            <button class="btn" disabled={!midi.map[action.id]} onclick={() => midi.clear(action.id)}>✕</button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="crate">
      <span title="Sauvegarde complète : dossiers d’analyse, favoris, crates, notes/styles/couleurs, filtres sauvegardés, historique — pour changer de machine ou partager">Bibliothèque (waveforms, cues, favoris, crates, notes, styles, historique)</span>
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

  .midi {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--yt-text-dim);
    font-size: 12px;
    border-top: 1px solid var(--yt-border);
    padding-top: 12px;
  }

  .midi-grid {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 3px 8px;
    align-items: center;
    max-height: 220px;
    overflow-y: auto;
  }

  .m-label {
    color: var(--yt-text);
  }

  .m-bind {
    font-size: 10px;
  }

  .m-learn.learning {
    background: var(--yt-deck-b);
    color: #101318;
    border-color: transparent;
  }

  .err {
    color: var(--yt-danger);
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
