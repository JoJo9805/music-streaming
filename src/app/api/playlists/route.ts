import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/playlists
 * Returns public playlists + the authenticated user's own playlists.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    const where = session?.user?.id
      ? { OR: [{ privacy: "PUBLIC" as const }, { userId: session.user.id }] }
      : { privacy: "PUBLIC" as const };

    const [playlists, total] = await Promise.all([
      prisma.playlist.findMany({
        where,
        include: { user: { select: { id: true, name: true, image: true } }, _count: { select: { tracks: true } } },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.playlist.count({ where }),
    ]);

    return NextResponse.json({
      data: playlists,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
  }
}

/**
 * POST /api/playlists
 * Create a new playlist (requires auth).
 * Body: { name, description?, privacy?, coverUrl? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description, privacy, coverUrl } = await request.json();

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Playlist name is required" }, { status: 400 });
    }

    const playlist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        privacy: privacy === "PUBLIC" ? "PUBLIC" : "PRIVATE",
        coverUrl: typeof coverUrl === "string" ? coverUrl : null,
        userId: session.user.id,
      },
    });

    return NextResponse.json(playlist, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create playlist" }, { status: 500 });
  }
}
