import { meaningfulTokens } from './tokenizer';

/**
 * TextRank extractive summarizer (Mihalcea & Tarau, 2004).
 *
 * Builds a graph where each node is a sentence and each edge weight is the
 * token-overlap similarity between two sentences. We then run power iteration
 * (PageRank) to rank sentences and return the top-K in document order.
 *
 * This is O(N^2) in sentence count, which is fine for the expected document
 * sizes (<= a few thousand sentences). It is 100% offline, deterministic,
 * and uses zero external dependencies.
 */
export interface TextRankOptions {
  /** Damping factor for PageRank (typically 0.85). */
  damping?: number;
  /** Maximum iterations before bailing out. */
  maxIterations?: number;
  /** L1 convergence threshold. */
  tolerance?: number;
}

export interface TextRankResult {
  /** Sentence scores aligned with the input array. Higher is more important. */
  scores: number[];
}

export function textRank(sentences: string[], opts: TextRankOptions = {}): TextRankResult {
  const damping = opts.damping ?? 0.85;
  const maxIter = opts.maxIterations ?? 60;
  const tol = opts.tolerance ?? 1e-4;

  const n = sentences.length;
  if (n === 0) return { scores: [] };
  if (n === 1) return { scores: [1] };

  // Precompute token sets to avoid O(n^3) re-tokenization.
  const tokenSets = sentences.map((s) => new Set(meaningfulTokens(s)));

  // Build weighted adjacency matrix W and out-degree D.
  const W: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const degree: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = similarity(tokenSets[i], tokenSets[j]);
      if (sim > 0) {
        W[i][j] = sim;
        W[j][i] = sim;
        degree[i] += sim;
        degree[j] += sim;
      }
    }
  }

  let scores: number[] = new Array(n).fill(1 / n);
  for (let iter = 0; iter < maxIter; iter++) {
    const next: number[] = new Array(n).fill((1 - damping) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (W[j][i] > 0 && degree[j] > 0) {
          next[i] += damping * (W[j][i] / degree[j]) * scores[j];
        }
      }
    }
    const delta = l1(next, scores);
    scores = next;
    if (delta < tol) break;
  }

  return { scores };
}

/** Overlap similarity normalized by log-lengths (classic TextRank weight). */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const tok of small) if (large.has(tok)) common++;
  const denom = Math.log(a.size + 1) + Math.log(b.size + 1);
  return denom > 0 ? common / denom : 0;
}

function l1(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}
