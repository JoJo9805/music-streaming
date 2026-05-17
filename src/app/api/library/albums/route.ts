import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/library/albums
 * Returns the authenticated user's saved albums.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
    const albumName = searchParams.get("albumName")?.trim();
    const where = {
      userId: session.user.id,
      ...(albumName ? { album: { name: albumName } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.savedAlbum.findMany({
        where,
        include: { album: true },
        orderBy: { savedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.savedAlbum.count({ where }),
    ]);

    return NextResponse.json({
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch saved albums" }, { status: 500 });
  }
}

/**
 * POST /api/library/albums
 * Save an album to the user's library.
 * Body: { albumId }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let albumId: string | undefined;

  try {
    ({ albumId } = await request.json());

    if (!albumId) {
      return NextResponse.json({ error: "albumId is required" }, { status: 400 });
    }

    const album = await prisma.album.findUnique({ where: { id: albumId } });
    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    const item = await prisma.savedAlbum.create({
      data: { userId: user.id, albumId },
      include: { album: true },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to save album", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      if (!albumId) {
        return NextResponse.json({ error: "Album already saved" }, { status: 409 });
      }
      const existing = await prisma.savedAlbum.findUnique({
        where: { userId_albumId: { userId: user.id, albumId } },
        include: { album: true },
      });
      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
      return NextResponse.json({ error: "Album already saved" }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save album" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/library/albums
 * Remove a saved album from the user's library.
 * Body: { albumId }
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { albumId } = await request.json();

    if (!albumId) {
      return NextResponse.json({ error: "albumId is required" }, { status: 400 });
    }

    await prisma.savedAlbum.delete({
      where: { userId_albumId: { userId: user.id, albumId } },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Album not in library" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to remove saved album" }, { status: 500 });
  }
}
