import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type FeatureVector = [number, number, number, number, number];

type CategoryInfo = {
  centroid: FeatureVector;
  label: string;
};

const CATEGORY_MAP: Record<string, CategoryInfo> = {
  sad: { centroid: [0.175, 0.2, 0.25, 0.5, 0.0], label: "buồn / sâu lắng" },
  chill: { centroid: [0.3, 0.375, 0.4, 0.5, 0.0], label: "thư giãn / chill" },
  study: { centroid: [0.25, 0.3, 0.3, 0.5, 0.0], label: "tập trung / học tập" },
  romantic: { centroid: [0.375, 0.475, 0.5, 0.5, 0.0], label: "lãng mạn" },
  happy: { centroid: [0.65, 0.675, 0.6, 0.5, 0.0], label: "vui vẻ / hạnh phúc" },
  party: { centroid: [0.8, 0.8, 0.7, 0.5, 0.5], label: "tiệc tùng / sôi động" },
  workout: { centroid: [0.825, 0.75, 0.6, 0.5, 0.3], label: "tập luyện / năng lượng" },
};

function parseCategory(text: string): CategoryInfo | null {
  const lower = text.toLowerCase();
  for (const [key, info] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return info;
  }
  if (/(năng lượng|sôi động|bùng nổ)/.test(lower)) return CATEGORY_MAP.workout;
  if (/(thư giãn|nhẹ nhàng|êm dịu)/.test(lower)) return CATEGORY_MAP.chill;
  if (/(buồn|tâm trạng|mưa)/.test(lower)) return CATEGORY_MAP.sad;
  return null;
}

function toVector(t: { energyNorm: number; danceabilityNorm: number; popularityNorm: number; durationMsNorm: number; explicitNorm: number }): FeatureVector {
  return [t.energyNorm, t.danceabilityNorm, t.popularityNorm, t.durationMsNorm, t.explicitNorm];
}

function dotProduct(a: FeatureVector, b: FeatureVector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] + a[4] * b[4];
}

function magnitude(v: FeatureVector): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3] + v[4] * v[4]);
}

function cosineSimilarity(a: FeatureVector, b: FeatureVector): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

