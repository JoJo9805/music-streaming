"use client";

import { useState } from "react";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Play, Pause, Heart, Plus } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { useTrackLike } from "@/hooks/useTrackLike";
import { useSession } from "next-auth/react";
import { AddToPlaylistModal } from "@/components/ui/AddToPlaylistModal";
import type { Track } from "@/types/api";
import Link from "next/link";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TrackListItemProps {
  track: Track;
  index: number;
  queue?: Track[];
  showAlbum?: boolean;
  showCover?: boolean;
}

export function TrackListItem({
  track,
  index,
  queue,
  showAlbum = false,
  showCover = true,
}: TrackListItemProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const { data: session } = useSession();
  const { isLiked, toggleLike } = useTrackLike(track.id);

  const [addModalOpen, setAddModalOpen] = useState(false);

  const isCurrentTrack = currentTrack?.id === track.id;

  function handlePlay() {
    if (isCurrentTrack) {
      togglePlay();
    } else {
      playTrack(track, queue);
    }
  }

  return (
    <>
      <div
        className={`flex items-center px-4 py-3 hover:bg-surface-hover rounded-md cursor-pointer group transition-colors ${
          isCurrentTrack ? "bg-white/5" : ""
        }`}
        onClick={handlePlay}
        role="button"
        tabIndex={0}
        aria-label={`Play ${track.trackName}`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePlay(); } }}
      >
        <div className="w-12 flex items-center justify-center">
          <Typography
            variant="caption"
            color="muted"
            className={`group-hover:hidden ${isCurrentTrack ? "text-accent" : ""}`}
          >
            {index + 1}
          </Typography>
          <div className="hidden group-hover:flex">
            {isCurrentTrack && isPlaying ? (
              <Pause className="w-4 h-4 fill-current text-foreground" />
            ) : (
              <Play className="w-4 h-4 fill-current text-foreground" />
            )}
          </div>
        </div>

        <div className="flex-1 flex gap-3 items-center min-w-0">
          {showCover && (
            <div className="hidden sm:block w-10 h-10 rounded-md bg-surface overflow-hidden shrink-0">
              {track.coverUrl ? (
                <img
                  src={track.coverUrl}
                  alt={track.trackName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-surface" />
              )}
            </div>
          )}
          <div className="min-w-0">
            <Typography
              variant="body"
              className={`font-medium truncate ${isCurrentTrack ? "text-accent" : ""}`}
            >
              {track.trackName}
            </Typography>
            <Typography variant="caption" color="muted" className="truncate flex gap-1">
              {track.artists.split(";").map((artist, i, arr) => (
                <span key={i}>
                  <Link
                    href={`/artist/${encodeURIComponent(artist.trim())}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {artist.trim()}
                  </Link>
                  {i < arr.length - 1 && ", "}
                </span>
              ))}
            </Typography>
          </div>
        </div>

        {showAlbum && (
          <Link
            href={`/album/${encodeURIComponent(track.albumName)}`}
            className="hidden md:flex flex-1 line-clamp-1 px-4 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Typography variant="caption" color="muted" className="line-clamp-1 hover:underline">
              {track.albumName}
            </Typography>
          </Link>
        )}

        {session?.user && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setAddModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4 text-muted hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity mr-2"
              onClick={(e) => {
                e.stopPropagation();
                toggleLike();
              }}
            >
              <Heart
                className={`w-4 h-4 ${
                  isLiked
                    ? "text-accent fill-accent"
                    : "text-muted hover:text-foreground"
                }`}
              />
            </Button>
          </>
        )}

        <Typography variant="caption" color="muted" className="w-12 text-right">
          {formatDuration(track.durationMs)}
        </Typography>
      </div>

      <AddToPlaylistModal
        trackId={track.id}
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </>
  );
}
