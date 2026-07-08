import { describe, expect, it } from 'vitest';
import { shouldShowOnboarding } from './onboarding.js';

describe('écran d’accueil — quand l’afficher', () => {
  it('affiché au premier lancement (aucun compte, pas de refus mémorisé)', () => {
    expect(shouldShowOnboarding(0, false)).toBe(true);
  });

  it('plus jamais affiché dès qu’un compte est connu', () => {
    expect(shouldShowOnboarding(1, false)).toBe(false);
    expect(shouldShowOnboarding(3, true)).toBe(false);
  });

  it('respecte le choix « continuer sans compte »', () => {
    expect(shouldShowOnboarding(0, true)).toBe(false);
  });
});
