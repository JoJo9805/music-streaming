# Backend Architecture & API Documentation

## 1. Overview

MelodyMix's backend is built entirely inside the Next.js App Router (`src/app/api/`).  
There is **no separate Express server** — every endpoint is a Route Handler (`route.ts`).

| Layer | Technology |
|-------|-----------|
| Runtime | Next.js 16 (App Router) |
| ORM | Prisma 6 + PostgreSQL |
| Auth | Auth.js v5 (NextAuth) — JWT strategy |
| Streaming | Deezer API preview proxy (free, no key) |

---

## 2. Database Schema (Prisma)

### Entity overview

| Model | Purpose |
|-------|---------|
| **User** | Listeners & artists (role enum) |
| **Account** / **Session** / **VerificationToken** | Auth.js adapter tables |
| **Track** | Kaggle dataset rows + normalized vector fields |
| **Album** | Lightweight album reference |
| **Playlist** | User-created playlists (PUBLIC / PRIVATE) |
| **PlaylistTrack** | Join table: playlist ↔ track with position |
| **UserFollows** | Self-referencing follower/following |
| **LibraryItem** | "Liked songs" — user ↔ track |
| **RecentPlay** | Play history for recommendations |

### Design decisions

1. **Artists as strings, not a table.** The Kaggle dataset stores artist names as comma-separated text. A full many-to-many `Artist ↔ Track` model adds complexity without benefit in V1 because we don't host artist profiles.

2. **User `role` enum (USER / ARTIST).** Keeps a single users table while allowing future artist-specific features (dashboard, analytics) behind a role check.

3. **Pre-normalized feature vector columns on Track.** Five `*Norm` Float fields (`popularityNorm`, `durationMsNorm`, `explicitNorm`, `danceabilityNorm`, `energyNorm`) are computed at seed/ingest time so the AI recommendation engine can read them directly without runtime normalization.

   | Field | Normalization |
   |-------|--------------|
   | `popularityNorm` | `popularity / 100` |
   | `durationMsNorm` | `clamp(durationMs / 600_000, 0, 1)` — 10 min cap |
   | `explicitNorm` | `explicit ? 1.0 : 0.0` |
   | `danceabilityNorm` | identity (already 0-1) |
   | `energyNorm` | identity (already 0-1) |

4. **No cloud storage for audio.** Audio is proxied from Deezer's free 30-second previews through `/api/tracks/[id]/stream`. No API key required.

### Indexes

- `Track`: `trackName`, `artists`, `albumName`, `popularity` — search & sort performance.
- `Playlist`: `userId`, `name`.
- `LibraryItem`: `userId`.
- `RecentPlay`: `(userId, playedAt DESC)` — efficient "recently played" queries.

---

## 3. Authentication

### Providers

| Provider | Type | Notes |
|----------|------|-------|
| **Credentials** | Email + password (bcrypt) | For the `/api/auth/register` flow |
| **Google OAuth** | Social login | Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |

### Session strategy

JWT-based sessions (no database session table needed for auth checks — the Session model exists for Auth.js adapter compatibility).

### Middleware

`src/middleware.ts` intercepts every `/api/*` request:

- **Public routes** (no auth): `/api/auth/**`, `GET /api/tracks`, `GET /api/tracks/:id`, `GET /api/search`.
- **Protected routes**: everything else requires a valid `authjs.session-token` cookie.
- Individual route handlers perform additional ownership checks (e.g., only the playlist owner can edit/delete).

---

## 4. API Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Create account. Body: `{ name, email, password }` → 201 |
| GET/POST | `/api/auth/[...nextauth]` | — | Auth.js handlers (login, callback, signout, etc.) |

### Tracks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tracks` | No | List tracks. Query: `page`, `limit`, `sort`, `artist`, `album` |
| GET | `/api/tracks/:id` | No | Single track detail |
| GET | `/api/tracks/:id/stream` | **Yes** | Proxy Deezer preview audio (supports HTTP Range / 206) |

