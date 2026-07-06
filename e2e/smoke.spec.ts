import { expect, test } from '@playwright/test';

// Smoke test : l'app démarre, les contrôles potard se rendent,
// les onglets et réglages répondent. Pas de lecture YouTube (flaky en CI).

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
  await page.getByTitle('Réglages').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Clé API YouTube Data v3')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('le clavier pilote le crossfader', async ({ page }) => {
  await page.goto('/');
  await page.locator('article.deck').first().waitFor({ timeout: 30_000 });
  const before = await page.locator('pt-crossfader').evaluate((el) => (el as HTMLElement & { value: number }).value);
  await page.keyboard.press('ArrowRight');
  const after = await page.locator('pt-crossfader').evaluate((el) => (el as HTMLElement & { value: number }).value);
  expect(after).toBeCloseTo(before + 0.1, 5);
});
