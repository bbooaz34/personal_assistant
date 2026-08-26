/**
 * Vector layer.
 *
 * Deliberately an interface with a no-op default. The MVP is a small corpus
 * where BM25 plus metadata filtering already answers well, and shipping a
 * required embedding call would add latency, cost, and a provider dependency
 * to every turn for a marginal gain. Implement this against pgvector (or any
 * provider) when the corpus outgrows lexical matching — nothing else changes.
 */

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** In-memory vector store. Swap for pgvector without touching the retrieval engine. */
export class VectorIndex {
  private readonly vectors = new Map<string, number[]>();

  constructor(private readonly provider: EmbeddingProvider) {}

  async index(documents: Array<{ id: string; text: string }>): Promise<void> {
    if (documents.length === 0) return;
    const embeddings = await this.provider.embed(documents.map((d) => d.text));
    documents.forEach((doc, i) => {
      const vector = embeddings[i];
      if (vector) this.vectors.set(doc.id, vector);
    });
  }

  async search(query: string): Promise<Map<string, number>> {
    if (this.vectors.size === 0) return new Map();
    const [queryVector] = await this.provider.embed([query]);
    if (!queryVector) return new Map();

    const scores = new Map<string, number>();
    for (const [id, vector] of this.vectors) {
      // Clamp: negative cosine means "unrelated", and letting it go negative
      // would let one weak signal drag down an otherwise strong blend.
      scores.set(id, Math.max(0, cosineSimilarity(queryVector, vector)));
    }
    return scores;
  }
}
