import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/albums
 * List albums with optional pagination and exact name filtering.
 *
 * Query params:
 *   page  - page number (default 1)
 *   limit - items per page (default 20, max 100)
 *   sort  - "recent" | "popular" | "name" (default "name")
 *   name  - exact album name match
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const sort = searchParams.get("sort") ?? "name";
    const name = searchParams.get("name")?.trim();
    const where = name ? { name } : undefined;

    // Popular sort: rank albums by average track popularity using a single raw SQL query
    if (sort === "popular" && !name) {
      const total = await prisma.album.count();

      const albums = await prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          artists: string;
          coverUrl: string | null;
          createdAt: Date;
          updatedAt: Date;
          avg_popularity: number | null;
        }>
      >`
        SELECT a.*, AVG(t.popularity) AS avg_popularity
        FROM "Album" a
        LEFT JOIN "Track" t ON t."albumName" = a.name AND t."artists" = a.artists
        GROUP BY a.id
        ORDER BY avg_popularity DESC NULLS LAST
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;

      return NextResponse.json({
        data: albums,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    const orderBy =
      sort === "recent"
        ? { createdAt: "desc" as const }
        : { name: "asc" as const };

    const [albums, total] = await Promise.all([
      prisma.album.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.album.count({ where }),
    ]);

    return NextResponse.json({
      data: albums,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch albums" },
      { status: 500 },
    );
  }
}
