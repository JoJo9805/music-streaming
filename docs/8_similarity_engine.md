# Tài Liệu: Thuật Toán Tính Độ Tương Đồng Bài Hát — AI Chatbot

> **File nguồn**: `src/app/api/chat/route.ts`  
> **Dự án**: MelodyMix Music Streaming

---

## 1. Tổng Quan Kiến Trúc

Frontend (`/chatbot`) gửi request tới `/api/chat?stream=true` và nhận dữ liệu qua **SSE (Server-Sent Events)**.

```
User: "tìm nhạc giống Shape of You"
    │
    ▼ POST /api/chat?stream=true
┌─────────────────────────────────────────────┐
│             Route Handler                    │
│                                             │
│  1. parseIntentWithGemini()                 │
│     → intent: similar_song | mood_search    │
│                                             │
│  2a. similar_song:                          │
│      findSeedTrack() → buildSimilarCandidates()
│                                             │
│  2b. mood_search:                           │
│      buildMoodCandidates()                  │
│                                             │
│  3. chooseRecommendationsWithGemini()       │
│     → Gemini chọn playlist từ candidates    │
└─────────────────────────────────────────────┘
    │
    ▼ SSE Stream
data: { type: "tool-result", result: { playlist } }
data: { type: "text-delta", delta: "..." }
data: [DONE]
```

---

## 2. Công Nghệ Sử Dụng

| Công nghệ | Package | Vai trò |
|---|---|---|
| **Next.js 16** | — | API Route, runtime nodejs |
| **Google Gemini / Gemma** | `@ai-sdk/google` | LLM — parse intent + curate playlist |
| **Vercel AI SDK v6** | `ai` | `generateObject`, `generateText` |
| **Zod** | `zod` | Schema validation cho Gemini output |
| **Prisma ORM** | `@prisma/client` | Query PostgreSQL |
| **Node.js fs** | `node:fs` | Đọc `data/dataset.csv` |
| **SSE** | Web Streams API | Streaming response theo thời gian thực |
| **TypeScript** | — | Toàn bộ codebase typed |

---

## 3. Model Fallback Chain

Hệ thống thử lần lượt 5 model, ưu tiên model có RPD cao nhất:

```
gemma-4-31b-it              (mode: text-json — parse raw text → JSON)
    │ thất bại
gemini-3.1-flash-lite       (mode: structured — generateObject trực tiếp)
    │ thất bại
gemini-2.5-flash-lite       (mode: structured)
    │ thất bại
gemini-3-flash-preview      (mode: structured)
    │ thất bại
gemini-2.5-flash            (mode: structured)
    │ thất bại
    └─► Throw error → friendlyErrorMessage() → SSE error event
```

**Hai mode hoạt động:**
- `text-json`: Dùng `generateText()`, parse JSON thủ công từ raw text (dành cho Gemma không hỗ trợ structured output tốt)
- `structured`: Dùng `generateObject()` với Zod schema, output đã được validate

---

## 4. Dữ Liệu Đặc Trưng Bài Hát

### 4.1 Nguồn Dữ Liệu

Hệ thống kết hợp **2 nguồn**:

| Nguồn | Nội dung |
|---|---|
| **PostgreSQL (qua Prisma)** | `trackName`, `artists`, `albumName`, `popularity`, `durationMs`, `explicit`, `danceability`, `energy` |
| **`data/dataset.csv`** | `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`, `tempo`, `trackGenre` |

### 4.2 Feature Vector (10+ Chiều)

```typescript
interface CandidateTrack {
  danceability:      number;   // [0, 1] — khả năng nhảy
  energy:            number;   // [0, 1] — năng lượng
  valence:           number;   // [0, 1] — cảm xúc tích cực
  tempo:             number;   // BPM — nhịp bài hát
  acousticness:      number;   // [0, 1] — mức acoustic
  instrumentalness:  number;   // [0, 1] — nhạc không lời
  speechiness:       number;   // [0, 1] — mức nói
  liveness:          number;   // [0, 1] — khả năng live
  popularity:        number;   // [0, 100] — độ nổi tiếng
  explicit:          boolean;  // nội dung 18+
  trackGenre:        string;   // thể loại từ CSV
}
```

