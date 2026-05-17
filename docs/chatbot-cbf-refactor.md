# Chatbot CBF Refactor – Architecture & Migration Guide

## Overview

This document describes the refactoring of the MelodyMix chatbot from a
Gemini/Gemma-powered recommendation system to a fully local
**Content-Based Filtering (CBF)** engine.

No external LLM is called for intent parsing or playlist curation.
All logic runs on the Next.js Node.js server.

---

## Architecture

```
POST /api/chat
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  src/app/api/chat/route.ts                          │
│                                                     │
│  1. Parse intent  ── nlp-intent-parser.ts           │
│  2. Fetch seed + candidates (DB + CSV index)        │
│  3. Rank candidates ── cbf-recommender.ts           │
│      └── uses feature-vector-engine.ts              │
│  4. Stream SSE or return JSON (same shape as before)│
└─────────────────────────────────────────────────────┘
```

### New Modules

| File | Responsibility |
|------|---------------|
| `src/lib/ai/nlp-intent-parser.ts` | Rule-based Vietnamese/English intent classification |
| `src/lib/ai/feature-vector-engine.ts` | TF-IDF hashing + PCA dimensionality reduction |
| `src/lib/ai/cbf-recommender.ts` | Cosine similarity ranking + playlist assembly |
| `scripts/rebuild-embeddings.ts` | Admin script to rebuild vector cache |

---

## NLP Intent Parser

**No LLM.** Pure regex + keyword maps.

### Intents

| Intent | Description | Triggers |
|--------|-------------|---------|
| `similar_song` | Find songs similar to a named track | "giống X", "như bài X", "similar to X" |
| `mood_search` | Find songs matching a mood/activity | "sôi động", "buồn", "chill", "gym", "study" |
| `general_chat` | Not a music request | "hello", "cảm ơn", "bạn là ai?" |

### Mood → Energy Mapping

| Mood Label | Energy Range | Notes |
|------------|-------------|-------|
| `energetic` | 0.65–1.0 | gym, party, workout |
| `happy` | 0.50–0.90 | vui, hạnh phúc |
| `sad` | 0.0–0.45 | buồn, tâm trạng |
| `chill` | 0.20–0.55 | học, study, relax |
| `romantic` | 0.25–0.65 | tình yêu |
| `intense` | 0.70–1.0 | rock, căng thẳng |
| `sleepy` | 0.0–0.30 | ngủ, lo-fi |

---

## Feature Vector Engine

### Vector Composition

```
raw_vector = [
  audio (7 dims × 0.65 weight):
    energyNorm, danceabilityNorm, valence, tempoNorm,
    popularityNorm, durationMsNorm, explicitNorm
  text (128 dims × 0.35 weight):
    hashing-TF on tokens of (trackName + artists + genre)
]
```

Total raw dimension: **7 + 128 = 135 dims**

### Dimensionality Reduction (PCA)

- Lightweight power-iteration PCA (pure TypeScript, no external library)
- Reduces to **32 dimensions** for fast cosine comparison
- PCA basis computed once at startup from up to 4,000 sampled tracks
- Stored in module-level `Map<string, Float32Array>`

### Lifecycle

```
Server start
    │
    ▼ (lazy, first recommendation request)
buildAllVectors()
    ├── loadCsvRows()    ← data/dataset.csv
    ├── computePCA()     ← power iteration, ~1-3s on 4k sample
    └── populate Map<trackId, Float32Array>
```

> **Cold start note:** On a serverless environment (Vercel), the vector map
> is rebuilt on each cold start (~2-4s). For production, consider persisting
> embeddings in PostgreSQL (see pgvector section below).

---

## CBF Recommender

### Scoring Formula

```
finalScore = cosine(seed, candidate) × (1 - moodWeight)
           + moodScore(candidate, mood) × moodWeight
           + sameArtistBoost (0.07)
           + sameGenreBoost  (0.05)
```

- `moodWeight` = 0.35 for `mood_search`, 0.10 for `similar_song`
- Deduplication by normalised `(title, artist)` key

### Similarity Reason String

Each playlist entry includes a `similarity` field like:

