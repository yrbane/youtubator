import { describe, expect, it } from 'vitest';
import { moveItem } from './list-utils.js';

describe('moveItem — réordonner une crate', () => {
  it('déplace vers le haut et vers le bas sans muter', () => {
    const arr = ['a', 'b', 'c', 'd'];
    expect(moveItem(arr, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveItem(arr, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(arr).toEqual(['a', 'b', 'c', 'd']);
  });

  it('bornes hors liste : clampe sans jeter', () => {
    expect(moveItem(['a', 'b'], 0, 99)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 1, -5)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']); // origine invalide : inchangé
  });
});
