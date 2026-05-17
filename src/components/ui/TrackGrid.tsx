"use client";

import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Play } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import type { Track } from "@/types/api";
import Link from "next/link";

interface TrackGridProps {
  tracks: Track[];
}

export function TrackGrid({ tracks }: TrackGridProps) {
  const playTrack = usePlayerStore((s) => s.playTrack);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      {tracks.map((track) => (
        <div key={track.id} className="space-y-3 cursor-pointer group transition-transform duration-200 hover:scale-[1.03]">
          <div
            className="aspect-square rounded-xl bg-surface overflow-hidden relative shadow-lg"
            onClick={() => playTrack(track, tracks)}
          >
            {track.coverUrl ? (
              <img
                src={track.coverUrl}
                alt={track.trackName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center">
                <Play className="w-10 h-10 text-muted" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                variant="default"
                size="icon"
                className="rounded-full h-12 w-12 hover:scale-110 shadow-xl transition-transform"
              >
                <Play className="fill-current w-5 h-5 ml-1" />
              </Button>
            </div>
          </div>
          <div>
            <Typography
              variant="caption"
              className="block truncate font-semibold"
            >
              {track.trackName}
            </Typography>
            <Typography
              variant="caption"
              color="muted"
              className="block truncate text-xs"
            >
              {track.artists.split(";").map((a, i, arr) => (
                <span key={i}>
                  <Link
                    href={`/artist/${encodeURIComponent(a.trim())}`}
                    className="hover:underline"
                  >
                    {a.trim()}
                  </Link>
                  {i < arr.length - 1 && ", "}
                </span>
              ))}
            </Typography>
          </div>
        </div>
      ))}
    </div>
  );
}
