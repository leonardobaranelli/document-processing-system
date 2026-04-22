import {
  countLines,
  meaningfulTokens,
  splitSentences,
  tokenize,
  topN,
  wordFrequencies,
} from './tokenizer';

describe('tokenizer utils', () => {
  it('tokenizes and normalizes', () => {
    expect(tokenize('Hello, World!  FOO-bar')).toEqual(['hello', 'world', 'foo-bar']);
  });

  it('removes stop words and short tokens', () => {
    expect(meaningfulTokens('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('counts lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
    expect(countLines('')).toBe(0);
  });

  it('splits sentences', () => {
    const s = splitSentences('Hello world. This is NestJS! Is it running? Yes.');
    expect(s.length).toBe(4);
  });

  it('computes frequencies and topN', () => {
    const freq = wordFrequencies('alpha beta alpha gamma alpha beta');
    const top = topN(freq, 2);
    expect(top[0]).toEqual({ word: 'alpha', count: 3 });
    expect(top[1]).toEqual({ word: 'beta', count: 2 });
  });
});
