import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/search?q=<query>&type=tracks|albums|artists|playlists|all
 * Full-text-style search across tracks, albums, artists & public playlists.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q")?.trim();
    const type = searchParams.get("type") ?? "all";
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    if (!q) {
      return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
    }

    const results: Record<string, unknown> = {};

    const [tracks, albums, artists, playlists] = await Promise.all([
      (type === "all" || type === "tracks")
        ? prisma.track.findMany({
            where: {
              OR: [
                { trackName: { contains: q, mode: "insensitive" } },
                { artists: { contains: q, mode: "insensitive" } },
                { albumName: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { popularity: "desc" },
            take: limit,
          })
        : undefined,
      (type === "all" || type === "albums")
        ? prisma.album.findMany({
            where: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { artists: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { name: "asc" },
            take: limit,
          })
        : undefined,
      (type === "all" || type === "artists")
        ? prisma.artist.findMany({
            where: { name: { contains: q, mode: "insensitive" } },
            orderBy: { nbFan: { sort: "desc", nulls: "last" } },
            take: limit,
          })
        : undefined,
      (type === "all" || type === "playlists")
        ? prisma.playlist.findMany({
            where: {
              privacy: "PUBLIC",
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            },
            include: {
              user: { select: { id: true, name: true, image: true } },
              _count: { select: { tracks: true } },
            },
            take: limit,
          })
        : undefined,
    ]);

    if (tracks !== undefined) results.tracks = tracks;
    if (albums !== undefined) results.albums = albums;
    if (artists !== undefined) results.artists = artists;
    if (playlists !== undefined) results.playlists = playlists;

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
