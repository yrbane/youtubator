<script lang="ts">
  import { automix } from '../lib/automix.svelte.js';

  let { onclose }: { onclose: () => void } = $props();

  const s = $derived(automix.settings);

  /** m:ss lisible, ou « — » pour « pas de limite ». */
  function fmtDuration(seconds: number): string {
    if (seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function num(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="panel amx-panel" role="dialog" aria-label="Réglages automix">
  <div class="head">
    <span class="title">AUTOMIX — réglages</span>
    <button class="mini" onclick={() => automix.resetSettings()} title="Revenir aux réglages d'usine">↺</button>
    <button class="mini" onclick={onclose} title="Fermer">✕</button>
  </div>

  <fieldset>
    <legend>Sources</legend>
    <label title="Fichiers locaux scannés (onglet LOCAL)">
      <input type="checkbox" checked={s.sourceLocal} onchange={() => automix.updateSettings({ sourceLocal: !s.sourceLocal })} />
      💾 Locaux
    </label>
    <label title="Favoris (♥)">
      <input type="checkbox" checked={s.sourceFavorites} onchange={() => automix.updateSettings({ sourceFavorites: !s.sourceFavorites })} />
      ♥ Favoris
    </label>
    <label title="Historique des morceaux déjà chargés">
      <input type="checkbox" checked={s.sourceHistory} onchange={() => automix.updateSettings({ sourceHistory: !s.sourceHistory })} />
      🕘 Historique
    </label>
  </fieldset>

  <fieldset>
    <legend>Choix du morceau</legend>
    <label class="row" title="Fenêtre de tempo autour du morceau en cours, appariement d'octave compris (±6 % = mixable au pitch)">
      <span>Tempo ±{s.bpmTolerancePct} %</span>
      <input type="range" min="1" max="25" step="1" value={s.bpmTolerancePct} oninput={(e) => automix.updateSettings({ bpmTolerancePct: num(e) })} />
    </label>
    <label class="row" title="Ignorée : tempo seul · Préférée : les tonalités compatibles passent devant · Stricte : uniquement des compatibles (sinon l'automix attend)">
      <span>Tonalité</span>
      <select value={s.keyMode} onchange={(e) => automix.updateSettings({ keyMode: (e.currentTarget as HTMLSelectElement).value as typeof s.keyMode })}>
        <option value="off">Ignorée</option>
        <option value="prefer">Préférée</option>
        <option value="strict">Stricte</option>
      </select>
    </label>
    <label class="row" title="1 = toujours le meilleur candidat (prévisible) · N = pioche parmi les N meilleurs (varié)">
      <span>Hasard : top {s.pickFrom}</span>
      <input type="range" min="1" max="10" step="1" value={s.pickFrom} oninput={(e) => automix.updateSettings({ pickFrom: num(e) })} />
    </label>
    <label class="row" title="On ne rejoue aucun des N derniers morceaux du set">
      <span>Anti-répétition : {s.noRepeat}</span>
      <input type="range" min="0" max="50" step="1" value={s.noRepeat} oninput={(e) => automix.updateSettings({ noRepeat: num(e) })} />
    </label>
    <label class="row" title="Durée minimale d'un candidat — écarte jingles et interludes (durée inconnue tolérée)">
      <span>Durée min {fmtDuration(s.minDurationS)}</span>
      <input type="range" min="0" max="600" step="30" value={s.minDurationS} oninput={(e) => automix.updateSettings({ minDurationS: num(e) })} />
    </label>
    <label class="row" title="Durée maximale d'un candidat — écarte les très longs formats (— = sans plafond)">
      <span>Durée max {fmtDuration(s.maxDurationS)}</span>
      <input type="range" min="0" max="3600" step="60" value={s.maxDurationS} oninput={(e) => automix.updateSettings({ maxDurationS: num(e) })} />
    </label>
  </fieldset>

  <fieldset>
    <legend>Transition</legend>
    <label class="row" title="Le morceau suivant est choisi et chargé sur le deck opposé quand il reste moins que ça">
      <span>Préparer à −{Math.round(s.prepareAtS)} s</span>
      <input type="range" min="15" max="180" step="5" value={s.prepareAtS} oninput={(e) => automix.updateSettings({ prepareAtS: num(e) })} />
    </label>
    <label class="row" title="Durée du fondu au crossfader">
      <span>Fondu {Math.round(s.fadeS)} s</span>
      <input type="range" min="2" max="60" step="1" value={s.fadeS} oninput={(e) => automix.updateSettings({ fadeS: num(e) })} />
    </label>
    <label class="row" title="Douce : départ/arrivée feutrés · Linéaire : régulière · Coupée : plate puis bascule rapide au centre">
      <span>Courbe</span>
      <select value={s.fadeCurve} onchange={(e) => automix.updateSettings({ fadeCurve: (e.currentTarget as HTMLSelectElement).value as typeof s.fadeCurve })}>
        <option value="smooth">Douce</option>
        <option value="linear">Linéaire</option>
        <option value="sharp">Coupée</option>
      </select>
    </label>
    <label title="Le low du deck entrant reste coupé jusqu'au milieu du fondu, puis les basses s'échangent (nécessite l'EQ : extension ou deck local)">
      <input type="checkbox" checked={s.bassSwap} onchange={() => automix.updateSettings({ bassSwap: !s.bassSwap })} />
      Basses échangées
    </label>
    <label class="row" title="Où démarre le deck entrant : sur son premier point de cue (on saute l'intro) ou au tout début">
      <span>Départ</span>
      <select value={s.startMode} onchange={(e) => automix.updateSettings({ startMode: (e.currentTarget as HTMLSelectElement).value as typeof s.startMode })}>
        <option value="cue">Premier cue</option>
        <option value="start">Début</option>
      </select>
    </label>
  </fieldset>
</div>

<style>
  .amx-panel {
    /* fixed : la colonne mixer est étroite et ses ancêtres clippent (overflow) */
    position: fixed;
    top: 76px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    width: min(300px, calc(100vw - 24px));
    max-height: min(72vh, 520px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    font-size: 10px;
    color: var(--yt-text);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .title {
    flex: 1;
    font-weight: 800;
    letter-spacing: 0.05em;
    font-size: 9px;
    color: var(--yt-text-dim);
  }

  .mini {
    padding: 1px 5px;
    font-size: 10px;
    background: transparent;
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text-dim);
    cursor: pointer;
  }

  .mini:hover {
    color: var(--yt-text);
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 6px;
    border: 1px solid var(--yt-border);
    border-radius: 4px;
  }

  legend {
    padding: 0 4px;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--yt-text-dim);
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .row span {
    flex: 0 0 45%;
    font-variant-numeric: tabular-nums;
  }

  input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: var(--yt-deck-d);
  }

  input[type='checkbox'] {
    accent-color: var(--yt-deck-d);
  }

  select {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    background: var(--yt-panel-deep);
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text);
  }
</style>