### 4.3 CSV Index — Caching

```typescript
// Singleton promise — chỉ đọc file 1 lần, cache suốt lifetime server
let csvIndexPromise: Promise<CsvIndex> | null = null;

interface CsvIndex {
  byTrackId: Map<string, CsvExtra>;    // lookup O(1) theo trackId
  byGenre:   Map<string, CsvExtra[]>;  // group theo genre, sorted by popularity
  allRows:   CsvExtra[];               // toàn bộ rows cho mood scoring
}
```

---

## 5. Scoring Functions

### 5.1 `featureDistanceScore` — Dùng Cho Similar Song

Tính điểm khoảng cách đặc trưng audio giữa seed và candidate:

```typescript
function featureDistanceScore(seed: CandidateTrack, row: CsvExtra): number {
  const dance  = Math.abs(seed.danceability - row.danceability);
  const energy = Math.abs(seed.energy - row.energy);
  const valence = Math.abs((seed.valence ?? 0.5) - row.valence);
  const tempo  = Math.min(Math.abs((seed.tempo ?? 120) - row.tempo) / 180, 1);

  return row.popularity / 100   // +điểm nếu phổ biến
       - dance   * 0.35         // -điểm nếu danceability khác xa
       - energy  * 0.35         // -điểm nếu energy khác xa
       - valence * 0.20         // -điểm nếu valence khác xa
       - tempo   * 0.10;        // -điểm nếu tempo khác xa
}
```

**Trọng số**: `energy` và `dance` quan trọng nhất (35% mỗi chiều), `tempo` ít quan trọng nhất (10%).

### 5.2 `moodScore` — Dùng Cho Mood Search

Tính điểm phù hợp tâm trạng, công thức khác nhau theo từng mood:

```typescript
function moodScore(row: CsvExtra, mood?: string | null): number {
  const m = normalizeText(mood ?? "");

  // Sôi động / workout / party / gym
  if (/(soi dong|nang luong|quay|party|workout|gym|tap luyen)/.test(m)) {
    return row.energy       * 0.40
         + row.danceability * 0.30
         + Math.min(row.tempo / 180, 1) * 0.15
         + row.popularity / 100 * 0.15;
  }

  // Buồn / sad / tâm trạng / mưa
  if (/(buon|sad|suy|tam trang|mua)/.test(m)) {
    return (1 - row.energy)   * 0.30
         + (1 - row.valence)  * 0.35
         + row.acousticness   * 0.20
         + row.popularity / 100 * 0.15;
  }

  // Chill / thư giãn / học tập / study / focus
  if (/(chill|thu gian|nhe nhang|hoc|tap trung|study|focus)/.test(m)) {
    return (1 - Math.abs(row.energy - 0.35)) * 0.25
         + row.acousticness      * 0.25
         + (1 - row.speechiness) * 0.20
         + row.popularity / 100  * 0.30;
  }

  // Vui / happy / hạnh phúc / yêu đời
  if (/(vui|happy|hanh phuc|yeu doi)/.test(m)) {
    return row.valence      * 0.35
         + row.energy       * 0.25
         + row.danceability * 0.20
         + row.popularity / 100 * 0.20;
  }

  // Default — không nhận diện được mood
  return row.popularity / 100 * 0.45
       + row.energy       * 0.25
       + row.danceability * 0.20
       + row.valence      * 0.10;
}
```

---

## 6. Zod Schemas

### 6.1 `intentSchema` — Phân Tích Ý Định

```typescript
const intentSchema = z.object({
  intent:       z.enum(["similar_song", "mood_search", "general_chat"]),
  songTitle:    z.string().nullable().optional(),   // tên bài hát
  artistName:   z.string().nullable().optional(),   // tên nghệ sĩ
  mood:         z.string().nullable().optional(),   // tâm trạng
  languageHint: z.string().nullable().optional(),   // ngôn ngữ yêu cầu
  genreHint:    z.string().nullable().optional(),   // thể loại yêu cầu
  count:        z.number().int().min(20).max(50).default(20),
});
```

