"use client";

import { use, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { TrackListItem } from "@/components/ui/TrackListItem";
import { Play, Bookmark, Clock } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const queryClient = useQueryClient();

  const albumName = decodeURIComponent(id);

  const { data: tracksData, isLoading } = useQuery({
    queryKey: ["album-tracks", albumName],
    queryFn: () => api.tracks.list({ album: albumName, limit: 50 }),
  });

  // Fetch user's saved albums to derive saved state
  const { data: savedAlbumsData } = useQuery({
    queryKey: ["saved-albums", albumName],
    queryFn: () => api.library.albums.list({ albumName, limit: 1 }),
    enabled: !!session?.user,
  });

  const [toggling, setToggling] = useState(false);

  const tracks = tracksData?.data ?? [];
  const firstTrack = tracks[0];
  const artist = firstTrack?.artists ?? "Unknown Artist";
  const coverUrl = firstTrack?.coverUrl;

  const totalMs = tracks.reduce((acc, t) => acc + t.durationMs, 0);
  const totalMin = Math.floor(totalMs / 60000);

  // Find the saved entry for this album (matched by album name)
  const savedEntry = savedAlbumsData?.data.find(
    (s) => s.album.name === albumName,
  );
  const isSaved = !!savedEntry;

  function handlePlayAll() {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  }

  async function handleToggleSave() {
    if (toggling) return;
    setToggling(true);
    try {
      if (isSaved && savedEntry) {
        queryClient.setQueryData(["saved-albums", albumName], (current: typeof savedAlbumsData | undefined) => {
          if (!current) return current;
          return {
            ...current,
            data: current.data.filter((item) => item.id !== savedEntry.id),
          };
        });
        await api.library.albums.unsave(savedEntry.albumId);
      } else {
        const matchingAlbums = await api.albums.list({ name: albumName, limit: 1 });
        const album = matchingAlbums.data[0];
        if (!album) {
          console.error("Album record not found in DB for name:", albumName);
          return;
        }
        queryClient.setQueryData(["saved-albums", albumName], (current: typeof savedAlbumsData | undefined) => {
          if (!current) {
            return {
              data: [{ id: "temp", userId: session?.user?.id ?? "", albumId: album.id, savedAt: new Date().toISOString(), album }],
              meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
            };
          }
          if (current.data.some((item) => item.albumId === album.id)) return current;
          return {
            ...current,
            data: [
              {
                id: "temp",
                userId: session?.user?.id ?? "",
                albumId: album.id,
                savedAt: new Date().toISOString(),
                album,
              },
              ...current.data,
            ],
            meta: {
              ...current.meta,
              total: current.meta.total + 1,
            },
          };
        });
        await api.library.albums.save(album.id);
      }
      queryClient.invalidateQueries({ queryKey: ["saved-albums"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-saved-albums"] });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ["saved-albums"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-saved-albums"] });
      throw error;
    } finally {
      setToggling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="w-full h-[400px] bg-surface animate-pulse" />
        <div className="px-6 md:px-10 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Album Header Block */}
      <div className="w-full h-[400px] relative overflow-hidden flex items-start md:items-end p-6 md:p-10">
        {coverUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-50 z-0"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent z-10" />

        <div className="relative z-20 flex flex-col md:flex-row items-start gap-6 w-full">
          <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-xl shadow-[0_0_40px_rgba(154,123,255,0.2)] overflow-hidden shrink-0 flex items-center justify-center">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={albumName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                <Play className="w-12 h-12 text-muted" />
              </div>
            )}
          </div>
          <div className="space-y-4 flex-1">
            <Typography
              variant="caption"
              className="uppercase font-bold tracking-widest text-accent flex items-center gap-2"
            >
              Album
            </Typography>
            <Typography
              variant="h1"
              className="text-white drop-shadow-md text-4xl md:text-6xl font-bold"
            >
              {albumName}
            </Typography>
            <div className="flex items-center gap-2 pt-3">
              <Typography variant="caption" className="font-semibold">
                {artist.split(";").map((a, i, arr) => (
                  <span key={i}>
                    <span
                      className="hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/artist/${encodeURIComponent(a.trim())}`);
                      }}
                    >
                      {a.trim()}
                    </span>
                    {i < arr.length - 1 && ", "}
                  </span>
                ))}
              </Typography>
              <Typography variant="caption" color="muted">
                &bull; {tracks.length} songs, {totalMin} min
              </Typography>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 md:px-10 flex items-center gap-4">
        <Button
          variant="default"
          size="icon"
          className="w-14 h-14 rounded-full shadow-[0_0_20px_rgba(250,88,182,0.4)]"
          onClick={handlePlayAll}
        >
          <Play className="fill-current w-6 h-6 ml-1" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-12 h-12 rounded-full border border-white/20"
          onClick={handleToggleSave}
          disabled={toggling || tracks.length === 0 || !session?.user}
          title={!session?.user ? "Sign in to save" : isSaved ? "Remove from library" : "Save to library"}
        >
          {toggling ? (
            <div className="w-5 h-5 border-2 border-muted border-t-transparent rounded-full animate-spin" />
          ) : (
            <Bookmark
              className={`w-6 h-6 transition-colors ${
                isSaved
                  ? "fill-accent text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            />
          )}
        </Button>
      </div>

      {/* Track List */}
      <div className="px-6 md:px-10">
        <div className="w-full border-b border-white/5 pb-2 mb-4 flex px-4">
          <Typography variant="caption" color="muted" className="w-12">
            #
          </Typography>
          <Typography variant="caption" color="muted" className="flex-1">
            Title
          </Typography>
          <Typography
            variant="caption"
            color="muted"
            className="w-12 flex justify-end"
          >
            <Clock className="w-4 h-4" />
          </Typography>
        </div>

        <div className="space-y-1">
          {tracks.map((track, i) => (
            <TrackListItem
              key={track.id}
              track={track}
              index={i}
              queue={tracks}
              showCover={false}
            />
          ))}
        </div>

        {tracks.length === 0 && (
          <div className="py-12 text-center">
            <Typography variant="body" color="muted">
              No tracks found for this album
            </Typography>
          </div>
        )}
      </div>
    </div>
  );
}
