/**
 * prisma/seed.ts
 *
 * Seeds the database from `data/dataset.csv` (Kaggle Spotify dataset).
 * Usage:  npx tsx prisma/seed.ts
 *
 * All five feature columns are pre-normalized to 0-1 for AI vector lookup:
 *   popularityNorm   = popularity / 100
 *   durationMsNorm   = clamp(durationMs / 600_000, 0, 1)   (10 min cap)
 *   explicitNorm     = explicit ? 1.0 : 0.0
 *   danceabilityNorm = danceability                          (already 0-1)
 *   energyNorm       = energy                                (already 0-1)
 *
 * Preview URLs and cover art are resolved via the Deezer API (free, no key).
 *
 * Phase 2: After tracks are seeded, unique artist names are extracted and
 * queried against Deezer's /search/artist endpoint to populate the Artist
 * table with images and metadata.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

interface CsvRow {
  track_id: string;
  artists: string;
  album_name: string;
  track_name: string;
  popularity: string;
  duration_ms: string;
  explicit: string;
  danceability: string;
  energy: string;
}

/** RFC 4180-aware CSV field splitter — handles quoted fields with commas. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row as unknown as CsvRow);
  }

  return rows;
}

function normalize(t: {
  popularity: number;
  durationMs: number;
  explicit: boolean;
  danceability: number;
  energy: number;
}) {
  return {
    popularityNorm: t.popularity / 100,
    durationMsNorm: Math.min(t.durationMs / 600_000, 1),
    explicitNorm: t.explicit ? 1.0 : 0.0,
    danceabilityNorm: t.danceability,
    energyNorm: t.energy,
  };
}

/** Resolve preview URL, cover art, and Deezer track ID from Deezer (free, no API key). */
async function resolveDeezer(
  trackName: string,
  artists: string,
): Promise<{ deezerId: string | null; previewUrl: string | null; coverUrl: string | null }> {
  try {
    const query = encodeURIComponent(`${artists} ${trackName}`);
    const res = await fetch(
      `https://api.deezer.com/search?q=${query}&limit=1`,
    );
    if (!res.ok) return { deezerId: null, previewUrl: null, coverUrl: null };

    const data = await res.json();
    const hit = data?.data?.[0];
    if (!hit) return { deezerId: null, previewUrl: null, coverUrl: null };

    return {
      deezerId: hit.id ? String(hit.id) : null,
      previewUrl: hit.preview || null,
      coverUrl: hit.album?.cover_medium || hit.album?.cover || null,
    };
  } catch {
    return { deezerId: null, previewUrl: null, coverUrl: null };
  }
}

/** Small delay to stay under Deezer's rate limits. */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract unique (albumName, artists) pairs from tracks and populate the Album table. */
async function seedAlbums() {
  const tracks = await prisma.track.findMany({
    select: { albumName: true, artists: true, coverUrl: true },
  });

  // Deduplicate by (name, artists) key; keep first coverUrl seen
  const albumMap = new Map<string, { name: string; artists: string; coverUrl: string | null }>();
  for (const t of tracks) {
    const name = t.albumName.trim();
    const artists = t.artists.trim();
    if (!name || !artists) continue;
    const key = name + "|||" + artists;
    if (!albumMap.has(key)) {
      albumMap.set(key, { name, artists, coverUrl: t.coverUrl });
    } else if (!albumMap.get(key)!.coverUrl && t.coverUrl) {
      albumMap.get(key)!.coverUrl = t.coverUrl;
    }
  }

  console.log(`\nFound ${albumMap.size} unique albums. Seeding...`);

  let seeded = 0;
  for (const [, album] of albumMap) {
    // Check if album already exists before inserting (no unique constraint)
    const existing = await prisma.album.findFirst({
      where: { name: album.name, artists: album.artists },
    });

    if (existing) {
      // Update coverUrl if missing
      if (!existing.coverUrl && album.coverUrl) {
        await prisma.album.update({
          where: { id: existing.id },
          data: { coverUrl: album.coverUrl },
        });
      }
    } else {
      await prisma.album.create({
        data: {
          name: album.name,
          artists: album.artists,
          coverUrl: album.coverUrl,
        },
      });
    }

    seeded++;
    if (seeded % 10 === 0) {
      process.stdout.write(`\r  Seeded ${seeded}/${albumMap.size} albums...`);
    }
  }

  console.log(`\nSeeded ${seeded} albums.`);
}

