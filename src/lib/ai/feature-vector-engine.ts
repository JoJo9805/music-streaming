/**
 * Feature Vector Engine
 * ─────────────────────
 * Builds compact fixed-dimension embeddings for each track by combining:
 *   • numeric audio features  (energyNorm, danceabilityNorm, valence, tempo…)
 *   • text hash features      (TF-IDF hashing trick on title + artist + genre)
 * Then reduces dimensionality with a lightweight incremental PCA so cosine
 * comparisons are fast even for large candidate pools.
 *
 * All computation is pure TypeScript – no external ML library needed.
 */

import fs from "node:fs";
import path from "node:path";

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

const HASH_DIM = 128;        // TF-IDF hashing dimension
const AUDIO_WEIGHT = 0.65;   // weight for numeric audio part
const TEXT_WEIGHT = 0.35;    // weight for text hash part
const PCA_DIMS = 32;         // final reduced embedding dimension (lightweight)
const MAX_PCA_SAMPLE = 4000; // max tracks used to compute PCA basis (speed)

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface TrackInput {
  trackId: string;        // Spotify/dataset track_id
  trackName: string;
  artists: string;
  popularity: number;     // 0-100
  durationMs: number;
  explicit: boolean;
  danceability: number;   // 0-1 raw
  energy: number;         // 0-1 raw
  valence?: number;       // 0-1 (from CSV enrichment)
  tempo?: number;         // BPM
  trackGenre?: string;
  // pre-normalised variants (if available from DB)
  energyNorm?: number;
  danceabilityNorm?: number;
  popularityNorm?: number;
  durationMsNorm?: number;
  explicitNorm?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ──────────────────────────────────────────────────────────────────────────────

let vectorMap: Map<string, Float32Array> = new Map();
let pcaBasis: number[][] | null = null; // [PCA_DIMS][rawDim]
let pcaMean: number[] | null = null;
let buildPromise: Promise<void> | null = null;
let isReady = false;

// ──────────────────────────────────────────────────────────────────────────────
// Hashing helpers (MurmurHash3-inspired, pure TS)
// ──────────────────────────────────────────────────────────────────────────────

function murmur32(str: string, seed = 0): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    let k = str.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= str.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0; // unsigned
}

function tokenise(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Build a hashed TF vector (HASH_DIM dimensions). */
function hashTF(tokens: string[]): number[] {
  const vec = new Array<number>(HASH_DIM).fill(0);
  for (const token of tokens) {
    const idx = murmur32(token) % HASH_DIM;
    vec[idx] += 1;
  }
  // L2 normalise
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag > 0) for (let i = 0; i < HASH_DIM; i++) vec[i] /= mag;
  return vec;
}

// ──────────────────────────────────────────────────────────────────────────────
// Audio feature normalisation
// ──────────────────────────────────────────────────────────────────────────────

function buildAudioFeatures(t: TrackInput): number[] {
  const energyNorm = t.energyNorm ?? t.energy;
  const danceabilityNorm = t.danceabilityNorm ?? t.danceability;
  const popularityNorm = t.popularityNorm ?? t.popularity / 100;
  const durationMsNorm = t.durationMsNorm ?? Math.min(t.durationMs / 600_000, 1);
  const explicitNorm = t.explicitNorm ?? (t.explicit ? 1 : 0);
  const valence = t.valence ?? 0.5;
  const tempoNorm = t.tempo != null ? Math.min(t.tempo / 180, 1) : 0.5;

  return [energyNorm, danceabilityNorm, valence, tempoNorm, popularityNorm, durationMsNorm, explicitNorm];
}

// ──────────────────────────────────────────────────────────────────────────────
// Raw vector (audio + text, weighted)
// ──────────────────────────────────────────────────────────────────────────────

function buildRawVector(t: TrackInput): number[] {
  const audio = buildAudioFeatures(t).map((v) => v * AUDIO_WEIGHT);
  const tokens = tokenise(`${t.trackName} ${t.artists} ${t.trackGenre ?? ""}`);
  const text = hashTF(tokens).map((v) => v * TEXT_WEIGHT);
  return [...audio, ...text];
}

// ──────────────────────────────────────────────────────────────────────────────
// Lightweight PCA (power iteration / covariance)
// ──────────────────────────────────────────────────────────────────────────────

function colMean(matrix: number[][]): number[] {
  const n = matrix.length;
  const d = matrix[0].length;
  const mean = new Array<number>(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j++) mean[j] += row[j] / n;
  return mean;
}

function subtract(row: number[], mean: number[]): number[] {
  return row.map((v, i) => v - mean[i]);
}

