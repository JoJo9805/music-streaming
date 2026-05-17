import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Hostnames that are allowed as exact matches or .<domain> suffixes
const ALLOWED_PREVIEW_DOMAINS = ["dzcdn.net"];
// Hostnames that are allowed when the hostname *starts with* this prefix
const ALLOWED_PREVIEW_PREFIXES = ["cdns-preview-", "cdnt-uscdn", "e-cdns-"];

function isAllowedPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const h = parsed.hostname.toLowerCase();
    if (ALLOWED_PREVIEW_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`)))
      return true;
    if (ALLOWED_PREVIEW_PREFIXES.some((p) => h.startsWith(p))) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * GET /api/tracks/:id/stream
 *
 * Proxies a 30-second preview through our server so that:
 *   1. The real preview URL is never exposed to the client.
 *   2. We can enforce authentication.
 *   3. HTTP Range requests are supported for seeking.
 *
 * Flow:
 *   - Resolve track → get previewUrl (or fetch from Deezer API).
 *   - If the client sends a Range header, forward it upstream.
 *   - Return the audio bytes with correct Content-Range / 206 status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // --- Auth guard -----------------------------------------------------------
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const track = await prisma.track.findFirst({
      where: { OR: [{ id }, { trackId: id }] },
    });

    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    // If no previewUrl stored yet, try to resolve via Deezer API
    let previewUrl = track.previewUrl;

    if (!previewUrl) {
      previewUrl = await resolveDeezerPreview(track.trackName, track.artists);

      if (previewUrl && isAllowedPreviewUrl(previewUrl)) {
        await prisma.track.update({
          where: { id: track.id },
          data: { previewUrl },
        });
      } else {
        previewUrl = null;
      }
    }

    if (!previewUrl) {
      return NextResponse.json(
        { error: "No preview available for this track" },
        { status: 404 }
      );
    }

    // SSRF guard: only proxy URLs from known Deezer CDN hosts
    if (!isAllowedPreviewUrl(previewUrl)) {
      return NextResponse.json(
        { error: "Invalid preview URL" },
        { status: 422 }
      );
    }

    // --- Proxy the audio with Range support ---------------------------------
    const rangeHeader = request.headers.get("range");
    const upstreamHeaders: HeadersInit = {};
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    let upstream = await fetch(previewUrl, { headers: upstreamHeaders });

    // If the cached preview URL is stale (expired), invalidate and re-resolve
    if (!upstream.ok && upstream.status !== 206) {
      await prisma.track.update({
        where: { id: track.id },
        data: { previewUrl: null },
      });

      const freshUrl = await resolveDeezerPreview(track.trackName, track.artists);
      if (freshUrl && isAllowedPreviewUrl(freshUrl)) {
        upstream = await fetch(freshUrl, { headers: upstreamHeaders });
        if (upstream.ok || upstream.status === 206) {
          await prisma.track.update({
            where: { id: track.id },
            data: { previewUrl: freshUrl },
          });
        }
      }
    }

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: "Failed to fetch audio from upstream" },
        { status: 502 }
      );
    }


    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("Content-Type") ?? "audio/mpeg");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, max-age=3600");

    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: "Streaming failed" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Deezer preview URL resolver (free, no API key required)
// ---------------------------------------------------------------------------
async function resolveDeezerPreview(
  trackName: string,
  artists: string,
): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${artists} ${trackName}`);
    const res = await fetch(
      `https://api.deezer.com/search?q=${query}&limit=1`,
    );

    if (!res.ok) return null;

    const data = await res.json();
    const hit = data?.data?.[0];

    return hit?.preview || null;
  } catch {
    return null;
  }
}
