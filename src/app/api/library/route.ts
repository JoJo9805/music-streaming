import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/library
 * Returns the authenticated user's liked tracks.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

    const [items, total] = await Promise.all([
      prisma.libraryItem.findMany({
        where: { userId: session.user.id },
        include: { track: true },
        orderBy: { addedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.libraryItem.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch library" }, { status: 500 });
  }
}

/**
 * POST /api/library
 * Like a track (add to library).
 * Body: { trackId }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trackId } = await request.json();

    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const item = await prisma.libraryItem.upsert({
      where: { userId_trackId: { userId: session.user.id, trackId } },
      update: {},
      create: { userId: session.user.id, trackId },
      include: { track: true },
    });

    return NextResponse.json(item, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add to library" }, { status: 500 });
  }
}

/**
 * DELETE /api/library
 * Unlike a track (remove from library).
 * Body: { trackId }
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trackId } = await request.json();

    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    await prisma.libraryItem.delete({
      where: { userId_trackId: { userId: session.user.id, trackId } },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Track not in library" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to remove from library" }, { status: 500 });
  }
}
