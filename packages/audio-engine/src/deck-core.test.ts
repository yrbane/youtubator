import { describe, expect, it } from 'vitest';
import { DeckCore } from './deck-core.js';

describe('DeckCore — machine à états', () => {
  it('démarre à l’état empty', () => {
    expect(new DeckCore('A').state).toBe('empty');
  });

  it('passe en loading au chargement, puis en cued quand le backend est prêt', () => {
    const d = new DeckCore('A');
    d.load('dQw4w9WgXcQ');
    expect(d.state).toBe('loading');
    expect(d.videoId).toBe('dQw4w9WgXcQ');
    d.ready();
    expect(d.state).toBe('cued');
    expect(d.cuePointS).toBe(0);
  });

  it('joue depuis cued, se met en pause en mémorisant le point de cue', () => {
    const d = new DeckCore('A');
    d.load('x');
    d.ready();
    expect(d.play()).toBe(true);
    expect(d.state).toBe('playing');
    d.pause(42.5);
    expect(d.state).toBe('paused');
    expect(d.cuePointS).toBe(42.5);
  });

  it('reprend la lecture depuis paused sans toucher au point de cue', () => {
    const d = new DeckCore('A');
    d.load('x');
    d.ready();
    d.play();
    d.pause(30);
    expect(d.play()).toBe(true);
    expect(d.state).toBe('playing');
    expect(d.cuePointS).toBe(30);
  });

  it('cue() ramène au point de cue et passe en cued, même en lecture', () => {
    const d = new DeckCore('A');
    d.load('x');
    d.ready();
    d.play();
    d.pause(30);
    d.play();
    expect(d.cue()).toBe(30);
    expect(d.state).toBe('cued');
  });

  it('refuse play() sans morceau chargé', () => {
    const d = new DeckCore('A');
    expect(d.play()).toBe(false);
    expect(d.state).toBe('empty');
  });

  it('permet de recharger un autre morceau par-dessus (retour à loading, cue remis à 0)', () => {
    const d = new DeckCore('A');
    d.load('x');
    d.ready();
    d.play();
    d.pause(30);
    d.load('y');
    expect(d.state).toBe('loading');
    d.ready();
    expect(d.cuePointS).toBe(0);
  });

  it('passe en error sur échec, et peut recharger depuis error', () => {
    const d = new DeckCore('A');
    d.load('x');
    d.fail('video introuvable');
    expect(d.state).toBe('error');
    expect(d.errorMessage).toBe('video introuvable');
    d.load('y');
    expect(d.state).toBe('loading');
    expect(d.errorMessage).toBeNull();
  });

  it('notifie les abonnés à chaque transition et permet de se désabonner', () => {
    const d = new DeckCore('A');
    const seen: string[] = [];
    const unsub = d.subscribe((s) => seen.push(s));
    d.load('x');
    d.ready();
    unsub();
    d.play();
    expect(seen).toEqual(['loading', 'cued']);
  });
});
