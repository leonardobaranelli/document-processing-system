import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MLP } from './mlp/mlp';
import { PRETRAINED_MLP } from './mlp/pretrained-weights';
import { FEATURE_COUNT, FeatureExtractor } from './mlp/feature-extractor';
import {
  countLines,
  splitSentences,
  tokenize,
  topN,
  wordFrequencies,
} from './utils/tokenizer';
import { textRank } from './utils/text-rank';

export interface DocumentAnalysis {
  wordCount: number;
  lineCount: number;
  characterCount: number;
  uniqueWords: number;
  averageWordLength: number;
  topWords: Array<{ word: string; count: number }>;
  summary: string;
  summarySentences: string[];
  mlpImportance: number[];
}

export interface AggregateAnalysisInput {
  totalWords: number;
  totalLines: number;
  totalCharacters: number;
  mostFrequentWords: Array<{ word: string; count: number }>;
  filesProcessed: string[];
  globalSummary: string;
}

/**
 * AiService: orchestrates the local open-source AI pipeline.
 *
 * Pipeline per document:
 *   1) Tokenize & compute word / line / character statistics.
 *   2) Extract top-K frequent words (stop-words removed).
 *   3) Split into sentences.
 *   4) Run TextRank to get a graph-based importance score per sentence.
 *   5) Run the MLP on hand-crafted features to get a learned importance score.
 *   6) Combine both scores and pick the top-N sentences, ordered as in the
 *      original document, to form an extractive summary.
 *
 * Aggregation across documents (summary of summaries):
 *   The global summary is not a concatenation of per-document snippets.
 *   Instead, the sentences that survived each per-document selection
 *   are treated as a new mini-corpus, and the same TextRank + MLP
 *   scoring is applied to that corpus. The result is an extractive
 *   summary that competes across documents on equal terms while keeping
 *   the cost linear in the total number of summary sentences.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly extractor = new FeatureExtractor();
  private mlp!: MLP;

  async onModuleInit(): Promise<void> {
    this.mlp = MLP.fromJSON(PRETRAINED_MLP);
    this.bootstrapFineTune();
    this.logger.log(
      `AI engine ready (MLP ${FEATURE_COUNT}-${PRETRAINED_MLP.config.hiddenLayers.join('-')}-1, ` +
        `activation=${PRETRAINED_MLP.config.activation})`,
    );
  }

  /**
   * Quick in-memory fine-tune on a synthetic dataset derived from our feature
   * heuristics. It nudges the pretrained weights towards sensible behavior
   * without needing labeled data. Runs once at boot and is extremely fast
   * (milliseconds for the default 200 samples / 40 epochs).
   */
  private bootstrapFineTune(): void {
    const xs: number[][] = [];
    const ys: number[][] = [];
    const rnd = (min: number, max: number) => Math.random() * (max - min) + min;

    for (let i = 0; i < 250; i++) {
      const position = rnd(0, 1);
      const relLength = rnd(0, 1);
      const lexicalDensity = rnd(0, 1);
      const stopRatio = rnd(0, 1);
      const topOverlap = rnd(0, 1);
      const numerics = rnd(0, 1);
      const upperDensity = rnd(0, 1);
      const tfidfNorm = rnd(0, 1);

      // Ground-truth heuristic (what we want the MLP to approximate).
      const y =
        0.15 * position +
        0.15 * relLength +
        0.18 * lexicalDensity +
        -0.12 * stopRatio +
        0.25 * topOverlap +
        0.05 * upperDensity +
        0.04 * numerics +
        0.30 * tfidfNorm;
      const clamped = Math.max(0, Math.min(1, y + rnd(-0.03, 0.03)));

      xs.push([position, relLength, lexicalDensity, stopRatio, topOverlap, numerics, upperDensity, tfidfNorm]);
      ys.push([clamped]);
    }
    this.mlp.train(xs, ys, { epochs: 40, batchSize: 32 });
  }

  /** Analyze a single document and return stats + summary. */
  async analyzeDocument(
    text: string,
    opts: { topWords?: number; summarySentences?: number } = {},
  ): Promise<DocumentAnalysis> {
    const topK = opts.topWords ?? 10;
    const summaryK = opts.summarySentences ?? 3;

    const tokens = tokenize(text);
    const freq = wordFrequencies(text);
    const topWordsList = topN(freq, topK);

    const wordCount = tokens.length;
    const lineCount = countLines(text);
    const characterCount = text.length;
    const uniqueWords = freq.size;
    const averageWordLength =
      wordCount > 0
        ? tokens.reduce((sum, w) => sum + w.length, 0) / wordCount
        : 0;

    const sentences = splitSentences(text);
    const topWordsLower = topWordsList.map((w) => w.word);
    const { selected: summarySentences, mlpScores } = await this.summarizeCorpus(
      sentences,
      topWordsLower,
      Math.min(summaryK, sentences.length),
    );
    const summary = summarySentences.join(' ');

    return {
      wordCount,
      lineCount,
      characterCount,
      uniqueWords,
      averageWordLength: Number(averageWordLength.toFixed(3)),
      topWords: topWordsList,
      summary,
      summarySentences,
      mlpImportance: mlpScores.map((n) => Number(n.toFixed(4))),
    };
  }

  /**
   * Build an aggregate result from multiple per-document analyses.
   *
   * Totals and top words are straightforward reductions. The global
   * summary is built by running the same TextRank + MLP scoring over
   * the union of sentences that each per-document summary already
   * selected. That way every document competes on equal footing and
   * the final summary is a genuine extractive summary of the summaries,
   * not a concatenation of heuristic snippets.
   */
  async aggregate(
    perDocument: Array<{ filename: string; analysis: DocumentAnalysis }>,
    opts: { globalSummarySentences?: number } = {},
  ): Promise<AggregateAnalysisInput> {
    const globalK = opts.globalSummarySentences ?? 5;

    const freq = new Map<string, number>();
    let totalWords = 0;
    let totalLines = 0;
    let totalCharacters = 0;
    const filesProcessed: string[] = [];
    const allSummarySentences: string[] = [];

    for (const { filename, analysis } of perDocument) {
      totalWords += analysis.wordCount;
      totalLines += analysis.lineCount;
      totalCharacters += analysis.characterCount;
      filesProcessed.push(filename);
      for (const s of analysis.summarySentences) {
        if (s && s.trim().length > 0) allSummarySentences.push(s.trim());
      }
      for (const { word, count } of analysis.topWords) {
        freq.set(word, (freq.get(word) ?? 0) + count);
      }
    }

    const mostFrequentWords = topN(freq, 10);

    let globalSummary = '';
    if (allSummarySentences.length > 0) {
      const k = Math.min(globalK, allSummarySentences.length);
      const { selected } = await this.summarizeCorpus(
        allSummarySentences,
        mostFrequentWords.map((w) => w.word),
        k,
      );
      globalSummary = selected.join(' ');
    }

    return {
      totalWords,
      totalLines,
      totalCharacters,
      mostFrequentWords,
      filesProcessed,
      globalSummary,
    };
  }

  /**
   * Core scoring helper shared by per-document and cross-document summaries.
   * Given a list of sentences and a pivot of salient words, compute
   * TextRank + MLP importances, combine them 50/50 on normalized scales,
   * and return the top-K sentences preserving their original order.
   */
  private async summarizeCorpus(
    sentences: string[],
    pivotWords: string[],
    k: number,
  ): Promise<{ selected: string[]; mlpScores: number[] }> {
    if (sentences.length === 0 || k <= 0) {
      return { selected: [], mlpScores: [] };
    }

    const { scores: rankScores } = await textRank(sentences);
    const featureRows = this.extractor.extract(sentences, pivotWords);
    const mlpScores = featureRows.map((row) => this.mlp.predict(row.features)[0]);

    const rankNorm = normalize(rankScores);
    const mlpNorm = normalize(mlpScores);
    const combined = rankNorm.map((v, i) => 0.5 * v + 0.5 * mlpNorm[i]);

    const selected = pickTopInOrder(sentences, combined, Math.min(k, sentences.length));
    return { selected, mlpScores };
  }
}

function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

function pickTopInOrder(sentences: string[], scores: number[], k: number): string[] {
  if (k <= 0 || sentences.length === 0) return [];
  const indexed = scores.map((s, i) => ({ i, s }));
  const topIndices = new Set(
    indexed.sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i),
  );
  return sentences.filter((_, i) => topIndices.has(i));
}
