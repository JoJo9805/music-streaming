"use client";

import { useLibraryStore } from "@/stores/libraryStore";

export function useTrackLike(trackId?: string) {
  const isLiked = useLibraryStore((s) => (trackId ? s.isLiked(trackId) : false));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  return {
    isLiked,
    toggleLike: () => {
      if (trackId) void toggleLike(trackId);
    },
  };
}
