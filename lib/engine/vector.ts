import type { Chunk } from "./types";

/**
 * Retrieval interface. The default implementation is a zero-dependency, in-process
 * sparse vector index (feature-hashed TF-IDF over code-aware tokens, cosine similarity).
 * Swap in a hosted vector DB by implementing this interface.
 */
export interface VectorStore {
  add(chunks: Chunk[]): void;
  search(query: string, k: number, filter?: (c: Chunk) => boolean): { chunk: Chunk; score: number }[];
  size(): number;
}

const DIM = 4096;

/** Splits identifiers (camelCase, snake_case, kebab) so "createBooking" matches "booking create". */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g) ?? []) {
    const lower = raw.toLowerCase();
    if (lower.length > 1 && lower.length < 40) out.push(lower);
    const parts = raw.split(/_|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
    if (parts.length > 1) for (const p of parts) if (p.length > 1) out.push(p.toLowerCase());
  }
  return out.filter((t) => !STOP.has(t));
}

const STOP = new Set(
  "the a an and or of to in is it for on with as be this that by are was from at if else return const let var function def class import export require new true false null undefined self none".split(" ")
);

function hash(t: string) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0) % DIM;
}

type Sparse = Map<number, number>;

export class HashedTfIdfStore implements VectorStore {
  private chunks: Chunk[] = [];
  private tf: Sparse[] = [];
  private df = new Float64Array(DIM);
  private vecs: Sparse[] = [];
  private dirty = true;

  add(chunks: Chunk[]) {
    for (const c of chunks) {
      const counts: Sparse = new Map();
      // Path tokens count too: "routes/bookings.js" is strong signal.
      for (const t of [...tokenize(c.path), ...tokenize(c.path), ...tokenize(c.text)]) {
        const h = hash(t);
        counts.set(h, (counts.get(h) ?? 0) + 1);
      }
      for (const h of counts.keys()) this.df[h]++;
      this.chunks.push(c);
      this.tf.push(counts);
    }
    this.dirty = true;
  }

  size() {
    return this.chunks.length;
  }

  private idf(h: number) {
    return Math.log(1 + this.chunks.length / (1 + this.df[h]));
  }

  private weigh(counts: Sparse): Sparse {
    const v: Sparse = new Map();
    let norm = 0;
    for (const [h, n] of counts) {
      const w = (1 + Math.log(n)) * this.idf(h);
      v.set(h, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [h, w] of v) v.set(h, w / norm);
    return v;
  }

  search(query: string, k: number, filter?: (c: Chunk) => boolean) {
    if (this.dirty) {
      this.vecs = this.tf.map((c) => this.weigh(c));
      this.dirty = false;
    }
    const counts: Sparse = new Map();
    for (const t of tokenize(query)) counts.set(hash(t), (counts.get(hash(t)) ?? 0) + 1);
    const q = this.weigh(counts);
    const scored: { chunk: Chunk; score: number }[] = [];
    this.vecs.forEach((v, i) => {
      if (filter && !filter(this.chunks[i])) return;
      let s = 0;
      for (const [h, w] of q) s += w * (v.get(h) ?? 0);
      if (s > 0) scored.push({ chunk: this.chunks[i], score: s });
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
