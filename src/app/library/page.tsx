"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Typography } from "@/components/ui/Typography";
import { TrackListItem } from "@/components/ui/TrackListItem";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { Play, Heart, Disc3 } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { api } from "@/lib/api";
import type { Playlist, SavedAlbum } from "@/types/api";
import Link from "next/link";

export default function LibraryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const playTrack = usePlayerStore((s) => s.playTrack);

  const { data: libraryData, isLoading: loadingLibrary } = useQuery({
    queryKey: ["library"],
    queryFn: () => api.library.list({ limit: 50 }),
    enabled: !!session?.user,
  });

  const { data: playlistsData, isLoading: loadingPlaylists } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => api.playlists.list({ limit: 50 }),
    enabled: !!session?.user,
  });

  const { data: savedAlbumsData, isLoading: loadingSavedAlbums } = useQuery({
    queryKey: ["saved-albums"],
    queryFn: () => api.library.albums.list({ limit: 200 }),
    enabled: !!session?.user,
  });

  // Redirect to login if not authenticated (side effect, not during render)
  useEffect(() => {
    if (status !== "loading" && !session?.user) {
      router.push("/login");
    }
  }, [status, session?.user, router]);

  if (status === "loading") {
    return (
      <div className="p-6 md:p-10 space-y-8">
        <div className="h-8 w-32 bg-surface animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const likedTracks = libraryData?.data.map((item) => item.track) ?? [];
  const userPlaylists =
    playlistsData?.data.filter((p: Playlist) => p.userId === session.user?.id) ?? [];
  const savedAlbums = savedAlbumsData?.data ?? [];

  function handlePlayLiked() {
    if (likedTracks.length > 0) {
      playTrack(likedTracks[0], likedTracks);
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="border-b border-white/5 pb-6">
        <Typography variant="h1">Library</Typography>
      </div>

      <div className="space-y-6">
        <Typography variant="h3">Playlists & Saved</Typography>
        <ScrollRow>
          {/* Liked Songs Card */}
          <div
            className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] rounded-xl shadow-lg cursor-pointer hover:scale-[1.02] transition-transform aspect-square relative overflow-hidden"
            onClick={handlePlayLiked}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-accent" />
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <Heart className="w-8 h-8 text-white mb-2 fill-white" />
              <Typography variant="h3" className="text-white drop-shadow-md">
                Liked Songs
              </Typography>
              <Typography variant="caption" className="text-white/80">
                {libraryData?.meta.total ?? 0} songs
              </Typography>
            </div>
          </div>

          {userPlaylists.map((playlist: Playlist) => (
            <Link
              href={`/playlist/${playlist.id}`}
              key={playlist.id}
                className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-3 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]"
            >
              <div className="aspect-square rounded-xl bg-surface hover:bg-surface-hover overflow-hidden relative shadow-lg">
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
                  {playlist._count.tracks} tracks
                </Typography>
              </div>
            </Link>
          ))}

          {loadingPlaylists &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-3">
                <div className="aspect-square rounded-xl bg-surface animate-pulse" />
                <div className="h-4 bg-surface rounded animate-pulse w-3/4" />
              </div>
            ))}
        </ScrollRow>
      </div>

      {/* Saved Albums */}
      {(savedAlbums.length > 0 || loadingSavedAlbums) && (
        <div className="space-y-6">
          <Typography variant="h3">Saved Albums</Typography>
          <ScrollRow>
            {savedAlbums.map((saved: SavedAlbum) => (
              <Link
                href={`/album/${encodeURIComponent(saved.album.name)}`}
                key={saved.id}
              className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-3 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]"
              >
                <div className="aspect-square rounded-xl bg-surface hover:bg-surface-hover overflow-hidden relative shadow-lg">
                  {saved.album.coverUrl ? (
                    <img
                      src={saved.album.coverUrl}
                      alt={saved.album.name}
                    className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                      <Disc3 className="w-10 h-10 text-muted" />
                    </div>
                  )}
                </div>
                <div>
                  <Typography variant="caption" className="block truncate font-semibold">
                    {saved.album.name}
                  </Typography>
                  <Typography variant="caption" color="muted" className="block truncate text-xs">
                    {saved.album.artists}
                  </Typography>
                </div>
              </Link>
            ))}
            {loadingSavedAlbums &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%] xl:w-[14%] space-y-3">
                  <div className="aspect-square rounded-xl bg-surface animate-pulse" />
                  <div className="h-4 bg-surface rounded animate-pulse w-3/4" />
                </div>
              ))}
          </ScrollRow>
        </div>
      )}

      {/* Liked Songs Track List */}
      {likedTracks.length > 0 && (
        <div className="space-y-6">
          <Typography variant="h3">Liked Songs</Typography>
          <div className="space-y-1">
            {likedTracks.map((track, i) => (
              <TrackListItem
                key={track.id}
                track={track}
                index={i}
                queue={likedTracks}
                showAlbum
                showCover
              />
            ))}
          </div>
        </div>
      )}

      {!loadingLibrary && likedTracks.length === 0 && userPlaylists.length === 0 && savedAlbums.length === 0 && (
        <div className="py-12 text-center">
          <Typography variant="body" color="muted">
            Your library is empty. Start exploring and liking tracks!
          </Typography>
        </div>
      )}
    </div>
  );
}
