<script lang="ts">
  let { connected, onClose }: { connected: boolean; onClose: () => void } = $props();

  const RELEASES = 'https://github.com/yrbane/youtubator/releases/latest';
</script>

<div class="backdrop" onclick={onClose} role="presentation">
  <div class="dialog panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Extension Youtubator">
    <h2>
      🧩 Extension Youtubator
      <span class="status" class:on={connected}>{connected ? '● installée et active' : '○ non détectée'}</span>
    </h2>

    <p class="why">
      YouTube joue dans une iframe verrouillée : sans extension, l'app ne peut pas toucher à
      l'audio. L'extension s'installe <strong>dans le navigateur</strong> (pas sur YouTube) et
      débloque le vrai son de mix :
    </p>

    <ul class="unlocks">
      <li><strong>EQ 3 bandes réel</strong> par platine (HI/MID/LOW, kills)</li>
      <li><strong>Modes tempo</strong> : Master Tempo (pitch conservé) et Vinyle</li>
      <li><strong>Waveforms réelles</strong> capturées pendant la lecture (sinon : pseudo-waveform «&nbsp;~&nbsp;»)</li>
      <li><strong>Boucles à l'échantillon près</strong> et boucles de 1-32 beats exactes</li>
      <li><strong>Détection BPM + tonalité</strong> (grille de beats, sync, MATCH, analyse ⚡)</li>
      <li><strong>Filtre, delay, auto-gain</strong> et enregistrement du mix (Chrome)</li>
    </ul>

    <p class="without">Sans elle : lecture, crossfader, volumes, bibliothèque et cues fonctionnent — mais boucles approximatives (~80 ms) et pas d'EQ.</p>

    <div class="steps">
      <div>
        <h3>Chrome / Chromium / Edge (~2 min)</h3>
        <ol>
          <li><a href={RELEASES} target="_blank" rel="noreferrer">Télécharger le zip</a> (« youtubator-extension-… ») et le <strong>dézipper</strong></li>
          <li>Ouvrir <code>chrome://extensions</code> et activer le <strong>Mode développeur</strong> (en haut à droite)</li>
          <li>« <strong>Charger l'extension non empaquetée</strong> » → choisir le dossier dézippé</li>
          <li>Recharger Youtubator : le badge <strong>EXT</strong> passe au vert ●</li>
        </ol>
      </div>
      <div>
        <h3>Firefox</h3>
        <ol>
          <li>Télécharger et dézipper le même zip</li>
          <li>Ouvrir <code>about:debugging#/runtime/this-firefox</code></li>
          <li>« <strong>Charger un module temporaire</strong> » → choisir <code>manifest.json</code> dans le dossier</li>
          <li>Recharger Youtubator (à refaire à chaque démarrage de Firefox — limite des modules temporaires)</li>
        </ol>
      </div>
    </div>

    <div class="actions">
      <a class="btn primary" href={RELEASES} target="_blank" rel="noreferrer">⤓ Télécharger l'extension</a>
      <button class="btn" onclick={onClose}>Fermer</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: center;
    z-index: 60;
    padding: 16px;
  }

  .dialog {
    width: min(640px, 94vw);
    max-height: 90vh;
    overflow-y: auto;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .status {
    font-size: 11px;
    font-weight: 700;
    color: var(--yt-text-dim);
  }

  .status.on {
    color: var(--yt-deck-c);
  }

  .why,
  .without {
    margin: 0;
    color: var(--yt-text-dim);
    font-size: 12.5px;
    line-height: 1.5;
  }

  .unlocks {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
    margin-top: 4px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 12px;
    color: var(--yt-deck-a);
  }

  ol {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--yt-text);
  }

  code {
    background: var(--yt-panel-deep);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 11px;
  }

  a {
    color: var(--yt-deck-a);
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 6px;
  }

  .btn.primary {
    background: var(--yt-deck-a);
    color: #101318;
    border-color: transparent;
    text-decoration: none;
  }
</style>
