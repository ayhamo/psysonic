import { describe, expect, it } from 'vitest';
import { leadArtistName } from './forkLeadArtist';

describe('leadArtistName', () => {
  it('takes the first name of a combined artist', () => {
    expect(leadArtistName('BLACKPINK X SELENA GOMEZ')).toBe('BLACKPINK');
    expect(leadArtistName('DJ Snake, Selena Gomez, Ozuna, Cardi B')).toBe('DJ Snake');
    expect(leadArtistName('Megan Thee Stallion feat. Yuki Chiba')).toBe('Megan Thee Stallion');
    expect(leadArtistName('Lady Gaga & Bruno Mars')).toBe('Lady Gaga');
  });

  it('leaves single artists alone', () => {
    expect(leadArtistName('Bruno Mars')).toBe('');
    expect(leadArtistName('Lil Nas X')).toBe('');
    expect(leadArtistName('')).toBe('');
  });
});
