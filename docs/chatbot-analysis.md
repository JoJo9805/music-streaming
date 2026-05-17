# Phân Tích Hệ Thống AI Chatbot — MelodyMix

## 1. Tổng Quan Kiến Trúc

MelodyMix có **hai hệ thống chatbot** hoạt động song song, phục vụ hai mục đích khác nhau:

| Route | Loại | Mục đích | Trạng thái |
|-------|------|----------|------------|
| `/api/chat` | AI-powered (Gemini + KNN) | Chatbot chính — NLP + gợi ý nhạc | **Active** |
| `/api/chatbot` | Rule-based (Regex + KNN) | Fallback — intent parsing thuần | Dự phòng |

Frontend (`/chatbot`) gọi `/api/chat?stream=true` và nhận dữ liệu qua **SSE (Server-Sent Events)** streaming.

```
┌──────────────────────────────────────────────────────────┐
│                    Người dùng                              │
│  "tìm nhạc giống Shape of You" / "nhạc chill"             │
└────────────┬─────────────────────────────────────────────┘
             │ POST /api/chat?stream=true
             ▼
┌──────────────────────────────────────────────────────────┐
│                  Route Handler (route.ts)                  │
│                                                           │
│  ┌─────────────────┐    ┌──────────────────────────────┐ │
│  │ searchPlaylist() │    │       callGemini()           │ │
│  │                  │    │                              │ │
│  │ 1. detectCategory│    │  4 models thử tuần tự:       │ │
│  │ 2. extractSong   │    │  gemini-2.5-flash           │ │
│  │ 3. KNN + Prisma  │    │  gemini-2.0-flash           │ │
│  │                  │    │  gemini-1.5-flash           │ │
│  │ → PlaylistResult │    │  gemini-2.0-flash-lite      │ │
│  └────────┬─────────┘    └───────────┬──────────────────┘ │
│           │                          │                     │
│           ▼                          ▼                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              SSE Stream (text/event-stream)          │  │
│  │  data: {"type":"start"}                             │  │
│  │  data: {"type":"tool-result","result":{playlist}}   │  │
│  │  data: {"type":"text-delta","delta":"..."}          │  │
│  │  data: [DONE]                                       │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
             │
             ▼ SSE events
┌──────────────────────────────────────────────────────────┐
│                Frontend (page.tsx)                         │
│                                                           │
│  ┌─────────────┐    ┌──────────────────────────────────┐ │
│  │ Chat Panel  │    │  Playlist Sidebar (w-80, xl:block)│ │
│  │             │    │                                   │ │
│  │ Bot: "Đây   │    │  ┌─────────────────────────────┐ │ │
│  │  là 50 bài  │    │  │ 1. Shape of You — Ed Sheeran│ │ │
│  │  tương tự   │    │  │    ▸ 98.5%                  │ │ │
│  │  ..."       │    │  │ 2. Cheap Thrills — Sia     │ │ │
│  │             │    │  │    ▸ 95.2%                  │ │ │
│  │             │    │  │ ...                         │ │ │
│  │             │    │  │ [Lưu Playlist vào thư viện] │ │ │
│  └─────────────┘    └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Thuật Toán — Recommendation Engine

### 2.1 KNN + Cosine Similarity trên 5 Chiều Đặc Trưng

Hệ thống sử dụng thuật toán **K-Nearest Neighbors (KNN)** kết hợp **Cosine Similarity** trên không gian 5 chiều để tìm bài hát tương tự hoặc phù hợp với tâm trạng.

#### Vector Đặc Trưng (Feature Vector)

Mỗi bài hát được biểu diễn dưới dạng vector 5 chiều đã chuẩn hóa (0–1):

```
F(track) = [energyNorm, danceabilityNorm, popularityNorm, durationMsNorm, explicitNorm]
```

| Chiều | Ý nghĩa | Nguồn |
|-------|---------|-------|
| `energyNorm` | Mức năng lượng (0 = calm, 1 = energetic) | Spotify API |
| `danceabilityNorm` | Khả năng nhảy (0 = không, 1 = rất dễ nhảy) | Spotify API |
| `popularityNorm` | Độ phổ biến (0 = ít người nghe, 1 = rất hot) | Spotify API |
| `durationMsNorm` | Thời lượng (0 = ngắn, 1 = dài) | Spotify API |
| `explicitNorm` | Nội dung explicit (0 = clean, 1 = explicit) | Spotify API |

#### Cosine Similarity

```
                    A · B
