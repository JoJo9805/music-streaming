"use client";

import { useQuery } from "@tanstack/react-query";
import { Typography } from "@/components/ui/Typography";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { api } from "@/lib/api";
import { Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Artist } from "@/types/api";

const cardWidth = "w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%]";

export default function HomePage() {
  const router = useRouter();
  const { data: popularAlbumsData, isLoading: loadingPopular } = useQuery({
    queryKey: ["albums", "popular"],
    queryFn: () => api.albums.list({ sort: "popular", limit: 12 }),
  });

  const { data: artistsData, isLoading: loadingArtists } = useQuery({
    queryKey: ["artists", "discover"],
    queryFn: () => api.artists.list({ limit: 9 }),
  });

  const { data: recentAlbumsData, isLoading: loadingRecent } = useQuery({
    queryKey: ["albums", "recent"],
    queryFn: () => api.albums.list({ sort: "recent", limit: 12 }),
  });

  const popularAlbums = popularAlbumsData?.data ?? [];
  const artists = artistsData?.data ?? [];
  const recentAlbums = recentAlbumsData?.data ?? [];

  return (
    <div className="w-full">
      <div className="p-6 md:p-10 space-y-12">
        {/* Recent Releases */}
        <section className="space-y-6">
          <Typography variant="h2">Recent Releases</Typography>
          {loadingRecent ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`shrink-0 ${cardWidth} space-y-2`}>
                  <div className="aspect-square rounded-xl bg-surface animate-pulse" />
                  <div className="h-4 bg-surface rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-surface rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : recentAlbums.length === 0 ? (
            <Typography variant="body" color="muted">No recent releases</Typography>
          ) : (
            <ScrollRow>
              {recentAlbums.map((album) => (
                <Link
                  href={`/album/${encodeURIComponent(album.name)}`}
                  key={album.id}
                  className={`shrink-0 ${cardWidth} space-y-2 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]`}
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
                      {album.artists.split(";").map((artist, i, arr) => (
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
          )}
        </section>

        {/* Popular Albums */}
        <section className="space-y-6">
          <Typography variant="h2">Popular Albums</Typography>
          {loadingPopular ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`shrink-0 ${cardWidth} space-y-2`}>
                  <div className="aspect-square rounded-xl bg-surface animate-pulse" />
                  <div className="h-4 bg-surface rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-surface rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <ScrollRow>
              {popularAlbums.map((album) => (
                <Link
                  href={`/album/${encodeURIComponent(album.name)}`}
                  key={album.id}
                  className={`shrink-0 ${cardWidth} space-y-2 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]`}
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
                      {album.artists.split(";").map((artist, i, arr) => (
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
          )}
        </section>

        {/* Discover Artists */}
        <section className="space-y-6">
          <Typography variant="h2">Discover Artists</Typography>
          {loadingArtists ? (
            <div className="flex gap-6 overflow-x-auto scrollbar-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-3 shrink-0">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-surface animate-pulse" />
                  <div className="h-3 bg-surface rounded animate-pulse w-20" />
                </div>
              ))}
            </div>
          ) : artists.length === 0 ? (
            <Typography variant="body" color="muted">No artists found</Typography>
          ) : (
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
                      <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20" />
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
          )}
        </section>
      </div>
    </div>
  );
}
