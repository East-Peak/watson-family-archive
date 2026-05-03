export interface EmbeddingEntry {
  id: string;
  name: string;
  embedding: number[];
  textLength: number;
}

export interface VectorStore {
  model: string;
  dimensions: number;
  entries: EmbeddingEntry[];
  createdAt: string;
}

export interface SearchResult {
  id: string;
  name: string;
  score: number;
}

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search the vector store for similar documents
export function searchVectorStore(
  queryEmbedding: number[],
  vectorStore: VectorStore,
  limit: number = 10,
  minScore: number = 0.3
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const entry of vectorStore.entries) {
    const score = cosineSimilarity(queryEmbedding, entry.embedding);

    if (score >= minScore) {
      results.push({
        id: entry.id,
        name: entry.name,
        score,
      });
    }
  }

  // Sort by score descending and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Cache the embedding pipeline
let embeddingPipeline: unknown = null;

// Create an embedding for a query using local model
export async function createQueryEmbedding(query: string): Promise<number[]> {
  // Dynamic import to avoid bundling issues
  const { pipeline } = await import('@xenova/transformers');

  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  const output = await (embeddingPipeline as (text: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>)(
    query,
    { pooling: 'mean', normalize: true }
  );

  return Array.from(output.data);
}

// Combined search function
export async function vectorSearch(
  query: string,
  vectorStore: VectorStore,
  limit: number = 10
): Promise<SearchResult[]> {
  const queryEmbedding = await createQueryEmbedding(query);
  return searchVectorStore(queryEmbedding, vectorStore, limit);
}
