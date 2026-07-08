/** Écran d'accueil : logique pure. */

export const ONBOARDING_SKIP_KEY = 'youtubator.onboardingSkipped';

/**
 * On accueille l'utilisateur (logo + connexion Google) tant qu'aucun compte
 * n'est connu ET qu'il n'a pas explicitement choisi de continuer sans compte.
 */
export function shouldShowOnboarding(accountCount: number, skipped: boolean): boolean {
  return accountCount === 0 && !skipped;
}
