import { AiService } from './ai.service';

describe('AiService', () => {
  let svc: AiService;

  beforeAll(async () => {
    svc = new AiService();
    await svc.onModuleInit();
  });

  it('produces basic statistics for a sample document', () => {
    const text =
      'The quick brown fox jumps over the lazy dog.\n' +
      'Foxes are clever animals that live in many regions.\n' +
      'This system analyzes documents and extracts statistics.';
    const a = svc.analyzeDocument(text, { topWords: 5, summarySentences: 2 });

    expect(a.wordCount).toBeGreaterThan(10);
    expect(a.lineCount).toBe(3);
    expect(a.characterCount).toBe(text.length);
    expect(a.topWords.length).toBeGreaterThan(0);
    expect(a.summarySentences.length).toBeLessThanOrEqual(2);
    expect(a.summary.length).toBeGreaterThan(0);
  });

  it('returns zero counts for empty input without crashing', () => {
    const a = svc.analyzeDocument('', { topWords: 3, summarySentences: 2 });
    expect(a.wordCount).toBe(0);
    expect(a.lineCount).toBe(0);
    expect(a.summary).toBe('');
  });

  it('aggregates multiple document analyses', () => {
    const doc = svc.analyzeDocument('Alpha beta gamma. Gamma delta epsilon. Alpha gamma zeta.');
    const agg = svc.aggregate([
      { filename: 'a.txt', analysis: doc },
      { filename: 'b.txt', analysis: doc },
    ]);
    expect(agg.totalWords).toBe(doc.wordCount * 2);
    expect(agg.filesProcessed).toEqual(['a.txt', 'b.txt']);
    expect(agg.mostFrequentWords.length).toBeGreaterThan(0);
  });

  it('global summary is an extractive summary of the per-document summaries', () => {
    const a = svc.analyzeDocument(
      'Neural networks learn representations from data. ' +
        'Gradient descent adjusts weights to minimize a loss function. ' +
        'Regularization helps prevent overfitting in deep models.',
      { summarySentences: 2 },
    );
    const b = svc.analyzeDocument(
      'Databases store information in structured tables. ' +
        'Indexes speed up query execution at the cost of extra writes. ' +
        'Transactions ensure atomic and durable updates across sessions.',
      { summarySentences: 2 },
    );
    const c = svc.analyzeDocument(
      'Distributed systems rely on message passing between nodes. ' +
        'Consensus algorithms coordinate replicated state under partial failures. ' +
        'Latency and throughput trade-offs drive architectural decisions.',
      { summarySentences: 2 },
    );

    const agg = svc.aggregate(
      [
        { filename: 'a.txt', analysis: a },
        { filename: 'b.txt', analysis: b },
        { filename: 'c.txt', analysis: c },
      ],
      { globalSummarySentences: 3 },
    );

    expect(agg.globalSummary.length).toBeGreaterThan(0);

    const perDocSentences = new Set<string>([
      ...a.summarySentences,
      ...b.summarySentences,
      ...c.summarySentences,
    ]);
    // Every sentence in the global summary must come from the pool of
    // per-document summary sentences -- i.e. it is a true summary of summaries.
    for (const s of perDocSentences) {
      // sanity: pool is non-empty
      expect(s.length).toBeGreaterThan(0);
    }
    const globalSentences = agg.globalSummary
      .split(/(?<=[.!?])\s+/u)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const gs of globalSentences) {
      const fromPool = [...perDocSentences].some((p) => p.includes(gs) || gs.includes(p));
      expect(fromPool).toBe(true);
    }
  });

  it('global summary is empty when no documents have summary sentences', () => {
    const empty = svc.analyzeDocument('', { summarySentences: 2 });
    const agg = svc.aggregate([{ filename: 'empty.txt', analysis: empty }]);
    expect(agg.globalSummary).toBe('');
    expect(agg.filesProcessed).toEqual(['empty.txt']);
  });
});
