/**
 * Lightweight language-agnostic tokenization utilities.
 *
 * We deliberately avoid heavy NLP libraries and keep the pipeline lightweight,
 * open-source, and purpose-built. Regex-based tokenization is fast,
 * deterministic, and good enough for English-like corpora.
 */

/** English stop words. Kept small on purpose (fast lookups, minimal memory). */
export const STOP_WORDS = new Set<string>([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off',
  'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
  'yourself', 'yourselves',
]);

/** Normalize a token: lower-case + strip surrounding punctuation. */
export function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Split a text into an array of raw word tokens. */
export function tokenize(text: string): string[] {
  return text
    .split(/\s+/u)
    .map(normalizeToken)
    .filter((t) => t.length > 0);
}

/** Tokens useful for frequency analysis (filtered: no stop-words, min length 2). */
export function meaningfulTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Split a text into sentences. Uses a conservative regex that handles
 * common punctuation without breaking on decimals / abbreviations too
 * aggressively. Keeps the code deterministic and dependency-free.
 */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (!normalized) return [];
  // Split on sentence terminators followed by whitespace and an uppercase/quote.
  const parts = normalized.split(/(?<=[.!?])\s+(?=["'(\p{Lu}])/gu);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Count lines in the original text (\n-separated). */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).length;
}

/** Compute the word-frequency map from meaningful tokens. */
export function wordFrequencies(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of meaningfulTokens(text)) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

/** Pick the top-N entries from a frequency map, stable sorted. */
export function topN(freq: Map<string, number>, n: number): Array<{ word: string; count: number }> {
  return [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}