```
"cosine: 87.3%; energy≈0.78; same artist"
"cosine: 71.2%; genre: pop; mood: energetic"
```

---

## API Compatibility

The route handler (`POST /api/chat`) is **100% backward-compatible**:

### Non-streaming (`?stream=false`)
```json
{
  "reply": "Mình đã tìm được 20 bài hát tương tự…",
  "model": "local-cbf",
  "playlist": [{ "id": "…", "name": "…", "artist": "…", "album": "…", "similarity": "…" }],
  "playlistName": "Tương tự: Shape of You",
  "seedFound": "Shape of You – Ed Sheeran"
}
```

### Streaming SSE (`?stream=true`)
```
data: {"type":"start"}
data: {"type":"text-start","id":"0"}
data: {"type":"text-delta","id":"0","delta":"Mình đang phân tích…"}
data: {"type":"text-delta","id":"0","delta":"Mình đã tìm được…"}
data: {"type":"tool-result","result":{"seedFound":"…","playlistName":"…","playlist":[…],"matchedCount":20,"requestedCount":20,"model":"local-cbf"}}
data: {"type":"text-end","id":"0"}
data: {"type":"finish","finishReason":"stop"}
data: [DONE]
```

---

## How to Run

### Development

```bash
cd music-streaming-proj-main
npm install
npx prisma generate
npm run dev
```

### Test (non-streaming)

```bash
curl -X POST "http://localhost:3000/api/chat?stream=false" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Tìm nhạc giống Shape of You"}], "message":"Tìm nhạc giống Shape of You"}'
```

Expected: `playlist` array with ≥ 20 items, `model` = `"local-cbf"`.

### Test (streaming SSE)

```bash
curl -N -X POST "http://localhost:3000/api/chat?stream=true" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Nhạc sôi động"}]}'
```

### Rebuild embeddings (admin)

```bash
npx tsx scripts/rebuild-embeddings.ts
```

---

## pgvector (Optional – Production Scale)

For large-scale deployments, persist embeddings in PostgreSQL using the
`pgvector` extension to enable ANN (approximate nearest neighbour) search.

### 1. Enable extension (run as DB admin)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Add embedding column to Track table

```sql
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS embedding vector(32);
```

### 3. Create index

```sql
-- ivfflat (PostgreSQL 14+)
CREATE INDEX IF NOT EXISTS idx_track_embedding
  ON "Track" USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

-- OR hnsw (PostgreSQL 15+ / pgvector ≥ 0.5)
-- CREATE INDEX IF NOT EXISTS idx_track_embedding
--   ON "Track" USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
```

### 4. Write embeddings via Prisma raw

```typescript
import { prisma } from "@/lib/prisma";

// After buildAllVectors():
for (const [trackId, vec] of vectorMap) {
  const pgVec = `[${Array.from(vec).join(",")}]`;
  await prisma.$executeRaw`
    UPDATE "Track" SET embedding = ${pgVec}::vector
    WHERE "trackId" = ${trackId}
  `;
}
```

### 5. Query nearest neighbours

```typescript
const results = await prisma.$queryRaw<{ id: string; trackId: string }[]>`
  SELECT id, "trackId"
  FROM "Track"
  ORDER BY embedding <-> ${seedVecStr}::vector
  LIMIT 50
`;
```

> **Note:** Do NOT run these migrations automatically. Have your DB admin
> execute the SQL above after verifying the target environment.

---

## Performance Notes

| Operation | Frequency | Cost |
|-----------|-----------|------|
| PCA build (4k sample) | Once per cold start | ~2-4s |
| Intent parsing | Per request | <1ms |
| Candidate selection (DB) | Per request | ~50-150ms |
| Cosine ranking (260 candidates) | Per request | <5ms |
| Total recommendation latency | Per request | ~100-300ms |

---

## Revert Instructions

To revert to the Gemini implementation:

```bash
git checkout main -- src/app/api/chat/route.ts
```

The new modules (`nlp-intent-parser.ts`, `feature-vector-engine.ts`,
`cbf-recommender.ts`) do not affect any other feature and can be left in place
or deleted independently.