sim(A, B) = ────────────────────
              ||A|| × ||B||

Trong đó:
  A · B = Σ(Aᵢ × Bᵢ)           — dot product
  ||A|| = √Σ(Aᵢ²)               — magnitude
```

Công thức trả về giá trị `[-1, 1]`, càng gần 1 càng tương đồng. Hiển thị dưới dạng phần trăm (`sim × 100%`).

#### KNN Search

```
Input:  targetVector (5D), candidatePool (114,000 tracks), k (50)
Output: top-k tracks sorted by similarity desc

1. FOR each candidate IN candidatePool:
2.     similarity = cosineSimilarity(targetVector, candidate.vector)
3. END FOR
4. SORT candidates BY similarity DESC
5. RETURN first k candidates
```

**Độ phức tạp**: O(n × d) với n = 114,000 tracks, d = 5 → ~570,000 phép tính / request. Chạy trực tiếp trên PostgreSQL thông qua Prisma ORM.

### 2.2 Category / Mood Detection

Hệ thống định nghĩa 7 centroid đại diện cho các tâm trạng khác nhau:

| Tâm trạng | Keywords | Centroid Vector `[E, D, P, DUR, X]` |
|-----------|----------|--------------------------------------|
| Buồn / Sâu lắng | `sad`, `buồn`, `mưa` | `[0.175, 0.20, 0.25, 0.50, 0.0]` |
| Thư giãn / Chill | `chill`, `thư giãn`, `nhẹ nhàng` | `[0.30, 0.375, 0.40, 0.50, 0.0]` |
| Tập trung / Học tập | `study`, `học tập` | `[0.25, 0.30, 0.30, 0.50, 0.0]` |
| Lãng mạn | `romantic`, `tình yêu` | `[0.375, 0.475, 0.50, 0.50, 0.0]` |
| Vui vẻ | `happy`, `vui` | `[0.65, 0.675, 0.60, 0.50, 0.0]` |
| Tiệc tùng | `party`, `sôi động` | `[0.80, 0.80, 0.70, 0.50, 0.5]` |
| Tập luyện | `workout`, `năng lượng` | `[0.825, 0.75, 0.60, 0.50, 0.3]` |

Các centroid này được thiết kế thủ công dựa trên đặc trưng âm nhạc của từng thể loại:
- **Buồn**: energy thấp (0.175), danceability thấp (0.20)
- **Party**: energy cao (0.80), danceability cao (0.80), có explicit (0.50)
- **Workout**: energy rất cao (0.825), danceability cao (0.75)

### 2.3 Find Similar Songs Pipeline

```
Input:  "tìm nhạc giống Shape of You"
Output: Playlist 50 bài tương tự nhất

1. extractSongName("tìm nhạc giống Shape of You") → "Shape of You"
2. findSeedSong("Shape of You") → Prisma contains query → SeedTrack
3. getRecommendations(seed, 50):
   a. SELECT * FROM tracks WHERE NOT (name='Shape of You' AND artist='Ed Sheeran')
   b. Map 114,000 tracks → FeatureVector
   c. KNN + Cosine Similarity → top-50
