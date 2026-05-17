"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { GlassWindow } from "@/components/ui/GlassWindow";
import { Plus, X, Check, Minus } from "lucide-react";
import { api } from "@/lib/api";
import type { Playlist } from "@/types/api";

interface Props {
  trackId: string;
  open: boolean;
  onClose: () => void;
}

export function AddToPlaylistModal({ trackId, open, onClose }: Props) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addedPlaylists, setAddedPlaylists] = useState<Set<string>>(new Set());
  const [removedPlaylists, setRemovedPlaylists] = useState<Set<string>>(new Set());

  const { data: playlistsData } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => api.playlists.list({ limit: 50 }),
    enabled: open && !!session?.user,
  });

  const userPlaylists =
    playlistsData?.data.filter((p: Playlist) => p.userId === session?.user?.id) ?? [];

  // Check which playlists already contain this track
  const { data: containingIds } = useQuery({
    queryKey: ["playlists-containing", trackId],
    queryFn: async () => {
      const res = await api.playlists.containing(trackId);
      return new Set(res.data);
    },
    enabled: open && !!session?.user,
  });

  // Close modal on route change (browser back/forward)
  useEffect(() => {
    if (open) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local state when modal opens
  useEffect(() => {
    if (open) {
      setAddedPlaylists(new Set());
      setRemovedPlaylists(new Set());
      setNewName("");
    }
  }, [open]);

  const addMutation = useMutation({
    mutationFn: (playlistId: string) => api.playlists.addTrack(playlistId, trackId),
    onMutate: async (playlistId) => {
      setAddedPlaylists((prev) => new Set(prev).add(playlistId));
      setRemovedPlaylists((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
      return { playlistId };
    },
    onSuccess: (_data, playlistId) => {
      queryClient.invalidateQueries({ queryKey: ["playlists-containing", trackId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist"] });
    },
    onError: (_error, playlistId) => {
      setAddedPlaylists((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (playlistId: string) => api.playlists.removeTrack(playlistId, trackId),
    onMutate: async (playlistId) => {
      setRemovedPlaylists((prev) => new Set(prev).add(playlistId));
      setAddedPlaylists((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
      return { playlistId };
    },
    onSuccess: (_data, playlistId) => {
      queryClient.invalidateQueries({ queryKey: ["playlists-containing", trackId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist"] });
    },
    onError: (_error, playlistId) => {
      setRemovedPlaylists((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
    },
  });

  function isInPlaylist(playlistId: string): boolean {
    const serverHas = containingIds?.has(playlistId) ?? false;
    if (removedPlaylists.has(playlistId)) return false;
    if (addedPlaylists.has(playlistId)) return true;
    return serverHas;
  }

  function isBusy(playlistId: string): boolean {
    return addMutation.isPending || removeMutation.isPending;
  }

  async function handleCreateAndAdd() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const playlist = await api.playlists.create({ name });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
      addMutation.mutate(playlist.id);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  function handleClose(e?: React.MouseEvent) {
    e?.stopPropagation();
    onClose();
  }

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-auto" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <GlassWindow
        intensity="medium"
        className="relative z-10 w-full max-w-sm p-6 space-y-4 max-h-[80vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add to Playlist"
      >
        <div className="flex items-center justify-between">
          <Typography variant="h3">Add to Playlist</Typography>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name"
            className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
          />
          <Button
            variant="default"
            size="sm"
            className="rounded-lg shrink-0"
            onClick={handleCreateAndAdd}
            disabled={creating || !newName.trim()}
          >
            <Plus className="w-4 h-4 mr-1" /> Create
          </Button>
        </div>

        <div className="space-y-1">
          {userPlaylists.map((p: Playlist) => {
            const added = isInPlaylist(p.id);
            const busy = isBusy(p.id);
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (busy) return;
                  if (added) {
                    removeMutation.mutate(p.id);
                  } else {
                    addMutation.mutate(p.id);
                  }
                }}
                disabled={busy}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-md bg-surface shrink-0 flex items-center justify-center overflow-hidden">
                  {p.coverUrl ? (
                    <img src={p.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-accent/30 to-purple-600/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Typography variant="caption" className="block truncate font-medium">
                    {p.name}
                  </Typography>
                  <Typography variant="caption" color="muted" className="text-xs">
                    {p._count?.tracks ?? 0} tracks
                  </Typography>
                </div>
                {busy ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                ) : added ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Check className="w-4 h-4 text-green-400" />
                    <Minus className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ) : (
                  <Plus className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {userPlaylists.length === 0 && (
          <Typography variant="caption" color="muted" className="text-center py-4 block">
            No playlists yet. Create one above!
          </Typography>
        )}
      </GlassWindow>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
