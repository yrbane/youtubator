<script lang="ts">
  import {
    alignPhaseDelta,
    beatIndexInMeasure,
    beatsToPhrase,
    floorBeat,
    measurePhase,
    periodS,
  } from '@youtubator/audio-engine';
  import { BUCKET_S, nearestCue } from '../lib/waveform.js';
  import type { Deck } from '../lib/deck.svelte.js';
  import type { Mixer } from '../lib/mixer.svelte.js';

  let { mixer }: { mixer: Mixer } = $props();

  const PX_PER_S = 30;
  const ROW_H = 56;
  const CUE_SNAP_S = 0.5;

  let canvases: Record<string, HTMLCanvasElement> = $state({});

  const loadedDecks = $derived(mixer.decks.filter((d) => d.track !== null));

  const displayTime = (deck: Deck): number => deck.displayTimeS();

  function accentOf(deck: Deck): string {
    return getComputedStyle(document.documentElement).getPropertyValue(deck.colorVar).trim() || '#19c2ff';
  }

  function draw(deck: Deck, canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth;
    const h = ROW_H;
    if (w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const accent = accentOf(deck);
    const center = displayTime(deck);
    const half = w / 2 / PX_PER_S;
    const mid = h / 2;

    // buckets visibles
    const first = Math.max(0, Math.floor((center - half) / BUCKET_S));
    const last = Math.min(deck.waveBuckets.length - 1, Math.ceil((center + half) / BUCKET_S));
    const barW = Math.max(1, BUCKET_S * PX_PER_S - 1);
    for (let i = first; i <= last; i++) {
      const t = i * BUCKET_S;
      const x = w / 2 + (t - center) * PX_PER_S;
      const level = deck.waveBuckets[i] ?? 0;
      const bh = Math.max(1, level * (h - 10));
      ctx.fillStyle = t <= center ? accent : `${accent}66`; // joué : plein, à venir : translucide
      ctx.fillRect(x, mid - bh / 2, barW, bh);
    }

    // graduations de beats (fine) et de mesures 4/4 (marquée)
    if (deck.grid) {
      const p = periodS(deck.grid);
      let t = floorBeat(deck.grid, center - half) - p;
      while (t <= center + half) {
        const x = w / 2 + (t - center) * PX_PER_S;
        const beatIndex = Math.round((t - deck.grid.anchorS) / p);
        const isPhrase = ((beatIndex % 16) + 16) % 16 === 0;
        const isMeasure = ((beatIndex % 4) + 4) % 4 === 0;
        ctx.fillStyle = isPhrase
          ? 'rgba(61,220,132,0.55)' // frontière de phrase (16 beats)
          : isMeasure
            ? 'rgba(255,255,255,0.30)'
            : 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, 0, isPhrase ? 2 : 1, isPhrase || isMeasure ? h : h * 0.55);
        t += p;
      }
    }

    // zone de boucle
    if (deck.loop.inS !== null) {
      const x1 = w / 2 + (deck.loop.inS - center) * PX_PER_S;
      const x2 = deck.loop.outS !== null ? w / 2 + (deck.loop.outS - center) * PX_PER_S : x1 + 2;
      ctx.fillStyle = deck.loop.active ? 'rgba(61,220,132,0.18)' : 'rgba(215,220,226,0.10)';
      ctx.fillRect(x1, 0, Math.max(2, x2 - x1), h);
      ctx.fillStyle = deck.loop.active ? '#3ddc84' : '#8b93a0';
      ctx.fillRect(x1 - 1, 0, 2, h);
      if (deck.loop.outS !== null) ctx.fillRect(x2 - 1, 0, 2, h);
    }

    // points de cue
    deck.cues.forEach((cue, index) => {
      const x = w / 2 + (cue - center) * PX_PER_S;
      if (x < -10 || x > w + 10) return;
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(x - 1, 0, 2, h);
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText(String(index + 1), x + 3, 10);
    });

    // tête de lecture (fixe, centrée)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 2 - 1, 0, 2, h);

    // jauge de phase façon Traktor : 4 cases (beats de la mesure) + curseur,
    // et pour un esclave synchronisé, l'écart de phase vs le maître
    if (deck.grid) {
      const cellW = 14;
      const cellH = 6;
      const gap = 2;
      const x0 = 6;
      const y0 = h - cellH - 4;
      const now = center;
      const beat = beatIndexInMeasure(deck.grid, now);
      const phase = measurePhase(deck.grid, now);
      const totalW = 4 * cellW + 3 * gap;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i === beat ? accent : '#2a2f36';
        ctx.fillRect(x0 + i * (cellW + gap), y0, cellW, cellH);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + phase * totalW - 1, y0 - 2, 2, cellH + 4);

      const master = mixer.decks.find((d) => d.id === mixer.masterId);
      if (master && master !== deck && deck.synced && master.grid && master.isPlaying && deck.isPlaying) {
        const deltaS = alignPhaseDelta(master.grid, master.displayTimeS(), deck.grid, now);
        const frac = Math.max(-0.5, Math.min(0.5, deltaS / periodS(deck.grid)));
        const gx = x0 + totalW + 14;
        const gw = 46;
        ctx.fillStyle = '#2a2f36';
        ctx.fillRect(gx, y0 + cellH / 2 - 1, gw, 2);
        ctx.fillStyle = '#8b93a0';
        ctx.fillRect(gx + gw / 2 - 1, y0 - 2, 2, cellH + 4); // repère central
        const absMs = Math.abs(deltaS) * 1000;
        ctx.fillStyle = absMs < 20 ? '#3ddc84' : absMs < 60 ? '#ffcc33' : '#ff4d5e';
        ctx.fillRect(gx + gw / 2 + frac * gw - 1.5, y0 - 3, 3, cellH + 6); // aiguille
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(`${deltaS >= 0 ? '+' : '−'}${Math.round(absMs)} ms`, gx + gw + 6, y0 + cellH);
      }
    }

    // libellé deck + mode waveform + BPM effectif
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = accent;
    ctx.fillText(deck.id, 6, 13);
    if (!deck.waveIsReal && deck.waveBuckets.length > 0) {
      ctx.fillStyle = '#8b93a0';
      ctx.fillText('~', 16, 13); // pseudo-waveform (pas encore capturée)
    }
    if (deck.grid) {
      const label = `${(deck.grid.bpm * deck.effectiveRate).toFixed(1)} BPM`;
      ctx.fillStyle = '#d7dce2';
      ctx.fillText(label, w - ctx.measureText(label).width - 6, 13);
      // compte à rebours avant la prochaine phrase (préparation des transitions)
      const remaining = beatsToPhrase(deck.grid, center);
      const countdown = `−${remaining}`;
      ctx.font = remaining <= 4 ? 'bold 13px ui-monospace, monospace' : 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = remaining <= 4 ? '#ff4d5e' : remaining <= 8 ? '#ffcc33' : '#8b93a0';
      ctx.fillText(countdown, w - ctx.measureText(countdown).width - 6, remaining <= 4 ? 30 : 27);
    }
  }

  function timeAt(deck: Deck, canvas: HTMLCanvasElement, clientX: number): number {
    const rect = canvas.getBoundingClientRect();
    const t = displayTime(deck) + (clientX - rect.left - rect.width / 2) / PX_PER_S;
    return Math.min(Math.max(0, t), deck.durationS || 0);
  }

  function onClick(deck: Deck, e: MouseEvent): void {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const t = timeAt(deck, canvas, e.clientX);
    if (e.shiftKey) {
      deck.toggleCueAt(t); // Shift+clic : pose/retire un cue
      return;
    }
    const cue = nearestCue(deck.cues, t, CUE_SNAP_S);
    deck.seekToS(cue ?? t); // clic : seek (aimanté sur un cue proche)
  }

  // boucle de rendu
  $effect(() => {
    let raf = 0;
    const loop = (): void => {
      for (const deck of loadedDecks) {
        const canvas = canvases[deck.id];
        if (canvas) draw(deck, canvas);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

{#if loadedDecks.length > 0}
  <section class="strip" title="Clic : seek (aimanté sur les cues) · Shift+clic : poser/retirer un point de cue">
    {#each loadedDecks as deck (deck.id)}
      <div class="row" style="--accent: var({deck.colorVar})">
        <canvas
          bind:this={canvases[deck.id]}
          style="height: {ROW_H}px"
          onclick={(e) => onClick(deck, e)}
        ></canvas>
        <div class="controls">
          <div class="cues">
            {#each Array.from({ length: 8 }) as _, i (i)}
              <button
                class="hotcue"
                class:set={deck.cues[i] !== undefined}
                disabled={deck.cues[i] === undefined}
                onclick={() => deck.jumpToCue(i)}
                title={deck.cues[i] !== undefined
                  ? `Sauter au cue ${i + 1} (${deck.cues[i]!.toFixed(1)} s)`
                  : `Cue ${i + 1} — Shift+clic sur la waveform pour le poser`}
              >
                {i + 1}
              </button>
            {/each}
          </div>
          <div class="beats" title={deck.grid ? 'Boucle des N derniers beats, calée sur la grille' : 'BPM inconnu — laisse jouer ~15 s avec l’extension pour détecter la grille'}>
            {#each [1, 2, 4, 8, 16, 32] as n (n)}
              <button
                class="beat"
                disabled={!deck.grid}
                class:on={deck.loop.active &&
                  deck.grid !== null &&
                  deck.loop.inS !== null &&
                  deck.loop.outS !== null &&
                  Math.round((deck.loop.outS - deck.loop.inS) / periodS(deck.grid)) === n}
                onclick={() => deck.beatLoop(n)}
              >
                {n}
              </button>
            {/each}
          </div>
          <div class="octave" title="Corriger l'octave du BPM détecté">
            <button class="lp" disabled={!deck.grid} onclick={() => deck.scaleBpm(0.5)}>½×</button>
            <button class="lp" disabled={!deck.grid} onclick={() => deck.scaleBpm(2)}>2×</button>
          </div>
          <div class="loop">
            <button class="lp" onclick={() => deck.loopIn()} title="Point d'entrée de boucle (au temps courant)">IN</button>
            <button
              class="lp"
              disabled={deck.loop.inS === null}
              onclick={() => deck.loopOut()}
              title="Point de sortie — active la boucle"
            >
              OUT
            </button>
            <button
              class="lp toggle"
              class:on={deck.loop.active}
              disabled={deck.loop.outS === null}
              onclick={() => deck.toggleLoop()}
              title="Couper / relancer la boucle (reloop)"
            >
              ∞
            </button>
            <button
              class="lp roll"
              class:on={deck.rollMode}
              onclick={() => (deck.rollMode = !deck.rollMode)}
              title="Loop roll : à la sortie, reprendre là où le morceau serait arrivé sans la boucle"
            >
              ROLL
            </button>
          </div>
        </div>
      </div>
    {/each}
  </section>
{/if}

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 10px;
    background: var(--yt-panel-deep);
    border-top: 1px solid var(--yt-border);
    border-bottom: 1px solid var(--yt-border);
  }

  .row {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }

  canvas {
    flex: 1;
    min-width: 0;
    display: block;
    cursor: crosshair;
    border-radius: 4px;
    background: #14171b;
  }

  .controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .cues {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
  }

  .hotcue {
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 10px;
    font-weight: 700;
    background: var(--yt-panel);
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text-dim);
    cursor: pointer;
  }

  .hotcue.set {
    background: #ffcc33;
    border-color: transparent;
    color: #101318;
  }

  .hotcue:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .beats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
  }

  .beat {
    min-width: 24px;
    height: 16px;
    padding: 0 4px;
    font-size: 9px;
    font-weight: 700;
    background: var(--yt-panel);
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }

  .beat.on {
    background: var(--yt-deck-c);
    border-color: transparent;
    color: #101318;
  }

  .beat:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .octave,
  .loop {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lp {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    background: var(--yt-panel);
    border: 1px solid var(--yt-border);
    border-radius: 3px;
    color: var(--yt-text);
    cursor: pointer;
    letter-spacing: 0.05em;
  }

  .lp:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .lp.toggle.on {
    background: var(--yt-deck-c);
    border-color: transparent;
    color: #101318;
  }

  .lp.roll.on {
    background: var(--yt-deck-d);
    border-color: transparent;
    color: #101318;
  }
</style>