4. Return PlaylistResult
```

---

## 3. Công Nghệ Sử Dụng

### 3.1 Backend

| Công nghệ | Vai trò | Chi tiết |
|-----------|---------|----------|
| **Next.js 16** | Framework | API Routes (`/api/chat`, `/api/chatbot`) |
| **Vercel AI SDK v6** | LLM Integration | `ai` package + `@ai-sdk/google` provider |
| **Google Gemini** | NLP Engine | 4 model fallback: `gemini-2.5-flash` (2000 RPM) → `gemini-2.0-flash` (2000 RPM) → `gemini-1.5-flash` (2000 RPM) → `gemini-2.0-flash-lite` (30 RPM) |
| **Prisma ORM** | Database | PostgreSQL query cho 114,000+ tracks |
| **SSE (Server-Sent Events)** | Streaming | `text/event-stream` — gửi text + playlist theo thời gian thực |
| **TypeScript** | Type Safety | Toàn bộ codebase typed |

### 3.2 Frontend

| Công nghệ | Vai trò |
|-----------|---------|
| **React 19** | UI Framework |
| **Next.js App Router** | Client Component (`"use client"`) |
| **TanStack React Query** | Cache & query invalidation cho sidebar playlists |
| **NextAuth.js v5** | Authentication (JWT + Google OAuth) |
| **Tailwind CSS 4** | Styling + Glassmorphism |
| **SSE Client** | `fetch()` + `ReadableStream` reader |
| **Zustand** | Player state (không dùng trực tiếp trong chatbot) |

### 3.3 Data Flow — SSE Streaming Protocol

Server gửi các event type sau qua SSE:

```typescript
// 1. Bắt đầu stream
{ type: "start" }

// 2. Playlist data (gửi ngay khi có kết quả KNN, trước cả text)
{ type: "tool-result", result: { seedFound, playlist } }

// 3. Text streaming từ Gemini hoặc fallback
{ type: "text-start", id: "0" }
{ type: "text-delta", id: "0", delta: "..." }
{ type: "text-end", id: "0" }

// 4. Kết thúc
{ type: "finish", finishReason: "stop" }

// 5. Stream end marker
data: [DONE]
```

Lưu ý: `text-delta` hiện gửi toàn bộ text trong một event (không phải streaming token-by-token) vì `generateText()` của AI SDK v6 không hỗ trợ streaming dễ dàng trong cùng một ReadableStream.

---

## 4. Chiến Lược Fallback

### 4.1 Model Fallback Chain

```
┌──────────────────────┐
│  Có API Key không?    │──No──▶ Dùng rule-based fallback ngay
└──────────┬───────────┘
           │ Yes
           ▼
┌──────────────────────┐     ┌──────────────────────┐
│ gemini-2.5-flash     │──✗──│ gemini-2.0-flash     │──✗── ...
│ (2000 RPM)           │     │ (2000 RPM)           │
└──────────────────────┘     └──────────────────────┘
           │                          │
           │ ✓                        │ ✓
           ▼                          ▼
    Dùng model này              Dùng model này

... ──✗──▶ gemini-1.5-flash ──✗──▶ gemini-2.0-flash-lite ──✗──▶ Fallback
```

### 4.2 Text Fallback

Khi **tất cả 4 model Gemini đều thất bại** (không có API key, hết quota, lỗi mạng), hệ thống tự động sinh text rule-based từ kết quả KNN:

- **Có playlist**: Format danh sách top-10 bài thành markdown + thông báo số lượng
- **Không tìm thấy**: Gợi ý người dùng thử lại với từ khóa khác hoặc dùng category search
- **Không có kết quả**: Hiển thị hướng dẫn sử dụng

### 4.3 Playlist Always Works

`searchPlaylist()` **không phụ thuộc vào Gemini API** — nó chạy trực tiếp trên Prisma + KNN. Dù API có hoạt động hay không, sidebar playlist vẫn hiển thị.

---

## 5. Intent Parsing — Regex Patterns

### Category Detection (`detectCategory`)

```regex
// Keyword matching (case-insensitive)
sad|buồn|mưa            → Buồn / Sâu lắng
chill|thư giãn|nhẹ nhàng → Thư giãn / Chill
study|học tập            → Tập trung / Học tập
happy|vui                → Vui vẻ
party|sôi động           → Tiệc tùng
workout|năng lượng       → Tập luyện
```

### Song Name Extraction (`extractSongName`)

5 pattern được thử tuần tự, ưu tiên match chính xác:

```regex
// Pattern 1: Quote + keyword (chính xác nhất)
/(?:giống|tương tự|like|similar to)\s+(?:bài|song)?\s*["']([^"']+)["']/i

