import { prisma } from "@/lib/prisma";

type FeatureVector = [number, number, number, number, number];

interface TrackFeatures {
  energyNorm: number;
  danceabilityNorm: number;
  popularityNorm: number;
  durationMsNorm: number;
  explicitNorm: number;
}

interface SeedTrack {
  track_name: string;
  artists: string;
  vector: FeatureVector;
}

interface RecommendationResult {
  id: string;
  name: string;
  artist: string;
  album?: string;
  similarity: string;
}

function toVector(t: TrackFeatures): FeatureVector {
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

export async function findSeedSong(query: string): Promise<SeedTrack | null> {
  let whereClause: any = {
    OR: [
      { trackName: { contains: query, mode: "insensitive" } },
      { artists: { contains: query, mode: "insensitive" } },
    ],
  };

  // Tách tên bài hát và nghệ sĩ nếu người dùng dùng " của ", " by ", " - "
  const splitMatch = query.match(/^(.*?)\s+(?:của|by|-)\s+(.*)$/i);
  if (splitMatch) {
    const trackPart = splitMatch[1].trim();
    const artistPart = splitMatch[2].trim();
    whereClause = {
      AND: [
        { trackName: { contains: trackPart, mode: "insensitive" } },
        { artists: { contains: artistPart, mode: "insensitive" } },
      ]
    };
  }

  let track = await prisma.track.findFirst({
    where: whereClause,
    orderBy: { popularity: "desc" },
    select: {
      trackName: true,
      artists: true,
      energyNorm: true,
      danceabilityNorm: true,
      popularityNorm: true,
      durationMsNorm: true,
      explicitNorm: true,
    },
  });

  // Fallback: Nếu không tìm thấy bằng AND (do người dùng gõ sai cấu trúc), thử lại bằng OR nguyên bản
  if (!track && splitMatch) {
    track = await prisma.track.findFirst({
      where: {
        OR: [
          { trackName: { contains: query, mode: "insensitive" } },
          { artists: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { popularity: "desc" },
      select: {
        trackName: true,
        artists: true,
        energyNorm: true,
        danceabilityNorm: true,
        popularityNorm: true,
        durationMsNorm: true,
        explicitNorm: true,
      },
    });
  }

  if (!track) return null;

  return {
    track_name: track.trackName,
    artists: track.artists,
    vector: toVector(track),
  };
}

export async function getRecommendations(seed: SeedTrack, count: number = 100): Promise<RecommendationResult[]> {
  const allTracks = await prisma.track.findMany({
    where: {
      NOT: {
        AND: [
          { trackName: seed.track_name },
          { artists: seed.artists },
        ],
      },
    },
    select: {
      id: true,
      trackName: true,
      artists: true,
      albumName: true,
      energyNorm: true,
      danceabilityNorm: true,
      popularityNorm: true,
      durationMsNorm: true,
      explicitNorm: true,
    },
  });

  const candidates = allTracks.map((t) => ({
    id: t.id,
    trackName: t.trackName,
    artists: t.artists,
    albumName: t.albumName,
    vector: toVector(t),
  }));

  return candidates
    .map((c) => ({
      ...c,
      similarity: cosineSimilarity(seed.vector, c.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count)
    .map((c) => ({
      id: c.id,
      name: c.trackName,
      artist: c.artists,
      album: c.albumName,
      similarity: `${(c.similarity * 100).toFixed(1)}%`,
    }));
}