function dotVec(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normaliseVec(v: number[]): number[] {
  const mag = Math.sqrt(dotVec(v, v));
  return mag > 1e-10 ? v.map((x) => x / mag) : v;
}

/**
 * Compute top-k principal components via power iteration.
 * Returns basis: k × d matrix (each row is a PC).
 */
function computePCA(data: number[][], k: number): { basis: number[][]; mean: number[] } {
  const mean = colMean(data);
  const centered = data.map((row) => subtract(row, mean));
  const d = data[0].length;
  const basis: number[][] = [];

  // Deflation method: extract one PC at a time
  let residuals = centered.map((r) => [...r]);
  for (let comp = 0; comp < k; comp++) {
    // Random initialisation
    let vec = Array.from({ length: d }, (_, i) => Math.sin(i + comp + 1));
    vec = normaliseVec(vec);

    // Power iteration (40 steps is enough for stable convergence)
    for (let iter = 0; iter < 40; iter++) {
      const newVec = new Array<number>(d).fill(0);
      for (const row of residuals) {
        const proj = dotVec(row, vec);
        for (let j = 0; j < d; j++) newVec[j] += proj * row[j];
      }
      vec = normaliseVec(newVec);
    }

    basis.push(vec);

    // Deflate: remove projection along this PC from residuals
    for (let ri = 0; ri < residuals.length; ri++) {
      const proj = dotVec(residuals[ri], vec);
      for (let j = 0; j < d; j++) residuals[ri][j] -= proj * vec[j];
    }
  }

  return { basis, mean };
}

/** Project a raw vector into PCA space → Float32Array. */
function project(raw: number[], mean: number[], basis: number[][]): Float32Array {
  const centered = subtract(raw, mean);
  const out = new Float32Array(basis.length);
  for (let i = 0; i < basis.length; i++) out[i] = dotVec(centered, basis[i]);
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// CSV loader (reuse same format as route.ts)
// ──────────────────────────────────────────────────────────────────────────────

interface CsvRow {
  trackId: string;
  trackName: string;
  artists: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  danceability: number;
  energy: number;
  valence: number;
  tempo: number;
  trackGenre: string;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { fields.push(current.trim()); current = ""; }
    else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function toNum(v: string | undefined, fb = 0): number {
  const n = parseFloat(v ?? "");
  return isFinite(n) ? n : fb;
}

async function loadCsvRows(): Promise<CsvRow[]> {
  try {
    const content = await fs.promises.readFile(
      path.join(process.cwd(), "data", "dataset.csv"),
      "utf-8",
    );
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const header = splitCsvLine(lines[0] ?? "");
    const col = new Map(header.map((name, idx) => [name, idx]));
    const rows: CsvRow[] = [];
    for (const line of lines.slice(1)) {
      const f = splitCsvLine(line);
      const get = (name: string) => f[col.get(name) ?? -1] ?? "";
      const trackId = get("track_id");
      if (!trackId) continue;
      rows.push({
        trackId,
        trackName: get("track_name"),
        artists: get("artists"),
        popularity: Math.round(toNum(get("popularity"))),
        durationMs: Math.round(toNum(get("duration_ms"))),
        explicit: get("explicit").toLowerCase() === "true",
        danceability: toNum(get("danceability")),
        energy: toNum(get("energy")),
        valence: toNum(get("valence"), 0.5),
        tempo: toNum(get("tempo"), 120),
        trackGenre: get("track_genre"),
      });
    }
    return rows;
  } catch {
    console.warn("[VectorEngine] Could not load dataset.csv – falling back to DB tracks only.");
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build PCA basis from CSV rows and populate the in-memory vector map.
 * Safe to call multiple times – only runs once unless forceRebuild=true.
 */
export async function buildAllVectors(opts: { forceRebuild?: boolean } = {}): Promise<void> {
  if (isReady && !opts.forceRebuild) return;
  if (buildPromise && !opts.forceRebuild) return buildPromise;

  buildPromise = (async () => {
    console.log("[VectorEngine] Building feature vectors…");
    const t0 = Date.now();

    const csvRows = await loadCsvRows();
    if (csvRows.length === 0) {
      console.warn("[VectorEngine] No CSV rows found – vectors will be empty.");
      isReady = true;
      return;
    }

    // Sample for PCA computation (avoid OOM on huge datasets)
    const sample = csvRows.length > MAX_PCA_SAMPLE
      ? csvRows.filter((_, i) => i % Math.ceil(csvRows.length / MAX_PCA_SAMPLE) === 0)
      : csvRows;

    const sampleVectors = sample.map((row) => buildRawVector({
      trackId: row.trackId,
      trackName: row.trackName,
      artists: row.artists,
      popularity: row.popularity,
      durationMs: row.durationMs,
      explicit: row.explicit,
      danceability: row.danceability,
      energy: row.energy,
      valence: row.valence,
      tempo: row.tempo,
      trackGenre: row.trackGenre,
    }));

    const dims = Math.min(PCA_DIMS, sampleVectors[0].length);
    const pca = computePCA(sampleVectors, dims);
    pcaBasis = pca.basis;
    pcaMean = pca.mean;

    // Build reduced vectors for all rows
    const newMap = new Map<string, Float32Array>();
    for (const row of csvRows) {
      const raw = buildRawVector({
        trackId: row.trackId,
        trackName: row.trackName,
        artists: row.artists,
        popularity: row.popularity,
        durationMs: row.durationMs,
        explicit: row.explicit,
        danceability: row.danceability,
        energy: row.energy,
        valence: row.valence,
        tempo: row.tempo,
        trackGenre: row.trackGenre,
      });
      newMap.set(row.trackId, project(raw, pcaMean, pcaBasis));
    }

    vectorMap = newMap;
    isReady = true;
    console.log(
      `[VectorEngine] Done. ${vectorMap.size} vectors built in ${Date.now() - t0}ms (PCA ${dims}d).`,
    );
  })();

  return buildPromise;
}

/**
 * Get the pre-computed embedding for a track by its dataset trackId.
 */
export function getVector(trackId: string): Float32Array | undefined {
  return vectorMap.get(trackId);
}

/**
 * Compute a vector on-the-fly for a candidate (fallback when not in map).
 */
export function computeVectorFromTrack(t: TrackInput): Float32Array {
  const raw = buildRawVector(t);
  if (pcaBasis && pcaMean) {
    return project(raw, pcaMean, pcaBasis);
  }
  // PCA not ready → return raw numeric features only
  return new Float32Array(buildAudioFeatures(t));
}

/**
 * Cosine similarity between two Float32Array vectors.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, magA = 0, magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 1e-10 ? dot / denom : 0;
}

export function isVectorEngineReady(): boolean {
  return isReady;
}

export function vectorCacheSize(): number {
  return vectorMap.size;
}
