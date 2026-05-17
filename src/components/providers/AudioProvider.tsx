"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { api } from "@/lib/api";

export function AudioProvider() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);

  const setProgress = usePlayerStore((s) => s.setProgress);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const nextTrack = usePlayerStore((s) => s.nextTrack);

  const seekRequested = useRef<number | null>(null);

  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state, prev) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (
        state.progress !== prev.progress &&
        Math.abs(audio.currentTime - state.progress) > 1.5
      ) {
        seekRequested.current = state.progress;
        audio.currentTime = state.progress;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const url = api.tracks.streamUrl(currentTrack.id);
    if (audio.src !== new URL(url, window.location.origin).href) {
      audio.src = url;
      audio.load();
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (seekRequested.current !== null) {
      seekRequested.current = null;
      return;
    }
    setProgress(audio.currentTime);
  }, [setProgress]);

  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  }, [setDuration]);

  const onEnded = useCallback(() => {
    const state = usePlayerStore.getState();
    if (state.repeat === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      usePlayerStore.setState({ progress: 0 });
    } else {
      const prevTrackId = state.currentTrack?.id;
      nextTrack();
      const newState = usePlayerStore.getState();
      if (newState.currentTrack?.id === prevTrackId && newState.isPlaying) {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      }
    }
  }, [nextTrack]);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      onTimeUpdate={onTimeUpdate}
      onLoadedMetadata={onLoadedMetadata}
      onEnded={onEnded}
      style={{ display: "none" }}
    />
  );
}
