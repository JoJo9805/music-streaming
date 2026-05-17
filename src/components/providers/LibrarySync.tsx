"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLibraryStore } from "@/stores/libraryStore";

export function LibrarySync() {
  const { data: session } = useSession();
  const fetchLikedIds = useLibraryStore((s) => s.fetchLikedIds);
  const reset = useLibraryStore((s) => s.reset);
  const loaded = useLibraryStore((s) => s.loaded);

  useEffect(() => {
    if (session?.user && !loaded) {
      fetchLikedIds();
    } else if (!session?.user) {
      reset();
    }
  }, [session, loaded, fetchLikedIds, reset]);

  return null;
}
