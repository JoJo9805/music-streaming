"use client";

import { use, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { GlassWindow } from "@/components/ui/GlassWindow";
import { TrackListItem } from "@/components/ui/TrackListItem";
import { PlaylistModal } from "@/components/ui/PlaylistModal";
import { Play, Pencil, Trash2, Clock, Sparkles } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { api } from "@/lib/api";

export default function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: playlist, isLoading } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => api.playlists.get(id),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; coverUrl: string; privacy: "PUBLIC" | "PRIVATE" }) =>
      api.playlists.update(id, {
        name: data.name,
        description: data.description || undefined,
        coverUrl: data.coverUrl || null,
        privacy: data.privacy,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", id] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.playlists.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
      router.push("/library");
    },
  });

  const tracks = playlist?.tracks.map((pt) => pt.track) ?? [];

  function handlePlayAll() {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="w-full h-[400px] bg-surface animate-pulse" />
        <div className="px-6 md:px-10 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full">
        <Typography variant="h2" color="muted">
          Playlist not found
        </Typography>
      </div>
    );
  }

  const totalMs = tracks.reduce((acc, t) => acc + t.durationMs, 0);
  const totalMin = Math.floor(totalMs / 60000);
  const totalHr = Math.floor(totalMin / 60);
  const remainMin = totalMin % 60;
  const durationText = totalHr > 0 ? `${totalHr} hr ${remainMin} min` : `${totalMin} min`;

  const isOwner = session?.user?.id === playlist.userId;

  return (
    <div className="space-y-8 pb-10">
      {/* Playlist Header Block */}
      <div className="w-full h-[400px] relative overflow-hidden flex items-start md:items-end p-6 md:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 via-background to-background z-0" />

        <div className="relative z-20 flex flex-col md:flex-row items-start gap-6 w-full">
          <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-xl shadow-[0_0_40px_rgba(154,123,255,0.2)] overflow-hidden shrink-0 flex items-center justify-center">
            {playlist.coverUrl ? (
              <img
                src={playlist.coverUrl}
                alt={playlist.name}
                className="w-full h-full object-cover"
      />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center">
                <Sparkles className="w-24 h-24 text-white opacity-50" />
              </div>
            )}
          </div>
          <div className="space-y-4 flex-1">
            <Typography
              variant="caption"
              className="uppercase font-bold tracking-widest text-accent flex items-center gap-2"
            >
              Playlist
            </Typography>
            <Typography
              variant="h1"
              className="text-white drop-shadow-md text-4xl md:text-6xl font-bold"
            >
              {playlist.name}
            </Typography>
            {playlist.description && (
              <Typography variant="body" className="text-white/80 max-w-2xl">
                {playlist.description}
              </Typography>
            )}
            <div className="flex items-center gap-2">
              <Typography variant="caption" className="font-semibold">
                {playlist.user.name ?? "User"}
              </Typography>
              <Typography variant="caption" color="muted">
                &bull; {tracks.length} songs, {durationText}
              </Typography>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 md:px-10 flex items-center gap-4">
        <Button
          variant="default"
          size="icon"
          className="w-14 h-14 rounded-full shadow-[0_0_20px_rgba(250,88,182,0.4)]"
          onClick={handlePlayAll}
        >
          <Play className="fill-current w-6 h-6 ml-1" />
        </Button>
        {isOwner && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="w-12 h-12 rounded-full border border-white/20"
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-5 h-5 text-muted hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-12 h-12"
              onClick={() => setDeleting(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-5 h-5 text-red-400 hover:text-red-300" />
            </Button>
          </>
        )}
      </div>

      {/* Edit Playlist Modal */}
      <PlaylistModal
        open={editing}
        onClose={() => setEditing(false)}
        onSave={(data) => updateMutation.mutate(data)}
        isSaving={updateMutation.isPending}
        initialName={playlist.name}
        initialDescription={playlist.description ?? ""}
        initialCoverUrl={playlist.coverUrl ?? ""}
        initialPrivacy={playlist.privacy as "PUBLIC" | "PRIVATE"}
      />

      {/* Delete Confirmation — portaled to document.body to escape overflow clipping */}
      {deleting && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleting(false)} />
          <GlassWindow intensity="medium" className="relative z-10 w-full max-w-sm p-6 space-y-4" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
            <Typography variant="h3" id="delete-dialog-title">Delete Playlist?</Typography>
            <Typography variant="body" color="muted">
              This will permanently delete &ldquo;{playlist.name}&rdquo; and all its tracks.
            </Typography>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                className="bg-red-500 hover:bg-red-600"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </GlassWindow>
        </div>,
        document.body
      )}

      {/* Track List */}
      <div className="px-6 md:px-10">
        <div className="w-full border-b border-white/5 pb-2 mb-4 flex px-4">
          <Typography variant="caption" color="muted" className="w-12">
            #
          </Typography>
          <Typography variant="caption" color="muted" className="flex-1">
            Title
          </Typography>
          <Typography
            variant="caption"
            color="muted"
            className="hidden md:block flex-1"
          >
            Album
          </Typography>
          <Typography
            variant="caption"
            color="muted"
            className="w-12 flex justify-end"
          >
            <Clock className="w-4 h-4" />
          </Typography>
        </div>

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

        {tracks.length === 0 && (
          <div className="py-12 text-center">
            <Typography variant="body" color="muted">
              This playlist is empty
            </Typography>
          </div>
        )}
      </div>
    </div>
  );
}