### 6.2 `recommendationSchema` — Kết Quả Curation

```typescript
const recommendationSchema = z.object({
  reply:        z.string().min(1),      // text trả lời người dùng
  playlistName: z.string().min(1),      // tên playlist
  recommendations: z.array(z.object({
    id:            z.string().optional(),           // DB id của track
    sourceTrackId: z.string().optional(),           // Spotify trackId
    title:         z.string().min(1),
    artist:        z.string().min(1),
    reason:        z.string().optional(),           // lý do chọn bài này
  })),
});
```

---

## 7. Candidate Building Pipeline

### 7.1 Similar Song Mode — `buildSimilarCandidates()`

```
Input: seed track (CandidateTrack), csvIndex
Output: max 260 CandidateTrack[], đã dedup

Bước 1 — Genre pool (từ CSV):
  csvIndex.byGenre[seed.trackGenre]
    → filter(trackId ≠ seed.sourceTrackId)
    → sort by featureDistanceScore(seed, row) DESC
    → top 360 rows
    → resolve thành DB records (findMany WHERE trackId IN [...])

Bước 2 — Same artist (từ DB):
  prisma.track.findMany({
    artists CONTAINS seed.artist.split(";")[0],
    ORDER BY popularity DESC,
    TAKE 60
  })

Bước 3 — Nearby audio (từ DB):
  prisma.track.findMany({
    energy       ∈ [seed.energy ± 0.25],
    danceability ∈ [seed.danceability ± 0.25],
    ORDER BY popularity DESC,
    TAKE 160
  })

Bước 4 — Popular buffer (từ DB):
  prisma.track.findMany({
    ORDER BY popularity DESC,
    TAKE 80
  })

Bước 5 — Dedup:
  Loại trùng theo id + normalize(title::artist)
  → Giới hạn 260 candidates
```

### 7.2 Mood Search Mode — `buildMoodCandidates()`

```
Input: intent (mood, genreHint), csvIndex
Output: max 260 CandidateTrack[], đã dedup

Bước 1 — Score toàn bộ CSV:
  csvIndex.allRows
    → sort by moodScore(row, mood ?? genreHint) DESC
    → top 420 rows
    → resolve thành DB records

Bước 2 — Nếu < 260 candidates: bổ sung từ DB:
  prisma.track.findMany({
    energy       >= 0.35,
    danceability >= 0.35,
    ORDER BY popularity DESC,
    TAKE 180
  })

Bước 3 — Dedup → giới hạn 260 candidates
```

---

## 8. Gemini Curation

### 8.1 Cách Hoạt Động

Sau khi build candidates, **toàn bộ 260 candidates** được serialize và gửi lên Gemini:

```typescript
chooseRecommendationsWithGemini({
  userMessage,   // câu hỏi gốc của người dùng
  intent,        // { intent, mood, languageHint, genreHint, count }
  seedTrack,     // track gốc (null nếu mood search)
  candidates,    // max 260 tracks với đầy đủ audio features
})
```

### 8.2 System Prompt

Gemini được hướng dẫn ưu tiên theo thứ tự:

1. **Ngôn ngữ** — cùng ngôn ngữ với seed hoặc ngôn ngữ người dùng yêu cầu
2. **Thể loại** — `trackGenre` kết hợp với kiến thức về artist/title/album
3. **Audio traits** — `danceability`, `energy`, `tempo`, `valence`, `acousticness`, `instrumentalness`, `speechiness`

> ⚠️ Gemini **chỉ được chọn từ danh sách candidates được cung cấp**, không được tự bịa bài hát. Mỗi recommendation phải kèm theo `id` đúng với candidate.

### 8.3 Matching Kết Quả

Sau khi nhận kết quả từ Gemini, hệ thống match ngược lại với DB:

