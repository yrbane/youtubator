import { expect, test } from '@playwright/test';

// Smoke test : l'app démarre, les contrôles potard se rendent,
// les onglets et réglages répondent. Pas de lecture YouTube (flaky en CI).

// L'écran d'accueil (connexion Google) s'affiche au premier lancement :
// on mémorise le choix « sans compte » avant chaque navigation.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('youtubator.onboardingSkipped', '1'));
});

test('l’écran d’accueil propose la connexion Google au premier lancement', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.removeItem('youtubator.onboardingSkipped'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Se connecter avec Google/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Continuer sans compte/ }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
});

test('l’app démarre avec deux decks et le mixer', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Youtubator/);
  // l'API YouTube charge puis les decks apparaissent
  await expect(page.locator('article.deck')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByText('MASTER')).toHaveCount(0); // rien ne joue
  // contrôles potard enregistrés et rendus
  expect(await page.locator('pt-knob').count()).toBeGreaterThanOrEqual(6);
  expect(await page.locator('pt-fader').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('pt-crossfader')).toHaveCount(1);
  const upgraded = await page.evaluate(() => Boolean(customElements.get('pt-knob')));
  expect(upgraded).toBe(true);
});

test('les onglets du browser commutent', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'HISTORIQUE' }).click();
  await expect(page.getByText(/morceaux|apparaît ici/).first()).toBeVisible();
  await page.getByRole('button', { name: 'FAVORIS' }).click();
  await expect(page.getByText(/favoris avec ☆|playlist/i).first()).toBeVisible();
  await page.getByRole('button', { name: /YOUTUBE/ }).click();
  await expect(page.getByText(/Client ID OAuth|Se connecter|compte/i).first()).toBeVisible();
});

test('les réglages s’ouvrent et se ferment', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle(/^Réglages : clés API/).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Clé API YouTube Data v3')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('le panneau de réglages automix s’ouvre, se règle et se ferme', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle("Réglages de l'automix").click();
  const panel = page.getByRole('dialog', { name: 'Réglages automix' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Tempo ±6 %/)).toBeVisible(); // défaut d'usine
  await panel.getByLabel(/Tempo/).fill('10');
  await expect(panel.getByText(/Tempo ±10 %/)).toBeVisible();
  await panel.getByTitle('Fermer').click();
  await expect(panel).toHaveCount(0);
});

test('mobile : tout s’empile, sans défilement horizontal', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('youtubator.onboardingSkipped', '1'));
  await page.goto('/');
  await page.locator('article.deck').first().waitFor({ timeout: 30_000 });
  // pas de débordement horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // les decks sont empilés (le second nettement sous le premier)
  const tops = await page
    .locator('article.deck')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops[1]!).toBeGreaterThan(tops[0]! + 100);
  await context.close();
});

test('le clavier pilote le crossfader', async ({ page }) => {
  await page.goto('/');
  await page.locator('article.deck').first().waitFor({ timeout: 30_000 });
  const before = await page.locator('pt-crossfader').evaluate((el) => (el as HTMLElement & { value: number }).value);
  await page.keyboard.press('ArrowRight');
  const after = await page.locator('pt-crossfader').evaluate((el) => (el as HTMLElement & { value: number }).value);
  expect(after).toBeCloseTo(before + 0.1, 5);
});
