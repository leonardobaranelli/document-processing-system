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
});
