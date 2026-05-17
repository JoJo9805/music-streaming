# MelodyMix

A hybrid music streaming web app built with Next.js, featuring AI-curated playlists, a glassmorphism UI, and 30-second track previews powered by the Deezer API.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL + Prisma 7
- **Auth:** Auth.js v5 (NextAuth) — Credentials + Google OAuth
- **Streaming:** Deezer API (free 30s previews, no key required)
- **Styling:** Tailwind CSS + Glassmorphism design system

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/melodymix"
AUTH_SECRET="generate-with: npx auth secret"
AUTH_URL="http://localhost:3000"

# Optional — Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Optional — Spotify (not needed for streaming, Deezer is used instead)
SPOTIFY_CLIENT_ID=""
SPOTIFY_CLIENT_SECRET=""
```

> **Note:** Audio previews use the **Deezer API** which is free and requires no API key. The Spotify credentials are optional and only retained for potential future metadata use.

### 3. Set up the database

```bash
# Generate the Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed tracks from the Kaggle dataset (resolves Deezer preview URLs + cover art)
npx tsx prisma/seed.ts
```

The seed script imports `data/dataset.csv` (50-row sample included). To use the full 114k-row Kaggle dataset, replace the file and re-run the seed.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register a new user |
| GET/POST | `/api/auth/[...nextauth]` | — | Auth.js handlers |
| GET | `/api/tracks` | No | List tracks (paginated, filterable) |
| GET | `/api/tracks/:id` | No | Track detail |
| GET | `/api/tracks/:id/stream` | **Yes** | Stream 30s preview (Range/206 support) |
| GET | `/api/playlists` | Optional | Public playlists |
| POST | `/api/playlists` | **Yes** | Create playlist |
| GET | `/api/playlists/:id` | Optional | Playlist detail + tracks |
| PATCH | `/api/playlists/:id` | **Yes** | Update playlist |
| DELETE | `/api/playlists/:id` | **Yes** | Delete playlist |
| POST | `/api/playlists/:id/tracks` | **Yes** | Add track to playlist |
| DELETE | `/api/playlists/:id/tracks` | **Yes** | Remove track from playlist |
| GET | `/api/library` | **Yes** | Liked tracks |
| POST | `/api/library` | **Yes** | Like a track |
| DELETE | `/api/library` | **Yes** | Unlike a track |
| GET | `/api/search?q=` | No | Search tracks & playlists |
| GET | `/api/profile` | **Yes** | User profile |
| PATCH | `/api/profile` | **Yes** | Update profile |
| GET | `/api/profile/recent-plays` | **Yes** | Recent play history |

## Project Structure

```
src/
├── app/
│   ├── api/           # Route handlers (auth, tracks, playlists, library, search, profile)
│   ├── layout.tsx     # Root layout (Sidebar + BottomPlayer)
│   └── page.tsx       # Home page
├── components/
│   ├── ui/            # Reusable components (Button, GlassWindow, Typography)
│   └── layout/        # Layout components (Sidebar, BottomPlayer)
├── lib/
│   ├── auth.ts        # Auth.js configuration
│   └── prisma.ts      # Prisma client singleton
└── generated/         # Prisma generated client (gitignored)

prisma/
├── schema.prisma      # Database schema (10 models)
├── seed.ts            # CSV importer + Deezer resolver
└── migrations/        # Migration files

data/
└── dataset.csv        # Kaggle Spotify dataset (50-row sample)

docs/
└── 6_backend_architecture.md  # Full architecture documentation
```

## Architecture

See [`docs/6_backend_architecture.md`](docs/6_backend_architecture.md) for detailed documentation on the database schema, API design, streaming architecture, and security model.

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```
