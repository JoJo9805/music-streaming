"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Clock, Disc3, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Typography } from "@/components/ui/Typography";
import { api } from "@/lib/api";
import { usePlayerStore } from "@/stores/playerStore";

function formatDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function splitArtistNames(artists: string): string[] {
  return artists
    .split(";")
    .map((artist) => artist.trim())
    .filter(Boolean);
}

export default function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const { data: track, isLoading } = useQuery({
    queryKey: ["track", id],
    queryFn: () => api.tracks.get(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-8 p-6 md:p-10">
        <div className="h-64 rounded-2xl bg-surface animate-pulse" />
        <div className="h-24 rounded-xl bg-surface animate-pulse" />
      </div>
    );
  }

  if (!track) {
    return (
      <div className="p-6 md:p-10">
        <Typography variant="h2">Track not found</Typography>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="relative flex min-h-[22rem] w-full items-end overflow-hidden p-6 md:p-10">
        {track.coverUrl ? (
          <img
            src={track.coverUrl}
            alt={track.trackName}
            className="absolute inset-0 h-full w-full object-cover opacity-45 blur-2xl"
          />
        ) : (
          <div className="absolute inset-0 bg-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/20" />

        <div className="relative z-10 flex w-full flex-col gap-6 sm:flex-row sm:items-end">
          <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface shadow-[0_0_40px_rgba(154,123,255,0.2)]">
            {track.coverUrl ? (
              <img
                src={track.coverUrl}
                alt={track.trackName}
                className="h-full w-full object-cover"
              />
            ) : (
              <Disc3 className="h-14 w-14 text-muted" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <Typography variant="caption" className="font-bold uppercase tracking-widest text-accent">
              Track
            </Typography>
            <Typography variant="h1" className="break-words text-4xl font-bold text-white md:text-6xl">
              {track.trackName}
            </Typography>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {splitArtistNames(track.artists).map((artist, index, artists) => (
                <span key={artist}>
                  <Link
                    href={`/artist/${encodeURIComponent(artist)}`}
                    className="font-semibold text-foreground hover:text-accent hover:underline"
                  >
                    {artist}
                  </Link>
                  {index < artists.length - 1 && ","}
                </span>
              ))}
              <span>&bull;</span>
              <Link
                href={`/album/${encodeURIComponent(track.albumName)}`}
                className="hover:text-accent hover:underline"
              >
                {track.albumName}
              </Link>
              <span>&bull;</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(track.durationMs)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 md:px-10">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-[0_0_20px_rgba(250,88,182,0.4)]"
          onClick={() => playTrack(track, [track])}
          aria-label={`Play ${track.trackName}`}
        >
          <Play className="ml-1 h-6 w-6 fill-current" />
        </Button>
      </div>
    </div>
  );
}
