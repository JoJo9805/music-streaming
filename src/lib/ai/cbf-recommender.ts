/**
 * CBF Recommender
 * ───────────────
 * Content-Based Filtering engine that ranks candidate tracks by cosine
 * similarity to a seed track's embedding vector.
 *
 * No external LLM is called. All computation is local.
 */

import {
  buildAllVectors,
  computeVectorFromTrack,
  cosine,
  getVector,
} from "./feature-vector-engine";
import type { ParsedIntent } from "./nlp-intent-parser";

// ──────────────────────────────────────────────────────────────────────────────
// Types (must match shapes used in route.ts)
// ──────────────────────────────────────────────────────────────────────────────

export interface CandidateTrack {
  id: string;
  sourceTrackId: string;
  title: string;
  artist: string;
  album: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  danceability: number;
  energy: number;
  trackGenre?: string;
  tempo?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  speechiness?: number;
  liveness?: number;
}

export interface ChatPlaylistItem {
  id: string;
  name: string;
  artist: string;
  album?: string;
  similarity: string;
}

export interface ChatPlaylistResult {
  seedFound: string;
  playlistName: string;
  playlist: ChatPlaylistItem[];
  notFound: string | null;
  matchedCount: number;
  requestedCount: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mood → target energy range map
// ──────────────────────────────────────────────────────────────────────────────

interface MoodProfile {
  energyMin: number;
  energyMax: number;
  danceMin?: number;
  valenceMin?: number;
  valenceMax?: number;
  energyBoostWeight: number; // multiplier applied to mood score
}

const MOOD_PROFILES: Record<string, MoodProfile> = {
  energetic: { energyMin: 0.65, energyMax: 1.0, danceMin: 0.5, energyBoostWeight: 1.5 },
  happy:     { energyMin: 0.5,  energyMax: 0.9, valenceMin: 0.55, energyBoostWeight: 1.2 },
  sad:       { energyMin: 0.0,  energyMax: 0.45, valenceMax: 0.45, energyBoostWeight: 1.3 },
  chill:     { energyMin: 0.2,  energyMax: 0.55, energyBoostWeight: 1.1 },
  romantic:  { energyMin: 0.25, energyMax: 0.65, valenceMin: 0.4, energyBoostWeight: 1.0 },
  intense:   { energyMin: 0.7,  energyMax: 1.0, energyBoostWeight: 1.4 },
  sleepy:    { energyMin: 0.0,  energyMax: 0.3, energyBoostWeight: 1.2 },
};

// ──────────────────────────────────────────────────────────────────────────────
// Normalise text for dedup
// ──────────────────────────────────────────────────────────────────────────────

function normaliseKey(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ──────────────────────────────────────────────────────────────────────────────
// Score helpers
// ──────────────────────────────────────────────────────────────────────────────

function moodScore(candidate: CandidateTrack, mood?: string | null): number {
  if (!mood) return 0;
  const profile = MOOD_PROFILES[mood];
  if (!profile) return 0;

  const energy = candidate.energy;
  const valence = candidate.valence ?? 0.5;
  const dance = candidate.danceability;

  // Energy range match: 0→1 based on how close to [min,max]
  const energyMid = (profile.energyMin + profile.energyMax) / 2;
  const energyRange = (profile.energyMax - profile.energyMin) / 2 || 0.1;
  const energyFit = Math.max(0, 1 - Math.abs(energy - energyMid) / energyRange);

  let score = energyFit * profile.energyBoostWeight;

  if (profile.valenceMin != null) score += Math.max(0, valence - profile.valenceMin);
  if (profile.valenceMax != null) score += Math.max(0, profile.valenceMax - valence);
  if (profile.danceMin != null && dance >= profile.danceMin) score += 0.2;

  return score / (profile.energyBoostWeight + 1.5); // normalise to ~0-1
}

// ──────────────────────────────────────────────────────────────────────────────
// Build similarity reason string
// ──────────────────────────────────────────────────────────────────────────────

function buildReason(
  cosineScore: number,
  candidate: CandidateTrack,
  seed: CandidateTrack | null,
  mood?: string | null,
): string {
  const parts: string[] = [`cosine: ${(cosineScore * 100).toFixed(1)}%`];

  if (seed) {
    const primarySeedArtist = seed.artist.split(";")[0]?.trim().toLowerCase();
    const primaryCandArtist = candidate.artist.split(";")[0]?.trim().toLowerCase();
    if (primarySeedArtist && primaryCandArtist && primarySeedArtist === primaryCandArtist) {
      parts.push("same artist");
    }
    const energyDiff = Math.abs(seed.energy - candidate.energy);
    if (energyDiff < 0.08) parts.push(`energy≈${candidate.energy.toFixed(2)}`);
    if (seed.trackGenre && seed.trackGenre === candidate.trackGenre) parts.push(`genre: ${seed.trackGenre}`);
  }

  if (mood) parts.push(`mood: ${mood}`);

  return parts.join("; ");
}

// ──────────────────────────────────────────────────────────────────────────────
// Core ranking
// ──────────────────────────────────────────────────────────────────────────────

interface RankOptions {
  topK: number;
  mood?: string | null;
  moodWeight?: number; // 0-1, how much mood score contributes alongside cosine
}

function rankByCosine(
  seedVector: Float32Array,
  seed: CandidateTrack | null,
  candidates: CandidateTrack[],
  opts: RankOptions,
): ChatPlaylistItem[] {
  const { topK, mood, moodWeight = 0.25 } = opts;
  const excludeId = seed?.id;
  const seenTitleArtist = new Set<string>();
  const seenId = new Set<string>();

  const scored = candidates
    .filter((c) => c.id !== excludeId)
    .map((c) => {
      // Get vector from cache or compute on-the-fly
      const vec = getVector(c.sourceTrackId) ?? computeVectorFromTrack({
        trackId: c.sourceTrackId,
        trackName: c.title,
        artists: c.artist,
        popularity: c.popularity,
        durationMs: c.durationMs,
        explicit: c.explicit,
        danceability: c.danceability,
        energy: c.energy,
        valence: c.valence,
        tempo: c.tempo,
        trackGenre: c.trackGenre,
      });

      const cosineSim = cosine(seedVector, vec);

      // Heuristic boosts
      let boost = 0;
      if (seed) {
        const sa = seed.artist.split(";")[0]?.trim().toLowerCase();
        const ca = c.artist.split(";")[0]?.trim().toLowerCase();
        if (sa && ca && sa === ca) boost += 0.07;
        if (seed.trackGenre && seed.trackGenre === c.trackGenre) boost += 0.05;
      }

      const mScore = moodWeight > 0 ? moodScore(c, mood) * moodWeight : 0;
      const finalScore = cosineSim * (1 - moodWeight) + mScore + boost;

      return { c, cosineSim, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const playlist: ChatPlaylistItem[] = [];
  for (const { c, cosineSim } of scored) {
    if (seenId.has(c.id)) continue;
    const key = `${normaliseKey(c.title)}::${normaliseKey(c.artist)}`;
    if (seenTitleArtist.has(key)) continue;

    seenId.add(c.id);
    seenTitleArtist.add(key);
    playlist.push({
      id: c.id,
      name: c.title,
      artist: c.artist,
      album: c.album,
      similarity: buildReason(cosineSim, c, seed, mood),
    });

    if (playlist.length >= topK) break;
  }

  return playlist;
}

// ──────────────────────────────────────────────────────────────────────────────
// Template reply generator
// ──────────────────────────────────────────────────────────────────────────────

function buildReply(
  intent: ParsedIntent,
  seed: CandidateTrack | null,
  count: number,
): string {
  if (intent.intent === "similar_song" && seed) {
    return (
      `Mình đã tìm được ${count} bài hát tương tự **${seed.title}** của **${seed.artist}**. ` +
      `Playlist được xây dựng dựa trên năng lượng (energy), vibe và các đặc trưng âm nhạc tương đồng 🎵`
    );
  }

  if (intent.intent === "mood_search") {
    const moodLabel = intent.mood ?? intent.genreHint ?? "phù hợp";
    return (
      `Mình đã chọn ${count} bài hát theo tâm trạng **${moodLabel}** cho bạn. ` +
      `Playlist ưu tiên những bài có năng lượng và vibe phù hợp nhất 🎶`
    );
  }

  return `Mình đã chuẩn bị ${count} bài hát cho bạn! Chúc bạn nghe nhạc vui 🎵`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export async function recommend(params: {
  userMessage: string;
  intent: ParsedIntent;
  seedTrack: CandidateTrack | null;
  candidates: CandidateTrack[];
  topK?: number;
}): Promise<{ reply: string; playlistResult: ChatPlaylistResult }> {
  const { intent, seedTrack, candidates, topK = intent.count ?? 20 } = params;
  const safeTopK = Math.max(topK, 20);

  // Ensure vectors are built (lazy init on first request)
  await buildAllVectors();

  // ── Determine seed vector ─────────────────────────────────────────────────
  let seedVector: Float32Array;

  if (seedTrack) {
    const fromCache = getVector(seedTrack.sourceTrackId);
    if (fromCache) {
      seedVector = fromCache;
    } else {
      seedVector = computeVectorFromTrack({
        trackId: seedTrack.sourceTrackId,
        trackName: seedTrack.title,
        artists: seedTrack.artist,
        popularity: seedTrack.popularity,
        durationMs: seedTrack.durationMs,
        explicit: seedTrack.explicit,
        danceability: seedTrack.danceability,
        energy: seedTrack.energy,
        valence: seedTrack.valence,
        tempo: seedTrack.tempo,
        trackGenre: seedTrack.trackGenre,
      });
    }
  } else {
    // No seed: create a synthetic "mood" vector based on intent
    const mood = intent.mood;
    const profile = mood ? MOOD_PROFILES[mood] : null;
    const targetEnergy = profile
      ? (profile.energyMin + profile.energyMax) / 2
      : 0.6;
    seedVector = computeVectorFromTrack({
      trackId: "__synthetic__",
      trackName: intent.mood ?? intent.genreHint ?? "music",
      artists: "",
      popularity: 60,
      durationMs: 210_000,
      explicit: false,
      danceability: 0.6,
      energy: targetEnergy,
      valence: 0.5,
      tempo: 120,
      trackGenre: intent.genreHint ?? undefined,
    });
  }

  // ── Rank candidates ────────────────────────────────────────────────────────
  const moodWeight = intent.intent === "mood_search" ? 0.35 : 0.1;

  const playlist = rankByCosine(seedVector, seedTrack, candidates, {
    topK: safeTopK,
    mood: intent.mood,
    moodWeight,
  });

  // ── Build playlist name ────────────────────────────────────────────────────
  let playlistName: string;
  if (seedTrack) {
    playlistName = `Tương tự: ${seedTrack.title}`;
  } else if (intent.mood) {
    const moodLabels: Record<string, string> = {
      energetic: "Sôi Động", happy: "Vui Vẻ", sad: "Buồn",
      chill: "Chill", romantic: "Lãng Mạn", intense: "Mạnh Mẽ", sleepy: "Ngủ Ngon",
    };
    playlistName = `Tâm Trạng: ${moodLabels[intent.mood] ?? intent.mood}`;
  } else if (intent.genreHint) {
    playlistName = `Thể Loại: ${intent.genreHint.toUpperCase()}`;
  } else {
    playlistName = "Playlist của Bạn";
  }

  const seedFoundLabel = seedTrack
    ? `${seedTrack.title} – ${seedTrack.artist}`
    : playlistName;

  return {
    reply: buildReply(intent, seedTrack, playlist.length),
    playlistResult: {
      seedFound: seedFoundLabel,
      playlistName,
      playlist,
      notFound: null,
      matchedCount: playlist.length,
      requestedCount: safeTopK,
    },
  };
}