async function main() {
  const csvPath = path.resolve(__dirname, "../data/dataset.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(csvPath).slice(0, 200);
  console.log(`Parsed ${rows.length} rows from CSV. Seeding...`);

  let seeded = 0;
  let resolved = 0;
  const seenDeezerIds = new Set<string>();
  // Pre-populate with existing externalIds from DB to prevent collisions on re-seed
  const existingExternalIds = await prisma.track.findMany({
    where: { externalId: { not: null } },
    select: { externalId: true },
  });
  for (const r of existingExternalIds) {
    if (r.externalId) seenDeezerIds.add(r.externalId);
  }

  for (const row of rows) {
    if (!row.track_id || !row.track_name) continue;

    const popularity = parseInt(row.popularity, 10) || 0;
    const durationMs = parseInt(row.duration_ms, 10) || 0;
    const explicit = row.explicit === "True";
    const danceability = parseFloat(row.danceability) || 0;
    const energy = parseFloat(row.energy) || 0;

    const norms = normalize({ popularity, durationMs, explicit, danceability, energy });

    // Resolve preview URL, cover art, and Deezer track ID from Deezer
    const { deezerId, previewUrl, coverUrl } = await resolveDeezer(row.track_name, row.artists);
    if (previewUrl) resolved++;

    // Only use deezerId for externalId if it hasn't been seen before (unique constraint)
    const uniqueDeezerId = deezerId && !seenDeezerIds.has(deezerId) ? deezerId : null;
    if (uniqueDeezerId) seenDeezerIds.add(uniqueDeezerId);

    await prisma.track.upsert({
      where: { trackId: row.track_id },
      update: {
        ...norms,
        artists: row.artists,
        albumName: row.album_name,
        trackName: row.track_name,
        popularity,
        durationMs,
        explicit,
        danceability,
        energy,
        ...(uniqueDeezerId ? { externalId: uniqueDeezerId } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      },
      create: {
        trackId: row.track_id,
        artists: row.artists,
        albumName: row.album_name,
        trackName: row.track_name,
        popularity,
        durationMs,
        explicit,
        danceability,
        energy,
        ...(uniqueDeezerId ? { externalId: uniqueDeezerId } : {}),
        previewUrl,
        coverUrl,
        ...norms,
      },
    });
    seeded++;

    // Rate-limit: ~50ms between Deezer API calls
    if (seeded % 10 === 0) {
      process.stdout.write(`\r  Seeded ${seeded}/${rows.length}...`);
    }
    await sleep(50);
  }

  console.log(`\nSeeded ${seeded} tracks (${resolved} with Deezer previews).`);

  // ---- Phase 2: Seed Artist table from Deezer ----------------------------
  await seedArtists();

  // ---- Phase 3: Seed Album table from track data ------------------------
  await seedAlbums();
}

/** Search Deezer for an artist by name and return metadata. */
async function resolveDeezerArtist(
  name: string,
): Promise<{
  deezerArtistId: string | null;
  imageUrl: string | null;
  nbFan: number | null;
  nbAlbum: number | null;
}> {
  try {
    const query = encodeURIComponent(name);
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${query}&limit=1`,
    );
    if (!res.ok) return { deezerArtistId: null, imageUrl: null, nbFan: null, nbAlbum: null };

    const data = await res.json();
    const hit = data?.data?.[0];
    if (!hit) return { deezerArtistId: null, imageUrl: null, nbFan: null, nbAlbum: null };

    return {
      deezerArtistId: hit.id ? String(hit.id) : null,
      imageUrl: hit.picture_big || hit.picture_medium || hit.picture || null,
      nbFan: hit.nb_fan ?? null,
      nbAlbum: hit.nb_album ?? null,
    };
  } catch {
    return { deezerArtistId: null, imageUrl: null, nbFan: null, nbAlbum: null };
  }
}

/** Extract unique artist names from all seeded tracks and populate the Artist table. */
async function seedArtists() {
  const tracks = await prisma.track.findMany({ select: { artists: true } });

  const artistNames = new Set<string>();
  for (const t of tracks) {
    for (const name of t.artists.split(";")) {
      const trimmed = name.trim();
      if (trimmed) artistNames.add(trimmed);
    }
  }

  console.log(`\nFound ${artistNames.size} unique artists. Seeding artist metadata...`);

  let seeded = 0;
  const seenDeezerArtistIds = new Set<string>();
  // Pre-populate from DB to avoid unique constraint violations on re-seed
  const existingArtists = await prisma.artist.findMany({
    where: { deezerArtistId: { not: null } },
    select: { deezerArtistId: true },
  });
  for (const a of existingArtists) {
    if (a.deezerArtistId) seenDeezerArtistIds.add(a.deezerArtistId);
  }

  for (const name of artistNames) {
    const { deezerArtistId, imageUrl, nbFan, nbAlbum } =
      await resolveDeezerArtist(name);

    const uniqueDeezerId =
      deezerArtistId && !seenDeezerArtistIds.has(deezerArtistId)
        ? deezerArtistId
        : null;
    if (uniqueDeezerId) seenDeezerArtistIds.add(uniqueDeezerId);

    await prisma.artist.upsert({
      where: { name },
      update: {
        ...(imageUrl ? { imageUrl } : {}),
        ...(uniqueDeezerId ? { deezerArtistId: uniqueDeezerId } : {}),
        ...(nbFan != null ? { nbFan } : {}),
        ...(nbAlbum != null ? { nbAlbum } : {}),
      },
      create: {
        name,
        imageUrl,
        deezerArtistId: uniqueDeezerId,
        nbFan,
        nbAlbum,
      },
    });

    seeded++;
    if (seeded % 10 === 0) {
      process.stdout.write(`\r  Seeded ${seeded}/${artistNames.size} artists...`);
    }
    await sleep(50);
  }

  console.log(`\nSeeded ${seeded} artists.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
