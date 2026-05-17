import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware – protects private API routes by checking for a valid session token.
 *
 * Public routes (no auth required):
 *   - /api/auth/**        – NextAuth handlers
 *   - /api/tracks (GET)   – browsing the catalogue
 *   - /api/playlists (GET)      – browsing public playlists
 *   - /api/playlists/:id (GET)  – viewing a single playlist (NOT /containing)
 *   - /api/search (GET)   – searching
 *   - /api/albums (GET)   – browsing albums
 *   - /api/artists (GET)  – browsing artists
 *
 * All other /api/** routes require a session cookie.
 * Pages are NOT blocked here; auth checks happen at the component level.
 */

const PUBLIC_API_PREFIXES = ["/api/auth"];

const PUBLIC_API_ROUTES: { path: string; methods: string[] }[] = [
  { path: "/api/tracks", methods: ["GET"] },
  { path: "/api/search", methods: ["GET"] },
  { path: "/api/playlists", methods: ["GET"] },
  { path: "/api/albums", methods: ["GET"] },
  { path: "/api/artists", methods: ["GET"] },
  { path: "/api/chat", methods: ["POST"] },
  { path: "/api/chatbot", methods: ["POST"] },
];

function isPublicApiRoute(pathname: string, method: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;

  for (const route of PUBLIC_API_ROUTES) {
    if (pathname === route.path && route.methods.includes(method)) return true;
    // allow GET on /api/tracks/:id (but not /stream) and /api/playlists/:id
    if (method === "GET") {
      if (
        route.path === "/api/tracks" &&
        pathname.startsWith("/api/tracks/") &&
        !pathname.slice("/api/tracks/".length).includes("/")
      ) {
        return true;
      }
      if (
        route.path === "/api/playlists" &&
        pathname.startsWith("/api/playlists/") &&
        !pathname.slice("/api/playlists/".length).includes("/") &&
        pathname !== "/api/playlists/containing"
      ) {
        return true;
      }
      if (
        route.path === "/api/albums" &&
        pathname.startsWith("/api/albums/")
      ) {
        return true;
      }
      if (
        route.path === "/api/artists" &&
        pathname.startsWith("/api/artists/")
      ) {
        return true;
      }
    }
  }

  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to /api routes
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (isPublicApiRoute(pathname, request.method)) {
    return NextResponse.next();
  }

  // Check for session token (set by NextAuth)
  const sessionToken =
    request.cookies.get("__Secure-authjs.session-token") ??
    request.cookies.get("authjs.session-token");

  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
