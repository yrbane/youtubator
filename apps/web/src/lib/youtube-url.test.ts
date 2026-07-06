import { describe, expect, it } from 'vitest';
import { parseYoutubeInput } from './youtube-url.js';

describe('parseYoutubeInput', () => {
  it('reconnaît un ID vidéo nu (11 caractères)', () => {
    expect(parseYoutubeInput('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('reconnaît une URL watch classique', () => {
    expect(parseYoutubeInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('reconnaît une URL watch avec paramètres supplémentaires', () => {
    expect(parseYoutubeInput('https://www.youtube.com/watch?t=42&v=dQw4w9WgXcQ&list=x')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('reconnaît une URL courte youtu.be', () => {
    expect(parseYoutubeInput('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');
  });

  it('reconnaît une URL shorts et embed', () => {
    expect(parseYoutubeInput('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeInput('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('retourne null pour une recherche textuelle', () => {
    expect(parseYoutubeInput('daft punk around the world')).toBeNull();
    expect(parseYoutubeInput('')).toBeNull();
  });

  it('retourne null pour une URL non YouTube', () => {
    expect(parseYoutubeInput('https://vimeo.com/12345')).toBeNull();
  });
});