### Playlists

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/playlists` | Optional | Public playlists + own playlists if authed |
| POST | `/api/playlists` | **Yes** | Create playlist. Body: `{ name, description?, privacy? }` |
| GET | `/api/playlists/:id` | Optional | Playlist detail + tracks (private = owner only) |
| PATCH | `/api/playlists/:id` | **Yes** | Update playlist (owner only) |
| DELETE | `/api/playlists/:id` | **Yes** | Delete playlist (owner only) |
| POST | `/api/playlists/:id/tracks` | **Yes** | Add track. Body: `{ trackId }` |
| DELETE | `/api/playlists/:id/tracks` | **Yes** | Remove track. Body: `{ trackId }` |

### Library (Liked Songs)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/library` | **Yes** | User's liked tracks (paginated) |
| POST | `/api/library` | **Yes** | Like a track. Body: `{ trackId }` |
| DELETE | `/api/library` | **Yes** | Unlike a track. Body: `{ trackId }` |

### Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/search?q=<query>&type=tracks\|playlists\|all` | No | Search tracks & public playlists |

### Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profile` | **Yes** | Current user profile + counts |
| PATCH | `/api/profile` | **Yes** | Update name / avatar |
| GET | `/api/profile/recent-plays` | **Yes** | Recent play history |

---

## 5. Streaming Architecture

```
Client  ──GET /api/tracks/:id/stream──►  Middleware (cookie check)
                                              │
                                              ▼
                                        Route Handler
                                        ├─ Verify session (auth())
                                        ├─ Resolve Track from DB
                                        ├─ If no previewUrl → call Deezer API
                                        ├─ Record RecentPlay
                                        └─ Proxy upstream audio
                                              │
                     ◄─── 200 / 206 ──────────┘
                     (Content-Type: audio/mpeg)
                     (Content-Range if Range requested)
```

### Seeking support

The handler forwards the client's `Range` header to Deezer and returns `206 Partial Content` with the correct `Content-Range`, enabling `<audio>` seeking.

### Security

1. Middleware rejects unauthenticated requests before the handler runs.
2. The handler double-checks via `auth()` (belt-and-suspenders).
3. The real Deezer preview URL is never exposed to the client.

---

## 6. Waveform Data (Recommendations)

For audio visualization, recommended approach for V1:

- Use the **Web Audio API** (`AudioContext.decodeAudioData`) on the client after streaming the preview. Extract PCM samples, downsample to ~100 bars, and cache the resulting array in `localStorage` keyed by `trackId`.
- For server-side persistence (V2), add a `waveform JSON` column to the Track model and compute it during data ingest via an `OfflineAudioContext` in a Node worker.

---

## 7. Environment Variables

See `.env.example` at the project root.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js signing secret (`npx auth secret`) |
| `AUTH_URL` | Yes | Canonical app URL |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `SPOTIFY_CLIENT_ID` | No | Spotify app client ID (legacy, not used for previews) |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify app client secret (legacy, not used for previews) |

> **Note:** Audio previews now use the **Deezer API** (free, no API key required). The Spotify credentials are retained for potential future use (e.g., metadata enrichment) but are not needed for streaming.

---

## 8. Setup & Migration Commands

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env
# → Fill in DATABASE_URL and AUTH_SECRET

# 3. Generate Prisma client
npx prisma generate

# 4. Create / apply migrations
npx prisma migrate dev --name init

# 5. Seed demo tracks
npx tsx prisma/seed.ts

# 6. Start dev server
npm run dev
```

### Handling CSV ingest (full Kaggle dataset)

Place the Kaggle `dataset.csv` in `data/dataset.csv` and extend `prisma/seed.ts` to parse it with PapaParse (already a project dependency). The `normalize()` helper in the seed file computes all five `*Norm` columns automatically.

### Multipart / form-data

Not needed for V1 (no file uploads). If track upload is added later, use a Next.js Route Handler with `request.formData()` and stream the file to Supabase Storage or Cloudinary via their SDK.
