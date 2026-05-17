/**
 * POST /api/chat
 * ──────────────
 * Music recommendation chatbot endpoint.
 *
 * Replaces all Gemini/Gemma calls with a local Content-Based Filtering engine:
 *   • NLP intent parsing  → src/lib/ai/nlp-intent-parser.ts
 *   • Feature vectors     → src/lib/ai/feature-vector-engine.ts
 *   • CBF ranking         → src/lib/ai/cbf-recommender.ts
 *
 * Request/Response shapes are IDENTICAL to the previous Gemini implementation
 * so the React 19 frontend and SSE client remain unchanged.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { parseIntent } from "@/lib/ai/nlp-intent-parser";
import type { ParsedIntent } from "@/lib/ai/nlp-intent-parser";
import { recommend } from "@/lib/ai/cbf-recommender";
import type { CandidateTrack, ChatPlaylistItem, ChatPlaylistResult } from "@/lib/ai/cbf-recommender";

export const maxDuration = 60;
export const runtime = "nodejs";

const MIN_RECOMMENDATIONS = 20;
const MAX_CANDIDATES = 260;
const LOCAL_MODEL_LABEL = "local-cbf";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type ChatRole = "user" | "assistant" | "system";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface CsvExtra {
  trackId: string;
  artists: string;
  albumName: string;
  trackName: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  danceability: number;
  energy: number;
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  tempo: number;
  trackGenre: string;
}

interface CsvIndex {
  byTrackId: Map<string, CsvExtra>;
  byGenre: Map<string, CsvExtra[]>;
  allRows: CsvExtra[];
}

interface DbTrack {
  id: string;
  trackId: string;
  trackName: string;
  artists: string;
  albumName: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  danceability: number;
  energy: number;
}

// CandidateTrack, PlaylistTrack, PlaylistResult imported from @/lib/ai/cbf-recommender

// ──────────────────────────────────────────────────────────────────────────────
// CSV index (cached, loaded once per Node process)
// ──────────────────────────────────────────────────────────────────────────────

let csvIndexPromise: Promise<CsvIndex> | null = null;

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

function toNumber(value: string | undefined, fallback = 0) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: string | undefined) {
  return value?.toLowerCase() === "true";
}

async function loadCsvIndex(): Promise<CsvIndex> {
  if (csvIndexPromise) return csvIndexPromise;

  csvIndexPromise = fs.promises
    .readFile(path.join(process.cwd(), "data", "dataset.csv"), "utf-8")
    .then((content) => {
      const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const header = splitCsvLine(lines[0] ?? "");
      const column = new Map(header.map((name, index) => [name, index]));
      const byTrackId = new Map<string, CsvExtra>();
      const byGenre = new Map<string, CsvExtra[]>();
      const allRows: CsvExtra[] = [];

      for (const line of lines.slice(1)) {
        const fields = splitCsvLine(line);
        const get = (name: string) => fields[column.get(name) ?? -1] ?? "";
        const trackId = get("track_id");
        if (!trackId) continue;

        const row: CsvExtra = {
          trackId,
          artists: get("artists"),
          albumName: get("album_name"),
          trackName: get("track_name"),
          popularity: Math.round(toNumber(get("popularity"))),
          durationMs: Math.round(toNumber(get("duration_ms"))),
          explicit: toBoolean(get("explicit")),
          danceability: toNumber(get("danceability")),
          energy: toNumber(get("energy")),
          speechiness: toNumber(get("speechiness")),
          acousticness: toNumber(get("acousticness")),
          instrumentalness: toNumber(get("instrumentalness")),
          liveness: toNumber(get("liveness")),
          valence: toNumber(get("valence")),
          tempo: toNumber(get("tempo")),
          trackGenre: get("track_genre"),
        };

        allRows.push(row);
        byTrackId.set(trackId, row);

        if (row.trackGenre) {
          const genreRows = byGenre.get(row.trackGenre) ?? [];
          genreRows.push(row);
          byGenre.set(row.trackGenre, genreRows);
        }
      }

      for (const rows of byGenre.values()) {
        rows.sort((a, b) => b.popularity - a.popularity);
      }

      return { byTrackId, byGenre, allRows };
    })
    .catch((error) => {
      console.warn("[Chat] Could not load data/dataset.csv for enrichment:", error);
      return { byTrackId: new Map(), byGenre: new Map(), allRows: [] };
    });

  return csvIndexPromise;
}

// ──────────────────────────────────────────────────────────────────────────────
// Track helpers
// ──────────────────────────────────────────────────────────────────────────────

const trackSelect = {
  id: true,
  trackId: true,
  trackName: true,
  artists: true,
  albumName: true,
  popularity: true,
  durationMs: true,
  explicit: true,
  danceability: true,
  energy: true,
} as const;

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function enrichTrack(track: DbTrack, csvIndex: CsvIndex): CandidateTrack {
  const extra = csvIndex.byTrackId.get(track.trackId);

  return {
    id: track.id,
    sourceTrackId: track.trackId,
    title: track.trackName,
    artist: track.artists,
    album: track.albumName,
    popularity: track.popularity,
    durationMs: track.durationMs,
    explicit: track.explicit,
    danceability: extra?.danceability ?? track.danceability,
    energy: extra?.energy ?? track.energy,
    trackGenre: extra?.trackGenre,
    tempo: extra?.tempo,
    valence: extra?.valence,
    acousticness: extra?.acousticness,
    instrumentalness: extra?.instrumentalness,
    speechiness: extra?.speechiness,
    liveness: extra?.liveness,
  };
}

function dedupeCandidates(candidates: CandidateTrack[], limit = MAX_CANDIDATES) {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const deduped: CandidateTrack[] = [];

  for (const candidate of candidates) {
    const nameKey = `${normalizeText(candidate.title)}::${normalizeText(candidate.artist)}`;
    if (seenIds.has(candidate.id) || seenNames.has(nameKey)) continue;
    seenIds.add(candidate.id);
    seenNames.add(nameKey);
    deduped.push(candidate);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

// ──────────────────────────────────────────────────────────────────────────────
// Intent parsing (local NLP, no LLM)
// ──────────────────────────────────────────────────────────────────────────────

// ParsedIntent imported from @/lib/ai/nlp-intent-parser (see top of file)

// ──────────────────────────────────────────────────────────────────────────────
// Seed track lookup
// ──────────────────────────────────────────────────────────────────────────────

async function findSeedTrack(
  intent: ParsedIntent,
  csvIndex: CsvIndex,
): Promise<CandidateTrack | null> {
  const songTitle = compactNullable(intent.songTitle);
  const artistName = compactNullable(intent.artistName);
  if (!songTitle) return null;

  const where = artistName
    ? {
        AND: [
          { trackName: { contains: songTitle, mode: "insensitive" as const } },
          { artists: { contains: artistName, mode: "insensitive" as const } },
        ],
      }
    : { trackName: { contains: songTitle, mode: "insensitive" as const } };

  let track = await prisma.track.findFirst({
    where,
    orderBy: { popularity: "desc" },
    select: trackSelect,
  });

  if (!track && artistName) {
    track = await prisma.track.findFirst({
      where: {
        OR: [
          { trackName: { contains: songTitle, mode: "insensitive" } },
          { artists: { contains: artistName, mode: "insensitive" } },
        ],
      },
      orderBy: { popularity: "desc" },
      select: trackSelect,
    });
  }

  return track ? enrichTrack(track, csvIndex) : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Feature distance score (for pre-ranking CSV candidates)
// ──────────────────────────────────────────────────────────────────────────────

function featureDistanceScore(seed: CandidateTrack, row: CsvExtra) {
  const dance = Math.abs(seed.danceability - row.danceability);
  const energy = Math.abs(seed.energy - row.energy);
  const valence = Math.abs((seed.valence ?? 0.5) - row.valence);
  const tempo = Math.min(Math.abs((seed.tempo ?? 120) - row.tempo) / 180, 1);
  return row.popularity / 100 - dance * 0.35 - energy * 0.35 - valence * 0.2 - tempo * 0.1;
}

function moodScore(row: CsvExtra, mood?: string | null) {
  const normalizedMood = normalizeText(mood ?? "");
  if (/(soi dong|nang luong|quay|party|workout|gym|tap luyen)/.test(normalizedMood)) {
    return row.energy * 0.4 + row.danceability * 0.3 + Math.min(row.tempo / 180, 1) * 0.15 + row.popularity / 100 * 0.15;
  }
  if (/(buon|sad|suy|tam trang|mua)/.test(normalizedMood)) {
    return (1 - row.energy) * 0.3 + (1 - row.valence) * 0.35 + row.acousticness * 0.2 + row.popularity / 100 * 0.15;
  }
  if (/(chill|thu gian|nhe nhang|hoc|tap trung|study|focus)/.test(normalizedMood)) {
    return (1 - Math.abs(row.energy - 0.35)) * 0.25 + row.acousticness * 0.25 + (1 - row.speechiness) * 0.2 + row.popularity / 100 * 0.3;
  }
  if (/(vui|happy|hanh phuc|yeu doi)/.test(normalizedMood)) {
    return row.valence * 0.35 + row.energy * 0.25 + row.danceability * 0.2 + row.popularity / 100 * 0.2;
  }
  return row.popularity / 100 * 0.45 + row.energy * 0.25 + row.danceability * 0.2 + row.valence * 0.1;
}

// ──────────────────────────────────────────────────────────────────────────────
// Candidate selection (targeted, no full-table scans)
// ──────────────────────────────────────────────────────────────────────────────

async function findTracksBySourceIds(
  sourceTrackIds: string[],
  csvIndex: CsvIndex,
): Promise<CandidateTrack[]> {
  if (sourceTrackIds.length === 0) return [];

  const tracks = await prisma.track.findMany({
    where: { trackId: { in: sourceTrackIds } },
    select: trackSelect,
  });
  const order = new Map(sourceTrackIds.map((trackId, index) => [trackId, index]));

  return tracks
    .sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0))
    .map((track) => enrichTrack(track, csvIndex));
}

async function buildSimilarCandidates(
  seed: CandidateTrack,
  csvIndex: CsvIndex,
): Promise<CandidateTrack[]> {
  const candidates: CandidateTrack[] = [];
  const seedGenre = seed.trackGenre;

  if (seedGenre) {
    const genreRows = (csvIndex.byGenre.get(seedGenre) ?? [])
      .filter((row) => row.trackId !== seed.sourceTrackId)
      .sort((a, b) => featureDistanceScore(seed, b) - featureDistanceScore(seed, a))
      .slice(0, 360);
    candidates.push(...await findTracksBySourceIds(genreRows.map((row) => row.trackId), csvIndex));
  }

  const primaryArtist = seed.artist.split(";")[0]?.trim();
  if (primaryArtist) {
    const sameArtist = await prisma.track.findMany({
      where: {
        id: { not: seed.id },
        artists: { contains: primaryArtist, mode: "insensitive" },
      },
      orderBy: { popularity: "desc" },
      take: 60,
      select: trackSelect,
    });
    candidates.push(...sameArtist.map((track) => enrichTrack(track, csvIndex)));
  }

  const nearbyAudio = await prisma.track.findMany({
    where: {
      id: { not: seed.id },
      energy: { gte: Math.max(seed.energy - 0.25, 0), lte: Math.min(seed.energy + 0.25, 1) },
      danceability: {
        gte: Math.max(seed.danceability - 0.25, 0),
        lte: Math.min(seed.danceability + 0.25, 1),
      },
    },
    orderBy: { popularity: "desc" },
    take: 160,
    select: trackSelect,
  });
  candidates.push(...nearbyAudio.map((track) => enrichTrack(track, csvIndex)));

  const popularTracks = await prisma.track.findMany({
    where: { id: { not: seed.id } },
    orderBy: { popularity: "desc" },
    take: 80,
    select: trackSelect,
  });
  candidates.push(...popularTracks.map((track) => enrichTrack(track, csvIndex)));

  return dedupeCandidates(candidates);
}

async function buildMoodCandidates(
  intent: ParsedIntent,
  csvIndex: CsvIndex,
): Promise<CandidateTrack[]> {
  const moodRows = [...csvIndex.allRows]
    .sort(
      (a, b) =>
        moodScore(b, intent.mood ?? intent.genreHint) -
        moodScore(a, intent.mood ?? intent.genreHint),
    )
    .slice(0, 420);

  const candidates = await findTracksBySourceIds(
    moodRows.map((row) => row.trackId),
    csvIndex,
  );

  if (candidates.length >= MAX_CANDIDATES) {
    return dedupeCandidates(candidates);
  }

  const dbCandidates = await prisma.track.findMany({
    where: {
      energy: { gte: 0.35 },
      danceability: { gte: 0.35 },
    },
    orderBy: { popularity: "desc" },
    take: 180,
    select: trackSelect,
  });

  return dedupeCandidates([
    ...candidates,
    ...dbCandidates.map((track) => enrichTrack(track, csvIndex)),
  ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Error helpers
// ──────────────────────────────────────────────────────────────────────────────

function friendlyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (/ECONNREFUSED|database|Prisma/i.test(message)) {
    return "Mình chưa kết nối được database nên chưa thể kiểm tra bài hát trong thư viện app. Hãy bật database rồi thử lại nhé.";
  }
  return "Có lỗi xảy ra khi tạo playlist. Vui lòng thử lại sau.";
}

// ──────────────────────────────────────────────────────────────────────────────
// General-chat friendly replies (no LLM)
// ──────────────────────────────────────────────────────────────────────────────

function generalChatReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (/hello|hi|chào|xin chào|hey/.test(lower)) {
    return "Xin chào! Mình là MelodyMix 🎵 Mình có thể giúp bạn tìm nhạc theo tâm trạng hoặc gợi ý bài hát tương tự bài bạn yêu thích. Bạn muốn nghe gì nào?";
  }
  if (/cảm ơn|cam on|thank/.test(lower)) {
    return "Không có gì! Chúc bạn nghe nhạc vui 🎶 Nếu muốn tìm thêm nhạc, cứ nhắn mình nhé!";
  }
  if (/bạn là ai|ban la ai|you are|who are you/.test(lower)) {
    return "Mình là MelodyMix, trợ lý âm nhạc của bạn 🎧 Mình có thể gợi ý playlist theo tâm trạng hoặc tìm nhạc tương tự bài bạn thích!";
  }
  return "Bạn muốn nghe nhạc gì? Hãy thử nhắn 'Tìm nhạc giống [tên bài]' hoặc 'Nhạc sôi động' để mình gợi ý playlist nhé 🎵";
}

// ──────────────────────────────────────────────────────────────────────────────
// Core recommendation handler (CBF, no Gemini)
// ──────────────────────────────────────────────────────────────────────────────

async function handleRecommendation(
  userMessage: string,
  messages: ChatMessage[],
): Promise<{ reply: string; playlistResult: ChatPlaylistResult | null; modelId: string }> {
  const csvIndex = await loadCsvIndex();

  // Parse intent locally (rule-based NLP)
  const intent = parseIntent(messages, userMessage);

  // Handle general chat without any playlist
  if (intent.intent === "general_chat") {
    return {
      reply: generalChatReply(userMessage),
      playlistResult: null,
      modelId: LOCAL_MODEL_LABEL,
    };
  }

  // Fetch seed and candidates
  let seedTrack: CandidateTrack | null = null;
  let candidates: CandidateTrack[] = [];

  if (intent.intent === "similar_song") {
    seedTrack = await findSeedTrack(intent, csvIndex);
    if (!seedTrack) {
      const label =
        [intent.songTitle, intent.artistName].filter(Boolean).join(" - ") || userMessage;
      return {
        reply: `Mình chưa tìm thấy "${label}" trong thư viện của app. Bạn thử nhập rõ hơn tên bài hát và nghệ sĩ nhé.`,
        playlistResult: null,
        modelId: LOCAL_MODEL_LABEL,
      };
    }
    candidates = await buildSimilarCandidates(seedTrack, csvIndex);
  } else {
    candidates = await buildMoodCandidates(intent, csvIndex);
  }

  if (candidates.length === 0) {
    return {
      reply: "Mình chưa tìm được đủ bài hát trong thư viện app để tạo playlist.",
      playlistResult: null,
      modelId: LOCAL_MODEL_LABEL,
    };
  }

  // Run CBF ranking
  const { reply, playlistResult } = await recommend({
    userMessage,
    intent,
    seedTrack,
    candidates,
    topK: intent.count,
  });

  let finalReply = reply;
  if (playlistResult.playlist.length < MIN_RECOMMENDATIONS && candidates.length >= MIN_RECOMMENDATIONS) {
    finalReply += `\n\nMình chỉ match được ${playlistResult.playlist.length} bài trong thư viện app.`;
  }

  return { reply: finalReply, playlistResult, modelId: LOCAL_MODEL_LABEL };
}

// ──────────────────────────────────────────────────────────────────────────────
// SSE helper
// ──────────────────────────────────────────────────────────────────────────────

function sendSse(
  controller: ReadableStreamDefaultController<Uint8Array>,
  data: object,
) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// ──────────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const isStream = searchParams.get("stream") !== "false";
    const body = await req.json();

    const messages: ChatMessage[] =
      Array.isArray(body.messages) && body.messages.length > 0
        ? body.messages
            .filter((m: Partial<ChatMessage>) => m.role && m.content)
            .map((m: ChatMessage) => ({ role: m.role, content: m.content }))
        : [{ role: "user", content: body.message?.trim() ?? "" }];

    const userMessage = messages[messages.length - 1]?.content?.trim();

    if (!userMessage) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // ── Non-streaming path ────────────────────────────────────────────────────
    if (!isStream) {
      try {
        const { reply, playlistResult, modelId } = await handleRecommendation(
          userMessage,
          messages,
        );
        return Response.json({
          reply,
          model: modelId,
          playlist: playlistResult?.playlist ?? null,
          playlistName: playlistResult?.playlistName ?? null,
          seedFound: playlistResult?.seedFound ?? null,
        });
      } catch (error) {
        return Response.json(
          { reply: friendlyErrorMessage(error), model: LOCAL_MODEL_LABEL, playlist: null },
          { status: 503 },
        );
      }
    }

    // ── Streaming (SSE) path ──────────────────────────────────────────────────
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          sendSse(controller, { type: "start" });
          sendSse(controller, { type: "text-start", id: "0" });
          sendSse(controller, {
            type: "text-delta",
            id: "0",
            delta: "Mình đang phân tích bài hát và chọn playlist từ thư viện app...\n\n",
          });

          const { reply, playlistResult, modelId } = await handleRecommendation(
            userMessage,
            messages,
          );

          sendSse(controller, { type: "text-delta", id: "0", delta: reply });

          if (playlistResult && playlistResult.playlist.length > 0) {
            sendSse(controller, {
              type: "tool-result",
              result: {
                seedFound: playlistResult.seedFound,
                playlistName: playlistResult.playlistName,
                playlist: playlistResult.playlist,
                matchedCount: playlistResult.matchedCount,
                requestedCount: playlistResult.requestedCount,
                model: modelId,
              },
            });
          }

          sendSse(controller, { type: "text-end", id: "0" });
          sendSse(controller, { type: "finish", finishReason: "stop" });
        } catch (error) {
          console.error("[Chat] CBF recommendation failed:", error);
          sendSse(controller, {
            type: "text-delta",
            id: "0",
            delta: friendlyErrorMessage(error),
          });
          sendSse(controller, { type: "error", error: friendlyErrorMessage(error) });
        } finally {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Chat] Fatal error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
