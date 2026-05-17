import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/playlists/:id
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true } },
        tracks: {
          include: { track: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    if (playlist.privacy === "PRIVATE" && playlist.userId !== session?.user?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(playlist);
  } catch {
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}

/**
 * PATCH /api/playlists/:id
 * Update playlist metadata (owner only).
 * Body: { name?, description?, privacy? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    if (playlist.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Playlist name cannot be empty" }, { status: 400 });
      }
      data.name = body.name.trim();
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        return NextResponse.json({ error: "description must be a string or null" }, { status: 400 });
      }
      data.description = body.description;
    }
    if (body.coverUrl !== undefined) {
      if (body.coverUrl !== null && typeof body.coverUrl !== "string") {
        return NextResponse.json({ error: "coverUrl must be a string or null" }, { status: 400 });
      }
      data.coverUrl = body.coverUrl || null;
    }
    if (body.privacy !== undefined) data.privacy = body.privacy === "PUBLIC" ? "PUBLIC" : "PRIVATE";

    const updated = await prisma.playlist.update({ where: { id }, data });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update playlist" }, { status: 500 });
  }
}

/**
 * DELETE /api/playlists/:id
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    if (playlist.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.playlist.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete playlist" }, { status: 500 });
  }
}
