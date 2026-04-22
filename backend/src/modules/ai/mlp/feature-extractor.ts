import { meaningfulTokens, STOP_WORDS, tokenize } from '../utils/tokenizer';

/**
 * Sentence-level feature extractor used by the MLP.
 *
 * Each sentence gets a fixed-size numeric feature vector. Features are chosen
 * so an untrained-from-zero-but-bootstrapped MLP can quickly learn a useful
 * notion of "importance" for extractive summarization.
 *
 * Feature order (kept stable — all persisted models depend on it):
 *   [0] normalized position (1.0 at start, decays to 0)
 *   [1] relative length (sentence length / longest sentence)
 *   [2] lexical density (meaningful tokens / total tokens)
 *   [3] stop-word ratio
 *   [4] title/top-word overlap ratio
 *   [5] numeric-token density
 *   [6] uppercase-token density (proper nouns proxy)
 *   [7] average TF-IDF-ish score of meaningful tokens
 */
export const FEATURE_COUNT = 8;

export interface SentenceFeatures {
  features: number[];
  sentence: string;
}

export class FeatureExtractor {
  /** Extract feature matrix for all sentences of a document. */
  extract(sentences: string[], topWords: string[]): SentenceFeatures[] {
    if (sentences.length === 0) return [];

    const tokensPerSentence = sentences.map((s) => tokenize(s));
    const longest = Math.max(1, ...tokensPerSentence.map((t) => t.length));

    // Document-level word frequencies (for a cheap TF-IDF-ish weight).
    const docFreq = new Map<string, number>();
    for (const tokens of tokensPerSentence) {
      const seen = new Set<string>();
      for (const t of tokens) {
        if (!seen.has(t)) {
          docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
          seen.add(t);
        }
      }
    }
    const n = sentences.length;
    const topWordSet = new Set(topWords.map((w) => w.toLowerCase()));

    return sentences.map((sentence, i) => {
      const tokens = tokensPerSentence[i];
      const meaningful = meaningfulTokens(sentence);
      const totalTokens = Math.max(1, tokens.length);

      const position = 1 - i / Math.max(1, n - 1);
      const relLength = tokens.length / longest;
      const lexicalDensity = meaningful.length / totalTokens;
      const stopRatio = tokens.filter((t) => STOP_WORDS.has(t)).length / totalTokens;

      const overlap = meaningful.filter((t) => topWordSet.has(t)).length;
      const topOverlap = meaningful.length > 0 ? overlap / meaningful.length : 0;

      const numerics = tokens.filter((t) => /^[0-9][0-9.,]*$/u.test(t)).length / totalTokens;
      const upper = sentence.match(/\b[A-Z][A-Za-z]*/gu)?.length ?? 0;
      const upperDensity = upper / totalTokens;

      // TF-IDF-ish weight: tf * log(N/df)
      let tfidfSum = 0;
      for (const t of meaningful) {
        const df = docFreq.get(t) ?? 1;
        tfidfSum += Math.log((n + 1) / df);
      }
      const tfidfAvg = meaningful.length > 0 ? tfidfSum / meaningful.length : 0;
      const tfidfNorm = Math.min(1, tfidfAvg / Math.log(n + 2));

      return {
        sentence,
        features: [position, relLength, lexicalDensity, stopRatio, topOverlap, numerics, upperDensity, tfidfNorm],
      };
    });
  }
}
