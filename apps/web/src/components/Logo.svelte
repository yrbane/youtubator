<script lang="ts">
  /**
   * Logo Youtubator — pur SVG, à mi-chemin entre Traktor (hexagones
   * concentriques façon cellule/vinyle) et YouTube (triangle play arrondi).
   * Dégradé deck A (cyan) → deck B (orange) : les deux platines du mix.
   */
  let { size = 96 }: { size?: number } = $props();
  const uid = `ytr-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Youtubator">
  <defs>
    <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#19c2ff" />
      <stop offset="1" stop-color="#ff8a1e" />
    </linearGradient>
  </defs>
  <!-- hexagones concentriques (Traktor) -->
  <polygon
    points="114,60 87,106.8 33,106.8 6,60 33,13.2 87,13.2"
    fill="none"
    stroke="url(#{uid})"
    stroke-width="4"
    stroke-linejoin="round"
  />
  <polygon
    points="102,60 81,96.4 39,96.4 18,60 39,23.6 81,23.6"
    fill="none"
    stroke="url(#{uid})"
    stroke-width="2.5"
    stroke-linejoin="round"
    opacity="0.55"
  />
  <polygon
    points="90,60 75,86 45,86 30,60 45,34 75,34"
    fill="none"
    stroke="url(#{uid})"
    stroke-width="1.5"
    stroke-linejoin="round"
    opacity="0.3"
  />
  <!-- triangle play arrondi (YouTube) -->
  <polygon
    points="49,42 49,78 81,60"
    fill="url(#{uid})"
    stroke="url(#{uid})"
    stroke-width="8"
    stroke-linejoin="round"
  />
</svg>
