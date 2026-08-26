/**
 * Lexical scoring (BM25) over the knowledge corpus.
 *
 * Embeddings alone are a poor fit here: recruiters ask about named companies,
 * tools, and titles, and exact-term matching on a small corpus beats vector
 * similarity for precisely those. The vector layer complements this rather
 * than replacing it (design doc §15).
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'at', 'by', 'for', 'with',
  'about', 'to', 'from', 'in', 'on', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'his', 'her', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'how', 'can', 'could', 'would', 'should', 'me',
]);

const SUFFIXES = ['ings', 'ing', 'edly', 'ed', 'ies', 'es', 's', 'ly'];

/**
 * A light suffix stemmer.
 *
 * Without it, "where did he study?" misses a claim containing "studying",
 * which is not an edge case — it is how people ask questions. Full Porter
 * stemming would be overkill on a corpus this size; the goal is only to make
 * inflections of the same word collide.
 *
 * Latin-script only by construction: Hebrew words do not carry these endings,
 * so they pass through untouched.
 */
export function stem(token: string): string {
  let s = token;
  for (const suffix of SUFFIXES) {
    if (s.length > suffix.length + 2 && s.endsWith(suffix)) {
      s = s.slice(0, -suffix.length);
      break;
    }
  }
  // Collapse study/studying/studied onto one form.
  if (s.endsWith('y')) s = `${s.slice(0, -1)}i`;
  // Collapse manage/manages/managing likewise.
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

/**
 * Unicode-aware tokenizer. Hebrew is a first-class input language, so
 * splitting on ASCII word characters would silently drop half the corpus
 * (design doc §24).
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export interface LexicalDocument {
  id: string;
  tokens: string[];
}

const K1 = 1.4;
const B = 0.75;
/** Half-saturation point: a raw BM25 score of this maps to 0.5. */
const SATURATION = 1.5;

export class LexicalIndex {
  private readonly documentFrequency = new Map<string, number>();
  private readonly termFrequency = new Map<string, Map<string, number>>();
  private readonly lengths = new Map<string, number>();
  private averageLength = 0;

  constructor(documents: LexicalDocument[]) {
    for (const doc of documents) {
      const counts = new Map<string, number>();
      for (const token of doc.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      this.termFrequency.set(doc.id, counts);
      this.lengths.set(doc.id, doc.tokens.length);
      for (const term of counts.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
    }
    const total = [...this.lengths.values()].reduce((a, b) => a + b, 0);
    this.averageLength = this.lengths.size ? total / this.lengths.size : 0;
  }

  get size(): number {
    return this.lengths.size;
  }

  /** Inverse document frequency, defined for unseen terms too. */
  idf(term: string): number {
    const df = this.documentFrequency.get(term) ?? 0;
    return Math.log(1 + (this.lengths.size - df + 0.5) / (df + 0.5));
  }

  /** Raw BM25 score for one document against a tokenized query. */
  score(documentId: string, queryTokens: string[]): number {
    const counts = this.termFrequency.get(documentId);
    if (!counts) return 0;
    const length = this.lengths.get(documentId) ?? 0;
    let score = 0;

    for (const term of queryTokens) {
      const tf = counts.get(term);
      if (!tf) continue;
      const denominator = tf + K1 * (1 - B + (B * length) / (this.averageLength || 1));
      score += this.idf(term) * ((tf * (K1 + 1)) / denominator);
    }
    return score;
  }

  /**
   * Scores every document on an absolute 0–1 scale.
   *
   * Two properties matter here, and an earlier version of this got both wrong
   * by normalizing against the best score in the set:
   *
   *   - **Saturation, not max-normalization.** Dividing by the top score makes
   *     the best of a bad set look like a perfect match, so a question the
   *     corpus cannot answer still returns a confident-looking top hit. The
   *     agent must be able to tell that *nothing* matched (§28).
   *   - **IDF-mass coverage.** A document matching only the word "experience"
   *     in "does he have experience with Kubernetes?" has matched a tiny
   *     fraction of what was asked. Scaling by the share of the query's total
   *     IDF that was actually matched collapses those false positives, while
   *     leaving a genuine single-rare-term hit (like "fintech") strong.
   */
  scoreAll(queryTokens: string[]): Map<string, number> {
    const unique = [...new Set(queryTokens)];
    if (unique.length === 0) return new Map();

    const idfByTerm = new Map(unique.map((t) => [t, this.idf(t)]));
    const totalIdfMass = [...idfByTerm.values()].reduce((a, b) => a + b, 0);
    if (totalIdfMass === 0) return new Map();

    const scores = new Map<string, number>();
    for (const id of this.lengths.keys()) {
      const counts = this.termFrequency.get(id);
      if (!counts) continue;
      const length = this.lengths.get(id) ?? 0;

      let raw = 0;
      let matchedMass = 0;
      for (const term of unique) {
        const tf = counts.get(term);
        if (!tf) continue;
        const idf = idfByTerm.get(term) ?? 0;
        const denominator = tf + K1 * (1 - B + (B * length) / (this.averageLength || 1));
        raw += idf * ((tf * (K1 + 1)) / denominator);
        matchedMass += idf;
      }
      if (raw <= 0) continue;

      const saturated = raw / (raw + SATURATION);
      scores.set(id, saturated * (matchedMass / totalIdfMass));
    }
    return scores;
  }
}
