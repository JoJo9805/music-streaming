/**
 * scripts/rebuild-embeddings.ts
 * ──────────────────────────────
 * Admin script to force-rebuild the in-memory feature vector cache.
 *
 * Usage:
 *   npx tsx scripts/rebuild-embeddings.ts
 *   node --loader ts-node/esm scripts/rebuild-embeddings.ts
 *
 * Environment:
 *   DATABASE_URL must be set (loaded from .env automatically).
 *
 * What it does:
 *   1. Loads data/dataset.csv
 *   2. Computes TF-IDF hash vectors for each track
 *   3. Runs lightweight PCA to reduce to 32 dimensions
 *   4. Prints stats (vector count, build time, memory usage)
 *
 * This is useful to pre-warm the server or validate that vectors
 * are computed correctly after adding new tracks.
 */

import { config } from "dotenv";
config(); // Load .env

import { buildAllVectors, vectorCacheSize, isVectorEngineReady } from "../src/lib/ai/feature-vector-engine";

async function main() {
  console.log("=== MelodyMix – CBF Embedding Rebuild ===\n");

  const t0 = Date.now();

  await buildAllVectors({ forceRebuild: true });

  const elapsed = Date.now() - t0;
  const ready = isVectorEngineReady();
  const size = vectorCacheSize();

  const mem = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);

  console.log("\n── Results ──────────────────────────────");
  console.log(`  Ready:          ${ready}`);
  console.log(`  Vectors built:  ${size.toLocaleString()}`);
  console.log(`  Build time:     ${elapsed}ms`);
  console.log(`  Heap used:      ${heapMB} MB`);
  console.log("─────────────────────────────────────────\n");

  if (!ready || size === 0) {
    console.error("❌ Build failed or no vectors produced.");
    process.exit(1);
  }

  console.log("✅ Rebuild complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
