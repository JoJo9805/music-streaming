"use client";

import { useCallback, useRef, useState } from "react";
import { GlassWindow } from "@/components/ui/GlassWindow";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Plus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { useTrackLike } from "@/hooks/useTrackLike";
import { useSession } from "next-auth/react";
import { AddToPlaylistModal } from "@/components/ui/AddToPlaylistModal";
import Link from "next/link";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BottomPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const { data: session } = useSession();
  const { isLiked, toggleLike } = useTrackLike(currentTrack?.id);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current;
      if (!bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(pct * duration);
    },
    [duration, seek],
  );

  const handleVolumeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = volumeBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setVolume(pct);
    },
    [setVolume],
  );

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-2 md:bottom-6 md:left-[17rem] md:right-6 md:px-0 md:pb-0 pointer-events-none">
      <GlassWindow
        intensity="medium"
        className="pointer-events-auto h-18 min-h-18 md:h-24 w-full max-w-7xl mx-auto md:max-w-none md:mx-0 flex items-center justify-between gap-3 px-3 md:px-8 border-t-0 md:rounded-2xl shadow-2xl"
      >
        {/* Song Info */}
        <div className="flex min-w-0 flex-1 items-center gap-3 md:w-1/4 md:min-w-[200px] md:gap-4">
          <div className="hidden md:block w-14 h-14 rounded-md bg-surface overflow-hidden shadow-md">
            {currentTrack?.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.trackName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-surface flex items-center justify-center">
                <Play className="w-6 h-6 text-muted" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col max-md:rounded-xl max-md:border max-md:border-white/10 max-md:bg-background/70 max-md:px-3 max-md:py-2 max-md:shadow-[0_12px_28px_rgba(0,0,0,0.35)] max-md:backdrop-blur-md">
            {currentTrack ? (
              <Link href={`/album/${encodeURIComponent(currentTrack.albumName)}`} className="hover:underline">
                <Typography
                  variant="caption"
                  className="line-clamp-1 text-base font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                >
                  {currentTrack.trackName}
                </Typography>
              </Link>
            ) : (
              <Typography
                variant="caption"
                className="line-clamp-1 text-base font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
              >
                Not Playing
              </Typography>
            )}
            {currentTrack && (
              <span className="line-clamp-1 text-xs text-foreground/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                {currentTrack.artists.split(";").map((artist, i, arr) => (
                  <span key={artist.trim()}>
                    <Link
                      href={`/artist/${encodeURIComponent(artist.trim())}`}
                      className="hover:underline"
                    >
                      {artist.trim()}
                    </Link>
                    {i < arr.length - 1 && ", "}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-none flex-col items-center justify-center px-0 md:flex-1 md:max-w-2xl md:px-4">
          <div className="flex items-center gap-2 md:gap-6">
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={toggleShuffle}
              aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
            >
              <Shuffle
                className={`w-4 h-4 ${shuffle ? "text-accent" : "text-muted hover:text-foreground"}`}
              />
            </Button>
            {session?.user && currentTrack && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleLike(); }}
                  className="md:hidden text-muted hover:text-foreground transition-colors"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      isLiked
                        ? "text-accent fill-accent"
                        : ""
                    }`}
                  />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setAddModalOpen(true); }}
                  className="md:hidden text-muted hover:text-foreground transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10" onClick={prevTrack} aria-label="Previous track">
              <SkipBack className="h-5 w-5 fill-foreground md:h-6 md:w-6" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-11 w-11 bg-foreground text-background hover:bg-foreground/90 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.2)] md:h-12 md:w-12"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current md:h-6 md:w-6" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-current md:ml-1 md:h-6 md:w-6" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10" onClick={nextTrack} aria-label="Next track">
              <SkipForward className="h-5 w-5 fill-foreground md:h-6 md:w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={toggleRepeat}
              aria-label={repeat === "off" ? "Enable repeat" : repeat === "one" ? "Disable repeat" : "Repeat one"}
            >
              <RepeatIcon
                className={`w-4 h-4 ${repeat !== "off" ? "text-accent" : "text-muted hover:text-foreground"}`}
              />
            </Button>
          </div>
          {/* Progress Bar */}
          <div className="hidden md:flex items-center gap-3 w-full mt-2">
            <Typography variant="caption" className="text-[10px] text-muted w-10 text-right">
              {formatTime(progress)}
            </Typography>
            <div
              ref={progressBarRef}
              className="h-1.5 flex-1 bg-white/20 rounded-full overflow-hidden cursor-pointer group"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-foreground rounded-full group-hover:bg-accent transition-colors relative"
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full opacity-0 group-hover:opacity-100" />
              </div>
            </div>
            <Typography variant="caption" className="text-[10px] text-muted w-10">
              {formatTime(duration)}
            </Typography>
          </div>
        </div>

        {/* Right Tools */}
        <div className="hidden md:flex items-center justify-end gap-3 w-1/4 min-w-[200px]">
          {session?.user && currentTrack && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleLike()}
                aria-label={isLiked ? "Unlike track" : "Like track"}
              >
                <Heart
                  className={`w-5 h-5 transition-colors ${
                    isLiked
                      ? "text-accent fill-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAddModalOpen(true)}
                aria-label="Add to playlist"
              >
                <Plus className="w-5 h-5 text-muted hover:text-foreground" />
              </Button>
            </>
          )}
          <div className="flex items-center gap-2 w-28">
            <button
              onClick={toggleMute}
              className="text-muted hover:text-foreground transition-colors"
              aria-label={volume === 0 ? "Unmute" : "Mute"}
            >
              {volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <div
              ref={volumeBarRef}
              className="h-1.5 flex-1 bg-white/20 rounded-full overflow-hidden cursor-pointer"
              onClick={handleVolumeClick}
            >
              <div
                className="h-full bg-white rounded-full"
                style={{ width: `${volume * 100}%` }}
              />
            </div>
          </div>
        </div>
      </GlassWindow>

      {currentTrack && (
        <AddToPlaylistModal
          trackId={currentTrack.id}
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
        />
      )}
    </div>
  );
}