// Pattern 2: Keyword + text không quote
/(?:giống|tương tự|like|similar to)\s+(?:bài|song)?\s+([A-Za-zÀ-ỹ0-9 ...]{1,50})/i

// Pattern 3: "bài 'X'" với quote
/(?:bài|ca khúc|song|track)\s+["']([^"']+)["']/i

// Pattern 4: Bất kỳ string trong ngoặc kép
/["']([^"']{2,50})["']/

// Pattern 5: "tìm X" / "kiếm X" / "nghe X"
/(?:tìm|kiếm|nghe)\s+(.+?)(?:\s+(?:bài|nhạc|cho|với))?\s*$/i
```

---

## 6. Recommendation Engine — Code Structure

```
src/lib/ai/recommendation.ts
├── findSeedSong(query: string) → SeedTrack | null
│   Tìm bài hát gốc trong DB bằng Prisma contains query
│   (tìm trong trackName + artists, order by popularity DESC)
│
└── getRecommendations(seed, count=50) → RecommendationResult[]
    Tìm top-K bài tương tự nhất với seed
    1. SELECT tất cả tracks trừ seed (NOT AND name+artist)
    2. Map → FeatureVector cho từng track
    3. Tính cosine similarity với seed.vector
    4. Sort DESC, slice top-K
    5. Format kết quả (id, name, artist, similarity%)
```

**Optimization note**: `getRecommendations` load **toàn bộ 114,000 tracks** vào memory để tính similarity. Trong production nên dùng:
- PostgreSQL `pgvector` extension với vector index (IVFFlat/HNSW)
- Pre-compute similarity matrix
- Batch processing với cursor-based pagination

---

## 7. Playlist Save Flow

```
User bấm "Lưu Playlist vào thư viện"
  │
  ├─► POST /api/playlists  { name: "Gợi ý tương tự Shape of You" }
  │   └─► Playlist created (id: "clx...")
  │
  ├─► FOR each track IN playlist.playlist:
  │     POST /api/playlists/{id}/tracks  { trackId: "..." }
  │     └─► PlaylistTrack created (position auto-increment)
  │
  └─► queryClient.invalidateQueries(["sidebar-playlists"])
      └─► Sidebar trái tự động refresh, hiển thị playlist mới
```

---

## 8. Hạn Chế & Hướng Phát Triển

| Hạn chế | Giải pháp đề xuất |
|---------|-------------------|
| KNN quét toàn bộ 114K tracks mỗi request | Dùng `pgvector` + HNSW index |
| Gemini không streaming token-by-token | Dùng `streamText()` thay `generateText()` |
| Centroid category được hardcode thủ công | Dùng K-Means clustering trên toàn bộ dataset |
| Regex intent parsing đơn giản | Dùng Gemini để phân tích ý định (khi API hoạt động) |
| Không có context / memory giữa các tin nhắn | Lưu lịch sử chat vào session hoặc DB |
| Gemma models không dùng được qua `@ai-sdk/google` | Cần `@ai-sdk/google-vertex` (Vertex AI) cho Gemma |

---

## 9. Biến Môi Trường

```bash
# .env
GOOGLE_GENERATIVE_AI_API_KEY="your-key-from-https://aistudio.google.com/apikey"
```

Không có key → chatbot vẫn hoạt động với KNN (playlist + rule-based text), chỉ thiếu phần NLP.

---

## 10. File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           ← AI-powered chatbot (Gemini + KNN + SSE)
│   │   └── chatbot/route.ts        ← Rule-based chatbot (regex + KNN, dự phòng)
│   └── chatbot/page.tsx            ← Frontend UI (SSE client + playlist sidebar)
├── lib/
│   └── ai/
│       └── recommendation.ts       ← KNN engine (findSeedSong, getRecommendations)
└── docs/
    └── chatbot-analysis.md         ← File này
```
