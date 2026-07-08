<script lang="ts">
  import Logo from './Logo.svelte';
  import { session } from '../lib/session.svelte.js';
  import { ONBOARDING_SKIP_KEY } from '../lib/onboarding.js';

  let { onDone }: { onDone: () => void } = $props();

  let error = $state<string | null>(null);

  async function connect(): Promise<void> {
    error = null;
    try {
      await session.addAccount();
      onDone();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /** « Continuer sans compte » : choix mémorisé, l'écran ne reviendra pas. */
  function skip(): void {
    localStorage.setItem(ONBOARDING_SKIP_KEY, '1');
    onDone();
  }
</script>

<div class="splash" role="dialog" aria-label="Bienvenue sur Youtubator">
  <div class="card">
    <Logo size={104} />
    <h1>YOU<span>TUBATOR</span></h1>
    <p class="tagline">Mixe YouTube comme sur une vraie table.</p>

    <ul class="features">
      <li>🎛 2 à 4 platines vidéo, EQ 3 bandes, sync et beatmatch automatiques</li>
      <li>🎧 Hot cues, boucles calées au beat, waveforms — tout est mémorisé par morceau</li>
      <li>⭐ Tes « J'aime » et playlists YouTube comme bibliothèque, notes, styles et crates</li>
    </ul>

    <button
      class="google"
      onclick={() => void connect()}
      disabled={session.connecting}
      title="Retrouve tes « J'aime » et playlists YouTube, tes favoris se synchronisent avec ton compte — plusieurs comptes possibles, on switche d'un clic"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.8 2.9c2.3-2.1 3.6-5.1 3.6-8.6z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5L1.3 17.3C3.3 21.3 7.3 24 12 24z" />
        <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4L1.3 6.7C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l3.9-2.9z" />
        <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.4-3.3C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.7l3.9 3C6.2 6.7 8.9 4.7 12 4.7z" />
      </svg>
      {session.connecting ? 'Connexion…' : 'Se connecter avec Google'}
    </button>
    {#if error}<p class="error">{error}</p>{/if}

    <button class="skip" onclick={skip} title="L'app marche aussi sans compte : recherche par clé API ou URL collée, favoris et historique restent locaux">
      Continuer sans compte →
    </button>

    <p class="foot">
      v{__APP_VERSION__} · L'EQ, les modes tempo et les boucles exactes s'activent avec
      l'<a href="https://github.com/yrbane/youtubator/releases/latest" target="_blank" rel="noreferrer">extension</a>.
    </p>
  </div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background:
      radial-gradient(ellipse at 20% 10%, rgba(25, 194, 255, 0.12), transparent 50%),
      radial-gradient(ellipse at 80% 90%, rgba(255, 138, 30, 0.12), transparent 50%),
      var(--yt-bg);
    padding: 20px;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 480px;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 30px;
    letter-spacing: 0.14em;
    color: var(--yt-deck-a);
  }

  h1 span {
    color: var(--yt-text);
  }

  .tagline {
    margin: 0;
    color: var(--yt-text-dim);
    font-size: 15px;
  }

  .features {
    list-style: none;
    margin: 6px 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--yt-text);
    font-size: 13px;
    text-align: left;
  }

  .google {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    padding: 12px 26px;
    border-radius: 24px;
    border: none;
    background: #fff;
    color: #1f1f1f;
    cursor: pointer;
    margin-top: 6px;
  }

  .google:hover {
    box-shadow: 0 0 0 3px rgba(25, 194, 255, 0.35);
  }

  .google:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .skip {
    background: none;
    border: none;
    color: var(--yt-text-dim);
    cursor: pointer;
    font-size: 12px;
    text-decoration: underline;
  }

  .skip:hover {
    color: var(--yt-text);
  }

  .error {
    color: var(--yt-danger);
    font-size: 12px;
    margin: 0;
    max-width: 420px;
  }

  .foot {
    margin: 10px 0 0;
    color: var(--yt-text-dim);
    font-size: 11px;
  }

  .foot a {
    color: var(--yt-deck-a);
  }
</style>
