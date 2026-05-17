import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * POST /api/playlists/:id/tracks
 * Add a track to a playlist (owner only).
 * Body: { trackId }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { trackId } = await request.json();

    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    // Verify track exists (trackId here is the internal cuid, NOT the Kaggle/external trackId field)
    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    if (playlist.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const entry = await prisma.$transaction(async (tx) => {
      const maxPosition = await tx.playlistTrack.aggregate({
        where: { playlistId: id },
        _max: { position: true },
      });

      return tx.playlistTrack.create({
        data: {
          playlistId: id,
          trackId,
          position: (maxPosition._max.position ?? -1) + 1,
        },
        include: { track: true },
      });
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(entry, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Track already in playlist" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add track to playlist" }, { status: 500 });
  }
}

/**
 * DELETE /api/playlists/:id/tracks
 * Remove a track from a playlist (owner only).
 * Body: { trackId }
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { trackId } = await request.json();

    if (!trackId) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    if (playlist.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.playlistTrack.delete({
      where: { playlistId_trackId: { playlistId: id, trackId } },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Track not in playlist" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to remove track" }, { status: 500 });
  }
}
