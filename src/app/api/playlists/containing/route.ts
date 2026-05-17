import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/playlists/containing?trackId=<id>
 * Returns the IDs of the authenticated user's playlists that contain the given track.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const trackId = request.nextUrl.searchParams.get("trackId");
    if (!trackId) {
      return NextResponse.json(
        { error: "trackId query parameter is required" },
        { status: 400 }
      );
    }

    const entries = await prisma.playlistTrack.findMany({
      where: {
        trackId,
        playlist: { userId: session.user.id },
      },
      select: { playlistId: true },
    });

    return NextResponse.json({ data: entries.map((e) => e.playlistId) });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch containing playlists" },
      { status: 500 }
    );
  }
}
