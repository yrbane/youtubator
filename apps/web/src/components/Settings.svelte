<script lang="ts">
  import { DEFAULT_TEMPO_RANGE } from '@youtubator/audio-engine';
  import { getApiKey, setApiKey } from '../lib/search.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { mixer, onClose }: { mixer: Mixer; onClose: () => void } = $props();

  let apiKey = $state(getApiKey() ?? '');
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

  input,
  select {
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--yt-text);
  }
</style>
