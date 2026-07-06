<script lang="ts">
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

    // libellé deck + mode waveform
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = accent;
    ctx.fillText(deck.id, 6, 13);
    if (!deck.waveIsReal && deck.waveBuckets.length > 0) {
      ctx.fillStyle = '#8b93a0';
      ctx.fillText('~', 16, 13); // pseudo-waveform (pas encore capturée)
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
</style>
