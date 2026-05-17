import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/tracks
 * List tracks with optional pagination and filtering.
 *
 * Query params:
 *   page     – page number (default 1)
 *   limit    – items per page (default 20, max 100)
 *   sort     – "popularity" | "name" | "recent" (default "popularity")
 *   artist   – filter by artist name (partial match)
 *   album    – filter by album name (partial match)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const sort = searchParams.get("sort") ?? "popularity";
    const artist = searchParams.get("artist");
    const album = searchParams.get("album");

    const where: Record<string, unknown> = {};
    if (artist) where.artists = { contains: artist, mode: "insensitive" };
    if (album) where.albumName = { contains: album, mode: "insensitive" };

    const orderBy =
      sort === "name"
        ? { trackName: "asc" as const }
        : sort === "recent"
          ? { createdAt: "desc" as const }
          : { popularity: "desc" as const };

    const [tracks, total] = await Promise.all([
      prisma.track.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.track.count({ where }),
    ]);

    return NextResponse.json({
      data: tracks,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch tracks" },
      { status: 500 }
    );
  }
}
