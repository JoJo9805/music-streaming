"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Calendar, ListMusic, Heart } from "lucide-react";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { GlassWindow } from "@/components/ui/GlassWindow";
import { api } from "@/lib/api";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "loading" && !session?.user) {
      router.push("/login");
    }
  }, [status, session?.user, router]);

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.profile.get(),
    enabled: !!session?.user,
  });

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setImage(profile.image ?? "");
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: api.profile.update,
    onMutate: async (next) => {
      setFormError(null);
      setSaveMessage(null);
      await queryClient.cancelQueries({ queryKey: ["profile"] });
      const previous = queryClient.getQueryData(["profile"]);
      queryClient.setQueryData(["profile"], (old: typeof profile) => {
        if (!old) return old;
        return {
          ...old,
          name: next.name ?? old.name,
          image: next.image === undefined ? old.image : next.image,
        };
      });
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile"], updated);
      setSaveMessage("Profile updated.");
      setFormError(null);
      router.refresh();
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["profile"], context.previous);
      }
      setFormError(error.message || "Failed to update profile");
      setSaveMessage(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const joined = useMemo(() => {
    if (!profile?.createdAt) return "";
    return new Date(profile.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [profile?.createdAt]);

  const dirty =
    !!profile && (name.trim() !== (profile.name ?? "") || image.trim() !== (profile.image ?? ""));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaveMessage(null);

    const trimmedName = name.trim();
    const trimmedImage = image.trim();
    if (!trimmedName) {
      setFormError("Name cannot be empty");
      return;
    }

    updateMutation.mutate({
      name: trimmedName,
      image: trimmedImage ? trimmedImage : null,
    });
  }

  if (status === "loading" || (session?.user && loadingProfile)) {
    return (
      <div className="p-6 md:p-10 space-y-6">
        <div className="h-9 w-40 rounded bg-surface animate-pulse" />
        <div className="h-48 rounded-2xl bg-surface animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-24 rounded-2xl bg-surface animate-pulse" />
          <div className="h-24 rounded-2xl bg-surface animate-pulse" />
        </div>
      </div>
    );
  }

  if (!session?.user || !profile) return null;

  return (
    <div className="p-6 md:p-10 space-y-8">
      <Typography variant="h1">Profile</Typography>

      <GlassWindow intensity="medium" className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {profile.image ? (
            <img src={profile.image} alt={profile.name ?? "User"} className="w-24 h-24 rounded-full object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center">
              <User className="w-10 h-10 text-accent" />
            </div>
          )}
          <div className="space-y-2 min-w-0">
            <Typography variant="h2" className="truncate">{profile.name ?? "Unnamed user"}</Typography>
            <Typography variant="caption" color="muted" className="flex items-center gap-2">
              <Mail className="w-4 h-4" /> {profile.email ?? "No email"}
            </Typography>
            <Typography variant="caption" color="muted" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Joined {joined}
            </Typography>
          </div>
        </div>
      </GlassWindow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassWindow intensity="light" className="p-5">
          <Typography variant="caption" color="muted" className="flex items-center gap-2">
            <ListMusic className="w-4 h-4" /> Playlists
          </Typography>
          <Typography variant="h2">{profile._count.playlists}</Typography>
        </GlassWindow>
        <GlassWindow intensity="light" className="p-5">
          <Typography variant="caption" color="muted" className="flex items-center gap-2">
            <Heart className="w-4 h-4" /> Liked Tracks
          </Typography>
          <Typography variant="h2">{profile._count.libraryItems}</Typography>
        </GlassWindow>
      </div>

      <GlassWindow intensity="medium" className="p-6 md:p-8">
        <Typography variant="h3" className="mb-5">Edit Profile</Typography>
        <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm text-muted">Display Name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="Your name"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="image" className="block text-sm text-muted">Avatar Image URL (HTTPS)</label>
            <input
              id="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="https://example.com/avatar.jpg"
            />
          </div>

          {formError && <Typography variant="caption" className="text-red-400">{formError}</Typography>}
          {saveMessage && <Typography variant="caption" className="text-emerald-400">{saveMessage}</Typography>}

          <Button type="submit" disabled={!dirty || updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </GlassWindow>
    </div>
  );
}