```typescript
// Thứ tự ưu tiên match:
const matched =
  byId.get(rec.id)                   // 1. Match theo DB id (chính xác nhất)
  ?? bySourceId.get(rec.sourceTrackId) // 2. Match theo Spotify trackId
  ?? byTitleArtist.get(titleKey);      // 3. Match theo normalize(title::artist)
```

---

## 9. SSE Streaming Protocol

Server gửi các event theo thứ tự:

```
data: { "type": "start" }

data: { "type": "text-start", "id": "0" }

data: { "type": "text-delta", "id": "0",
        "delta": "Mình đang phân tích bài hát..." }

    [--- handleRecommendation() chạy async ---]

data: { "type": "text-delta", "id": "0",
        "delta": "<gemini reply text>" }

data: { "type": "tool-result", "result": {
          "seedFound": "Shape of You — Ed Sheeran",
          "playlistName": "...",
          "playlist": [...],
          "matchedCount": 20,
          "requestedCount": 20,
          "model": "gemini-2.5-flash"
        }}

data: { "type": "text-end", "id": "0" }

data: { "type": "finish", "finishReason": "stop" }

data: [DONE]
```

---

## 10. Luồng Xử Lý Đầy Đủ

```
POST /api/chat?stream=true
  Body: { messages: ChatMessage[] }
    │
    ├─► Validate: userMessage không rỗng
    │
    ├─► SSE: start + text-start + text-delta ("Đang phân tích...")
    │
    ├─► loadCsvIndex()                    ← singleton, cached
    │
    ├─► parseIntentWithGemini()           ← Gemini call #1
    │     → intentSchema
    │     → { intent, songTitle, artistName, mood, languageHint, genreHint, count }
    │
    ├─► intent === "general_chat"
    │     └─► generateObject(reply) → SSE text → DONE
    │
    ├─► intent === "similar_song"
    │     ├─► findSeedTrack(intent, csvIndex)
    │     │     → prisma.findFirst({ trackName+artist contains })
    │     │     → enrichTrack() bổ sung CSV data
    │     ├─► buildSimilarCandidates(seed, csvIndex)
    │     └─► chooseRecommendationsWithGemini()   ← Gemini call #2
    │
    └─► intent === "mood_search"
          ├─► buildMoodCandidates(intent, csvIndex)
          └─► chooseRecommendationsWithGemini()   ← Gemini call #2
    │
    ├─► buildPlaylistFromGemini() → match candidates → PlaylistResult
    │
    └─► SSE: text-delta (reply) + tool-result (playlist) + finish + [DONE]
```

---

## 11. Playlist Save Flow

```
User bấm "Lưu Playlist"
    │
    ├─► POST /api/playlists  { name: "Gợi ý tương tự Shape of You" }
    │   └─► Playlist created → { id }
    │
    ├─► FOR each track IN playlist:
    │     POST /api/playlists/{id}/tracks  { trackId }
    │
    └─► queryClient.invalidateQueries(["sidebar-playlists"])
        └─► Sidebar tự động refresh
```

---

## 12. Giới Hạn & Hướng Phát Triển

| Hạn chế hiện tại | Giải pháp đề xuất |
|---|---|
| 260 candidates load vào memory | `pgvector` + HNSW index, pre-filter phía DB |
| 2 lần gọi Gemini mỗi request (intent + curation) | Gộp thành 1 call với schema phức hợp |
| CSV load toàn bộ vào RAM (~30MB) | Redis cache hoặc vector DB |
| Gemma output không stable | Fine-tune prompt, thêm retry với JSON repair |
| Không có conversation memory | Lưu lịch sử chat vào DB / session |
| `trackGenre` từ CSV đôi khi sai | Bổ sung genre tagging từ MusicBrainz hoặc Discogs |
| SSE text-delta gửi 1 lần (không stream token) | Dùng `streamText()` thay `generateText()` |

---

*Cập nhật: 2026-05-15 — MelodyMix v1.0*
