"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { PlaylistModal } from "@/components/ui/PlaylistModal";
import { Bot, PlayCircle, Library, Menu, Music2, Search, Plus, X, Disc3 } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { api } from "@/lib/api";
import type { Playlist, SavedAlbum } from "@/types/api";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; coverUrl: string; privacy: "PUBLIC" | "PRIVATE" }) =>
      api.playlists.create({
        name: data.name,
        description: data.description || undefined,
        coverUrl: data.coverUrl || undefined,
        privacy: data.privacy,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
      setCreatingPlaylist(false);
    },
  });

  const { data: playlistsData } = useQuery({
    queryKey: ["sidebar-playlists"],
    queryFn: () => api.playlists.list({ limit: 20 }),
    enabled: !!session?.user,
  });

  const { data: savedAlbumsData } = useQuery({
    queryKey: ["sidebar-saved-albums"],
    queryFn: () => api.library.albums.list({ limit: 20 }),
    enabled: !!session?.user,
  });

  const userPlaylists = playlistsData?.data.filter(
    (p: Playlist) => p.userId === session?.user?.id,
  );

  const savedAlbums = savedAlbumsData?.data ?? [];

  function isActive(path: string) {
    return pathname === path;
  }

  const navigationContent = (
    <>
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-24 pt-4">
        <Link href="/" onClick={() => setIsMobileOpen(false)}>
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 ${isActive("/") ? "bg-white/10" : ""}`}
          >
            <PlayCircle className="w-5 h-5 text-accent" /> Listen Now
          </Button>
        </Link>
        <Link href="/search" onClick={() => setIsMobileOpen(false)}>
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 ${isActive("/search") ? "bg-white/10" : ""}`}
          >
            <Search className="w-5 h-5 text-accent" /> Browse
          </Button>
        </Link>
        <Link href="/library" onClick={() => setIsMobileOpen(false)}>
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 ${isActive("/library") ? "bg-white/10" : ""}`}
          >
            <Library className="w-5 h-5 text-accent" /> Library
          </Button>
        </Link>
        <Link href="/chatbot" onClick={() => setIsMobileOpen(false)}>
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 ${isActive("/chatbot") ? "bg-white/10" : ""}`}
          >
            <Bot className="w-5 h-5 text-accent" /> Chatbot
          </Button>
        </Link>

        <div className="my-4 border-t border-white/5" />

        {session?.user && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <Typography variant="caption" color="muted" className="text-xs uppercase tracking-wider font-semibold">
                Playlists
              </Typography>
              <button
                type="button"
                aria-label="New playlist"
                onClick={() => setCreatingPlaylist(true)}
              >
                <Plus className="w-4 h-4 text-muted hover:text-foreground transition-colors cursor-pointer" />
              </button>
            </div>
            {userPlaylists?.map((playlist: Playlist) => (
              <Link
                href={`/playlist/${playlist.id}`}
                key={playlist.id}
                className="w-full flex items-center gap-3 overflow-hidden"
                onClick={() => setIsMobileOpen(false)}
              >
                <span className={`flex items-center gap-3 w-full truncate py-2 px-3 rounded-full text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground transition-colors ${
                    pathname === `/playlist/${playlist.id}` ? "bg-white/10 text-foreground" : ""
                  }`}
                >
                  {playlist.coverUrl ? (
                    <img
                      src={playlist.coverUrl}
                      alt={playlist.name}
                      className="w-6 h-6 rounded shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded shrink-0 bg-gradient-to-tr from-accent/40 to-purple-600/40" />
                  )}
                  <span className="truncate">{playlist.name}</span>
                </span>
              </Link>
            ))}
            {userPlaylists?.length === 0 && (
              <Typography variant="caption" color="muted" className="px-2 text-xs">
                No playlists yet
              </Typography>
            )}
          </div>
        )}

        {session?.user && savedAlbums.length > 0 && (
          <div className="space-y-1 mt-4">
            <div className="flex items-center justify-between px-2 mb-2">
              <Typography variant="caption" color="muted" className="text-xs uppercase tracking-wider font-semibold">
                Saved Albums
              </Typography>
            </div>
            {savedAlbums.map((saved: SavedAlbum) => (
              <Link
                href={`/album/${encodeURIComponent(saved.album.name)}`}
                key={saved.id}
                className="w-full flex items-center gap-3 overflow-hidden"
                onClick={() => setIsMobileOpen(false)}
              >
                <span className={`flex items-center gap-3 w-full truncate py-2 px-3 rounded-full text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground transition-colors ${
                    pathname === `/album/${encodeURIComponent(saved.album.name)}` ? "bg-white/10 text-foreground" : ""
                  }`}
                >
                  {saved.album.coverUrl ? (
                    <img
                      src={saved.album.coverUrl}
                      alt={saved.album.name}
                      className="w-6 h-6 rounded shrink-0 object-cover"
                    />
                  ) : (
                    <Disc3 className="w-4 h-4 shrink-0 text-muted" />
                  )}
                  <span className="truncate">{saved.album.name}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-white/5">
        <UserMenu />
      </div>

      <PlaylistModal
        mode="create"
        open={creatingPlaylist}
        onClose={() => setCreatingPlaylist(false)}
        onSave={(data) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
      />
    </>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[65] flex h-16 items-center justify-between border-b border-white/5 bg-background/90 px-4 backdrop-blur-md md:hidden">
        <Link href="/" className="min-w-0">
          <Typography variant="h4" className="flex items-center gap-2 truncate">
            <Music2 className="h-6 w-6 shrink-0 text-accent" />
            MelodyMix
          </Typography>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((open) => !open)}
        >
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[70] flex w-72 max-w-[82vw] flex-col border-r border-white/10 bg-surface shadow-2xl transition-transform duration-300 md:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
          <Link href="/" onClick={() => setIsMobileOpen(false)}>
            <Typography variant="h4" className="flex items-center gap-2">
              <Music2 className="h-6 w-6 text-accent" />
              MelodyMix
            </Typography>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        {navigationContent}
      </aside>

      <aside className="w-64 bg-surface border-r border-white/5 hidden md:flex flex-col">
        <div className="p-6">
          <Link href="/" onClick={() => setIsMobileOpen(false)}>
            <Typography variant="h3" className="flex items-center gap-2">
              <Music2 className="w-6 h-6 text-accent" />
              MelodyMix
            </Typography>
          </Link>
        </div>
        {navigationContent}
      </aside>
    </>
  );
}
