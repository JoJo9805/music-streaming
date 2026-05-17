import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/profile
 * Returns the authenticated user's profile with counts.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        _count: {
          select: {
            playlists: true,
            libraryItems: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

/**
 * PATCH /api/profile
 * Update the authenticated user's profile.
 * Body: { name?, image? }
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      data.name = body.name.trim();
    }
    if (body.image !== undefined) {
      if (body.image !== null) {
        if (typeof body.image !== "string") {
          return NextResponse.json({ error: "Image must be a URL string or null" }, { status: 400 });
        }
        try {
          const url = new URL(body.image);
          if (url.protocol !== "https:") {
            return NextResponse.json({ error: "Image URL must use HTTPS" }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ error: "Image must be a valid URL" }, { status: 400 });
        }
      }
      data.image = body.image;
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        _count: {
          select: {
            playlists: true,
            libraryItems: true,
          },
        },
      },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
