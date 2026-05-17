import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/artists
 * List artists with optional pagination.
 *
 * Query params:
 *   page  - page number (default 1)
 *   limit - items per page (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

    const [artists, total] = await Promise.all([
      prisma.artist.findMany({
        orderBy: { nbFan: { sort: "desc", nulls: "last" } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.artist.count(),
    ]);

    return NextResponse.json({
      data: artists,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch artists" },
      { status: 500 },
    );
  }
}
