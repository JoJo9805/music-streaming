"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrackListItem } from "@/components/ui/TrackListItem";
import { Typography } from "@/components/ui/Typography";
import { Disc3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";

export default function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const decodedName = decodeURIComponent(id);

  const { data: artist, isLoading: isLoadingArtist } = useQuery({
    queryKey: ["artist", decodedName],
    queryFn: () => api.artists.get(decodedName).catch(() => null),
  });

  const { data: tracksData, isLoading } = useQuery({
    queryKey: ["artist-tracks", decodedName],
    queryFn: () => api.tracks.list({ artist: decodedName, limit: 50 }),
  });

  const tracks = tracksData?.data ?? [];

  if (!isLoading && !isLoadingArtist && tracks.length === 0 && !artist) {
    notFound();
  }

  const albumNames = [...new Set(tracks.map((t) => t.albumName))];
  const albums = albumNames.map((name) => {
    const t = tracks.find((tr) => tr.albumName === name);
    return { name, coverUrl: t?.coverUrl };
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      {/* Artist Header */}
      <div className="relative h-64 md:h-80 w-full flex items-end p-6 md:p-10 shrink-0">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent z-10" />
        {artist?.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt={decodedName}
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-surface" />
        )}

        <div className="relative z-20 flex gap-6 items-end">
          {artist?.imageUrl ? (
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden shadow-2xl border-4 border-background/20 hidden sm:block">
              <img
                src={artist.imageUrl}
                alt={decodedName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-surface-hover shadow-2xl flex items-center justify-center hidden sm:flex">
              <Disc3 className="w-16 h-16 text-muted opacity-50" />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Typography
              variant="caption"
              className="uppercase tracking-widest text-accent font-semibold"
            >
              Artist
            </Typography>
            <Typography
              variant="h1"
              className="text-4xl md:text-6xl font-black text-white drop-shadow-md"
            >
              {decodedName}
            </Typography>
            {artist?.bio && (
              <Typography
                variant="body"
                color="muted"
                className="line-clamp-2 max-w-2xl mt-2"
              >
                {artist.bio}
              </Typography>
            )}
            <Typography variant="caption" color="muted" className="mt-1">
              {tracks.length} tracks
              {artist?.nbFan != null &&
                ` · ${artist.nbFan.toLocaleString()} fans`}
            </Typography>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="flex-1 px-6 md:px-10 pb-20 space-y-12">
        <section className="space-y-4">
          <Typography variant="h3" className="font-bold">
            Popular
          </Typography>
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
          {tracks.length === 0 && !isLoading && (
            <Typography variant="body" color="muted">
              No tracks found for this artist
            </Typography>
          )}
        </section>

        {/* Albums */}
        {albums.length > 0 && (
          <section className="space-y-6">
            <Typography variant="h3" className="font-bold">
              Albums
            </Typography>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {albums.map((album) => (
                <Link
                  href={`/album/${encodeURIComponent(album.name)}`}
                  key={album.name}
                  className="space-y-3 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]"
                >
                  <div className="aspect-square rounded-xl bg-surface overflow-hidden relative shadow-lg">
                    {album.coverUrl ? (
                      <img
                        src={album.coverUrl}
                        alt={album.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20" />
                    )}
                  </div>
                  <div>
                    <Typography
                      variant="caption"
                      className="block truncate font-semibold"
                    >
                      {album.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="muted"
                      className="block truncate text-xs"
                    >
                      Album
                    </Typography>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
