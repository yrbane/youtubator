import { describe, expect, it } from 'vitest';
import { emptyLoop, ghostPosition, pressIn, pressOut, shouldJump, toggleActive } from './loop.js';

describe('ghostPosition — position fantôme pour le loop roll', () => {
  it('avance depuis le point d’engagement au rate effectif', () => {
    expect(ghostPosition(120, 4, 1)).toBe(124);
    expect(ghostPosition(120, 4, 1.05)).toBeCloseTo(124.2, 10);
  });

  it('reste au point d’engagement à t=0', () => {
    expect(ghostPosition(120, 0, 1.2)).toBe(120);
  });
});

describe('boucle IN/OUT', () => {
  it('pressIn pose le point d’entrée', () => {
    const loop = pressIn(emptyLoop(), 12);
    expect(loop).toEqual({ inS: 12, outS: null, active: false });
  });

  it('pressOut après IN pose la sortie et active la boucle', () => {
    const loop = pressOut(pressIn(emptyLoop(), 12), 16);
    expect(loop).toEqual({ inS: 12, outS: 16, active: true });
  });

  it('pressOut sans IN ou avant IN est ignoré', () => {
    expect(pressOut(emptyLoop(), 16)).toEqual(emptyLoop());
    const loop = pressIn(emptyLoop(), 12);
    expect(pressOut(loop, 11)).toEqual(loop);
  });

  it('re-pressIn pendant une boucle active redéfinit l’entrée et invalide la sortie', () => {
    const active = pressOut(pressIn(emptyLoop(), 12), 16);
    expect(pressIn(active, 30)).toEqual({ inS: 30, outS: null, active: false });
  });

  it('toggleActive coupe puis relance la boucle (reloop) en gardant les points', () => {
    const active = pressOut(pressIn(emptyLoop(), 12), 16);
    const exited = toggleActive(active);
    expect(exited).toEqual({ inS: 12, outS: 16, active: false });
    expect(toggleActive(exited).active).toBe(true);
  });

  it('toggleActive sans points complets ne fait rien', () => {
    expect(toggleActive(pressIn(emptyLoop(), 12)).active).toBe(false);
  });

  it('shouldJump renvoie le point IN au franchissement du OUT, sinon null', () => {
    const active = pressOut(pressIn(emptyLoop(), 12), 16);
    expect(shouldJump(active, 15.9)).toBeNull();
    expect(shouldJump(active, 16)).toBe(12);
    expect(shouldJump(active, 17.2)).toBe(12);
    expect(shouldJump(toggleActive(active), 17)).toBeNull(); // désactivée
    expect(shouldJump(active, 5)).toBeNull(); // avant la boucle
  });
});
