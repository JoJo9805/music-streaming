"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface LibraryState {
  likedTrackIds: Set<string>;
  loaded: boolean;
}

interface LibraryActions {
  fetchLikedIds: () => Promise<void>;
  toggleLike: (trackId: string) => Promise<void>;
  isLiked: (trackId: string) => boolean;
  reset: () => void;
}

export const useLibraryStore = create<LibraryState & LibraryActions>(
  (set, get) => ({
    likedTrackIds: new Set(),
    loaded: false,

    fetchLikedIds: async () => {
      try {
        const PAGE_SIZE = 100;
        let page = 1;
        const allIds: string[] = [];

        while (true) {
          const res = await api.library.list({ page, limit: PAGE_SIZE });
          allIds.push(...res.data.map((item) => item.trackId));
          if (page >= res.meta.totalPages) break;
          page++;
        }

        set({ likedTrackIds: new Set(allIds), loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    toggleLike: async (trackId: string) => {
      const { likedTrackIds } = get();
      const wasLiked = likedTrackIds.has(trackId);
      const previous = new Set(likedTrackIds);

      const next = new Set(likedTrackIds);
      if (wasLiked) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      set({ likedTrackIds: next });

      try {
        if (wasLiked) {
          await api.library.remove(trackId);
        } else {
          await api.library.add(trackId);
        }
        queryClient.invalidateQueries({ queryKey: ["library"] });
      } catch {
        set({ likedTrackIds: previous });
      }
    },

    isLiked: (trackId: string) => get().likedTrackIds.has(trackId),

    reset: () => set({ likedTrackIds: new Set(), loaded: false }),
  }),
);