function knnSearch(
  target: FeatureVector,
  candidates: { trackName: string; artists: string; albumName: string; vector: FeatureVector }[],
  k: number
) {
  return candidates
    .map((c) => ({ ...c, similarity: cosineSimilarity(target, c.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

function parseSearchTerms(text: string): string | null {
  const patterns = [
    /(?:tìm|kiếm|bài hát|track|bản nhạc)\s+(?:về\s+)?(.+?)(?:\s+(?:cho|với|theo|kiểu|style))?\s*$/i,
    /(?:search|find|look.?up)\s+(?:for\s+)?(.+)/i,
    /(?:nghe|bài)\s+(.+)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function parseSimilarSong(text: string): { songName: string; count: number } | null {
  const patterns = [
    /(?:tương\s*tự|giống|tìm\s+cho\s+(?:tôi|tớ?|mình)\s+)?\s*(?:bài(?:\s+hát)?|nhạc\s+)?(?:tương\s*tự|giống)\s+(?:bài(?:\s+hát)?|nhạc\s+)?(.+?)(?:\s*$)/i,
    /similar\s+(?:to|songs?\s+(?:like|to))\s+(.+)/i,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1]?.trim()) {
      const songName = match[1].trim();
      const countMatch = text.match(/(\d+)/);
      const count = countMatch ? Math.min(50, Math.max(3, parseInt(countMatch[1]))) : 50;
      return { songName, count };
    }
  }

  return null;
}

function formatTrackList(tracks: { trackName: string; artists: string; albumName?: string; popularity?: number }[]): string {
  if (!tracks.length) return "Không tìm thấy bài hát nào phù hợp.";
  const items = tracks.map(
    (t, i) => `${i + 1}. **${t.trackName}** — ${t.artists}${t.albumName ? ` (${t.albumName})` : ""}`
  );
  return items.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const message: string = body?.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const lower = message.toLowerCase();

    // Intent: help
    if (/^(help|giúp|hướng dẫn|what can you do|trợ giúp)/i.test(lower)) {
      return NextResponse.json({
        reply: `Mình là trợ lý âm nhạc của MelodyMix. Bạn có thể hỏi mình:

🎵 **Tìm nhạc**: "tìm nhạc buồn", "bài hát về tình yêu", "search jazz"
🎧 **Gợi ý theo tâm trạng**: "nhạc chill", "workout", "sad songs", "nhạc vui"
📋 **Tạo playlist**: "tạo playlist 10 bài chill", "playlist nhạc party"
🔍 **Tìm nghệ sĩ**: "nghệ sĩ Sơn Tùng", "bài của BTS"
🔄 **Bài hát tương tự**: "tìm 50 bài tương tự bài Shape of You", "nhạc giống Blinding Lights"

Hãy thử nhắn cho mình điều bạn muốn nghe nhé!`,
      });
    }

    // Intent: category-based recommendation (KNN + cosine similarity)
    const category = parseCategory(message);
    if (category) {
      const allTracks = await prisma.track.findMany({
        select: { trackName: true, artists: true, albumName: true, energyNorm: true, danceabilityNorm: true, popularityNorm: true, durationMsNorm: true, explicitNorm: true },
      });

      const candidates = allTracks.map((t) => ({
        trackName: t.trackName,
        artists: t.artists,
        albumName: t.albumName,
        vector: toVector(t),
      }));

      const results = knnSearch(category.centroid, candidates, 50);

      return NextResponse.json({
        reply: `Đây là những bài hát phù hợp với thể loại **${category.label}** (tìm bằng KNN + cosine similarity):\n\n${formatTrackList(results)}\n\nBạn muốn mình điều chỉnh thêm gì không?`,
      });
    }

    // Intent: search
    const searchTerm = parseSearchTerms(message);
    if (searchTerm) {
      const tracks = await prisma.track.findMany({
        where: {
          OR: [
            { trackName: { contains: searchTerm, mode: "insensitive" } },
            { artists: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        orderBy: { popularity: "desc" },
        take: 50,
        select: { trackName: true, artists: true, albumName: true },
      });

      if (tracks.length === 0) {
        return NextResponse.json({
          reply: `Không tìm thấy bài hát nào liên quan đến "${searchTerm}". Bạn thử từ khóa khác nhé?`,
        });
      }

      return NextResponse.json({
        reply: `Kết quả tìm kiếm cho **"${searchTerm}"**:\n\n${formatTrackList(tracks)}\n\nBạn muốn nghe thử bài nào?`,
      });
    }

    // Intent: similar tracks (KNN + cosine similarity trên toàn bộ 5 đặc trưng)
    const similar = parseSimilarSong(message);
    if (similar) {
      const targetTrack = await prisma.track.findFirst({
        where: {
          OR: [
            { trackName: { contains: similar.songName, mode: "insensitive" } },
            { artists: { contains: similar.songName, mode: "insensitive" } },
          ],
        },
        orderBy: { popularity: "desc" },
        select: { id: true, trackName: true, artists: true, energyNorm: true, danceabilityNorm: true, popularityNorm: true, durationMsNorm: true, explicitNorm: true },
      });

      if (!targetTrack) {
        return NextResponse.json({
          reply: `Không tìm thấy bài hát nào tên **"${similar.songName}"** trong thư viện. Bạn kiểm tra lại tên bài hát nhé?`,
        });
      }

      const targetVector = toVector(targetTrack);

      const allTracks = await prisma.track.findMany({
        where: { id: { not: targetTrack.id } },
        select: { trackName: true, artists: true, albumName: true, energyNorm: true, danceabilityNorm: true, popularityNorm: true, durationMsNorm: true, explicitNorm: true },
      });

      const candidates = allTracks.map((t) => ({
        trackName: t.trackName,
        artists: t.artists,
        albumName: t.albumName,
        vector: toVector(t),
      }));

      const results = knnSearch(targetVector, candidates, similar.count);

      if (results.length === 0) {
        return NextResponse.json({
          reply: `Không tìm thấy bài hát nào tương tự **"${targetTrack.trackName}"** — ${targetTrack.artists}. Bạn thử tìm bài khác nhé?`,
        });
      }

      const simScores = results.slice(0, 3).map((r) => `${(r.similarity * 100).toFixed(1)}%`).join(", ");
      return NextResponse.json({
        reply: `Đây là **${results.length}** bài hát tương tự **"${targetTrack.trackName}"** — ${targetTrack.artists} (top-3 similarity: ${simScores}):\n\n${formatTrackList(results)}\n\nBạn muốn mình tinh chỉnh thêm gì không?`,
      });
    }

    // Intent: playlist recommendation
    if (/playlist|mix|danh sách|tuyển tập/i.test(message)) {
      const match = message.match(/(\d+)/);
      const count = match ? Math.min(50, Math.max(3, parseInt(match[1]))) : 50;
      const catForPlaylist = parseCategory(message);

      let tracks: { trackName: string; artists: string; albumName?: string }[];

      if (catForPlaylist) {
        const allTracks = await prisma.track.findMany({
          select: { trackName: true, artists: true, albumName: true, energyNorm: true, danceabilityNorm: true, popularityNorm: true, durationMsNorm: true, explicitNorm: true },
        });
        const candidates = allTracks.map((t) => ({
          trackName: t.trackName,
          artists: t.artists,
          albumName: t.albumName,
          vector: toVector(t),
        }));
        tracks = knnSearch(catForPlaylist.centroid, candidates, count);
      } else {
        tracks = await prisma.track.findMany({
          orderBy: { popularity: "desc" },
          take: count,
          select: { trackName: true, artists: true, albumName: true },
        });
      }

      const catLabel = catForPlaylist ? ` ${catForPlaylist.label}` : "";
      return NextResponse.json({
        reply: `Mình gợi ý playlist${catLabel} ${count} bài cho bạn:\n\n${formatTrackList(tracks)}\n\nBạn muốn lưu playlist này không?`,
      });
    }

    // Intent: artist search
    const artistMatch = message.match(/(?:nghệ sĩ|artist|ca sĩ|bài của)\s+(.+)/i);
    if (artistMatch?.[1]) {
      const name = artistMatch[1].trim();
      const tracks = await prisma.track.findMany({
        where: { artists: { contains: name, mode: "insensitive" } },
        orderBy: { popularity: "desc" },
        take: 50,
        select: { trackName: true, artists: true, albumName: true },
      });

      if (tracks.length === 0) {
        return NextResponse.json({
          reply: `Không tìm thấy bài hát nào của "${name}". Bạn kiểm tra lại tên nhé?`,
        });
      }

      return NextResponse.json({
        reply: `Bài hát của **${name}**:\n\n${formatTrackList(tracks)}\n\nBạn thích bài nào nhất?`,
      });
    }

    // Fallback: generic search
    const generalTracks = await prisma.track.findMany({
      where: {
        OR: [
          { trackName: { contains: message, mode: "insensitive" } },
          { artists: { contains: message, mode: "insensitive" } },
          { albumName: { contains: message, mode: "insensitive" } },
        ],
      },
      orderBy: { popularity: "desc" },
      take: 50,
      select: { trackName: true, artists: true, albumName: true },
    });

    if (generalTracks.length > 0) {
      return NextResponse.json({
        reply: `Mình tìm thấy những bài này:\n\n${formatTrackList(generalTracks)}\n\nBạn muốn nghe gì khác không?`,
      });
    }

    return NextResponse.json({
      reply: "Mình chưa hiểu ý bạn lắm. Hãy thử: tìm bài hát, gợi ý theo tâm trạng (chill, sad, workout...), hoặc tạo playlist nhé! Gõ **help** để xem hướng dẫn.",
    });
  } catch (error) {
    console.error("Chatbot API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
