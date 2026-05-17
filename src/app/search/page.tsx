"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Typography } from "@/components/ui/Typography";
import { TrackListItem } from "@/components/ui/TrackListItem";
import { AlbumGrid } from "@/components/ui/AlbumGrid";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { Search, X, Disc3 } from "lucide-react";
import { api } from "@/lib/api";
import type { Playlist, Artist } from "@/types/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

type SearchTab = "all" | "tracks" | "albums" | "artists" | "playlists";

const TABS: { value: SearchTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tracks", label: "Tracks" },
  { value: "albums", label: "Albums" },
  { value: "artists", label: "Artists" },
  { value: "playlists", label: "Playlists" },
];

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery, activeTab],
    queryFn: () => api.search(debouncedQuery, activeTab, 20),
    enabled: debouncedQuery.length > 0,
    placeholderData: (prev) => prev,
  });

  const tracks = results?.tracks ?? [];
  const albums = results?.albums ?? [];
  const artists = results?.artists ?? [];
  const playlists = results?.playlists ?? [];

  const hasResults = tracks.length > 0 || albums.length > 0 || artists.length > 0 || playlists.length > 0;

  return (
    <div className="p-6 md:p-10 space-y-8">
      {/* Search Header */}
      <div className="space-y-6">
        <Typography variant="h1">Search</Typography>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative flex-1 max-w-xl w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to listen to?"
              className="w-full bg-white/10 border border-white/10 rounded-full pl-12 pr-10 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors text-lg"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto shrink-0 pb-1">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.value
                    ? "bg-foreground text-background"
                    : "bg-white/10 text-muted hover:text-foreground hover:bg-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading — only shown on the very first search, not on subsequent refetches */}
      {isLoading && !results && debouncedQuery && (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface animate-pulse rounded-md" />
          ))}
        </div>
      )}

      {/* Results */}
      {results && debouncedQuery && (
        <>
          {activeTab === "all" ? (
            <>
              {/* Artists */}
              {artists.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Artists</Typography>
                  <ScrollRow>
                    {artists.map((artist: Artist) => (
                      <Link
                        href={`/artist/${encodeURIComponent(artist.name)}`}
                        key={artist.id}
                        className="flex flex-col items-center gap-3 shrink-0 group transition-transform duration-200 hover:scale-[1.03]"
                      >
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden shadow-lg bg-surface">
                          {artist.imageUrl ? (
                            <img
                              src={artist.imageUrl}
                              alt={artist.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                              <Disc3 className="w-10 h-10 text-muted" />
                            </div>
                          )}
                        </div>
                        <div className="text-center max-w-[8rem] md:max-w-[10rem]">
                          <Typography
                            variant="caption"
                            className="block truncate font-semibold group-hover:text-accent transition-colors"
                          >
                            {artist.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="muted"
                            className="block truncate text-xs"
                          >
                            Artist
                          </Typography>
                        </div>
                      </Link>
                    ))}
                  </ScrollRow>
                </section>
              )}

              {/* Albums */}
              {albums.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Albums</Typography>
                  <ScrollRow>
                    {albums.map((album) => (
                      <Link
                        href={`/album/${encodeURIComponent(album.name)}`}
                        key={album.id}
                        className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-2 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]"
                      >
                        <div className="aspect-square rounded-xl bg-surface overflow-hidden relative shadow-lg">
                          {album.coverUrl ? (
                            <img
                              src={album.coverUrl}
                              alt={album.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                              <Play className="w-8 h-8 text-muted" />
                            </div>
                          )}
                        </div>
                        <div>
                          <Typography variant="caption" className="block truncate font-semibold">
                            {album.name}
                          </Typography>
                          <Typography variant="caption" color="muted" className="block truncate text-xs">
                            {album.artists.split(";").map((artist: string, i: number, arr: string[]) => (
                              <span key={i}>
                                <span
                                  className="hover:underline cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    router.push(`/artist/${encodeURIComponent(artist.trim())}`);
                                  }}
                                >
                                  {artist.trim()}
                                </span>
                                {i < arr.length - 1 && ", "}
                              </span>
                            ))}
                          </Typography>
                        </div>
                      </Link>
                    ))}
                  </ScrollRow>
                </section>
              )}

              {/* Playlists */}
              {playlists.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Playlists</Typography>
                  <ScrollRow>
                    {playlists.map((playlist: Playlist) => (
                      <Link
                        href={`/playlist/${playlist.id}`}
                        key={playlist.id}
                        className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-2 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]"
                      >
                        <div className="aspect-square rounded-xl bg-surface overflow-hidden relative shadow-lg">
                          {playlist.coverUrl ? (
                            <img
                              src={playlist.coverUrl}
                              alt={playlist.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                              <Play className="w-10 h-10 text-muted" />
                            </div>
                          )}
                        </div>
                        <div>
                          <Typography
                            variant="caption"
                            className="block truncate font-semibold"
                          >
                            {playlist.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="muted"
                            className="block truncate text-xs"
                          >
                            by {playlist.user.name ?? "User"} &bull;{" "}
                            {playlist._count.tracks} tracks
                          </Typography>
                        </div>
                      </Link>
                    ))}
                  </ScrollRow>
                </section>
              )}

              {/* Tracks (limit 10) */}
              {tracks.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Tracks</Typography>
                  <div className="space-y-1">
                    {tracks.slice(0, 10).map((track, i) => (
                      <TrackListItem
                        key={track.id}
                        track={track}
                        index={i}
                        queue={tracks}
                        showAlbum
                        showCover
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              {/* Tracks */}
              {tracks.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Tracks</Typography>
                  <div className="space-y-1">
                    {tracks.map((track, i) => (
                      <TrackListItem
                        key={track.id}
                        track={track}
                        index={i}
                        queue={tracks}
                        showAlbum
                        showCover
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Albums */}
              {albums.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Albums</Typography>
                  <AlbumGrid albums={albums} />
                </section>
              )}

              {/* Artists */}
              {artists.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Artists</Typography>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {artists.map((artist: Artist) => (
                      <Link
                        href={`/artist/${encodeURIComponent(artist.name)}`}
                        key={artist.id}
                        className="flex flex-col items-center gap-3 group transition-transform duration-200 hover:scale-[1.03]"
                      >
                        <div className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden shadow-lg bg-surface">
                          {artist.imageUrl ? (
                            <img
                              src={artist.imageUrl}
                              alt={artist.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                              <Disc3 className="w-10 h-10 text-muted" />
                            </div>
                          )}
                        </div>
                        <div className="text-center max-w-[7rem] md:max-w-[9rem]">
                          <Typography
                            variant="caption"
                            className="block truncate font-semibold group-hover:text-accent transition-colors"
                          >
                            {artist.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="muted"
                            className="block truncate text-xs"
                          >
                            Artist
                          </Typography>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Playlists */}
              {playlists.length > 0 && (
                <section className="space-y-4">
                  <Typography variant="h3">Playlists</Typography>
                  <ScrollRow>
                    {playlists.map((playlist: Playlist) => (
                      <Link
                        href={`/playlist/${playlist.id}`}
                        key={playlist.id}
                        className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-2 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]"
                      >
                        <div className="aspect-square rounded-xl bg-surface overflow-hidden relative shadow-lg">
                          {playlist.coverUrl ? (
                            <img
                              src={playlist.coverUrl}
                              alt={playlist.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                              <Play className="w-10 h-10 text-muted" />
                            </div>
                          )}
                        </div>
                        <div>
                          <Typography
                            variant="caption"
                            className="block truncate font-semibold"
                          >
                            {playlist.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="muted"
                            className="block truncate text-xs"
                          >
                            by {playlist.user.name ?? "User"} &bull;{" "}
                            {playlist._count.tracks} tracks
                          </Typography>
                        </div>
                      </Link>
                    ))}
                  </ScrollRow>
                </section>
              )}
            </>
          )}

          {/* No results */}
          {!hasResults && (
            <div className="py-12 text-center">
              <Typography variant="body" color="muted">
                No results found for &ldquo;{debouncedQuery}&rdquo;
              </Typography>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!debouncedQuery && (
        <div className="py-12 text-center">
          <Typography variant="body" color="muted">
            Start typing to search for tracks, albums, artists, and playlists
          </Typography>
        </div>
      )}
    </div>
  );
}
