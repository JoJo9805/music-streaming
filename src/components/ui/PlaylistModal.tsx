"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { GlassWindow } from "@/components/ui/GlassWindow";
import { X, Sparkles, ImagePlus, Globe, Lock } from "lucide-react";

interface PlaylistModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; coverUrl: string; privacy: "PUBLIC" | "PRIVATE" }) => void;
  isSaving: boolean;
  /** When omitted the modal renders in "create" mode */
  initialName?: string;
  initialDescription?: string;
  initialCoverUrl?: string;
  initialPrivacy?: "PUBLIC" | "PRIVATE";
  mode?: "create" | "edit";
}

export function PlaylistModal({
  open,
  onClose,
  onSave,
  isSaving,
  initialName = "",
  initialDescription = "",
  initialCoverUrl = "",
  initialPrivacy = "PRIVATE",
  mode = "edit",
}: PlaylistModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [coverPreview, setCoverPreview] = useState(initialCoverUrl);
  const [coverError, setCoverError] = useState(false);
  const [privacy, setPrivacy] = useState<"PUBLIC" | "PRIVATE">(initialPrivacy);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Sync fields when modal opens with fresh initial values
  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setCoverUrl(initialCoverUrl);
      setCoverPreview(initialCoverUrl);
      setCoverError(false);
      setPrivacy(initialPrivacy);
    }
  }, [open, initialName, initialDescription, initialCoverUrl, initialPrivacy]);

  function handleCoverUrlChange(value: string) {
    setCoverUrl(value);
    setCoverError(false);
    setCoverPreview(value);
  }

  function handleSubmit() {
    if (!name.trim() || isSaving) return;
    onSave({ name: name.trim(), description: description.trim(), coverUrl: coverUrl.trim(), privacy });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && e.target instanceof HTMLInputElement) {
      handleSubmit();
    }
    if (e.key === "Escape") onClose();
  }

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <GlassWindow
        intensity="medium"
        className="relative z-10 w-full max-w-md p-6 space-y-6"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <Typography variant="h3">{mode === "create" ? "New Playlist" : "Edit Playlist"}</Typography>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Cover image preview + URL input */}
        <div className="flex gap-4 items-start">
          {/* Cover thumbnail */}
          <button
            type="button"
            className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-gradient-to-tr from-accent/30 to-purple-600/30 flex items-center justify-center border border-white/10 hover:border-accent/50 transition-colors group relative"
            onClick={() => coverInputRef.current?.focus()}
            title="Click to edit cover URL below"
          >
            {coverPreview && !coverError ? (
              <img
                src={coverPreview}
                alt="Cover preview"
                className="w-full h-full object-cover"
                onError={() => setCoverError(true)}
              />
            ) : (
              <Sparkles className="w-10 h-10 text-white/40" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
              <ImagePlus className="w-6 h-6 text-white" />
            </div>
          </button>

          {/* Cover URL input */}
          <div className="flex-1 space-y-1">
            <label className="block text-xs text-muted font-medium uppercase tracking-wider">
              Cover Image URL
            </label>
            <input
              ref={coverInputRef}
              type="url"
              value={coverUrl}
              onChange={(e) => handleCoverUrlChange(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
            />
            {coverError && coverUrl && (
              <p className="text-xs text-red-400">Could not load image from this URL</p>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1">
          <label className="block text-xs text-muted font-medium uppercase tracking-wider">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="block text-xs text-muted font-medium uppercase tracking-wider">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add an optional description"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        {/* Privacy */}
        <div className="space-y-1">
          <label className="block text-xs text-muted font-medium uppercase tracking-wider">
            Visibility
          </label>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              type="button"
              onClick={() => setPrivacy("PRIVATE")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                privacy === "PRIVATE"
                  ? "bg-accent/20 text-accent border-r border-white/10"
                  : "text-muted hover:text-foreground hover:bg-white/5 border-r border-white/10"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Private
            </button>
            <button
              type="button"
              onClick={() => setPrivacy("PUBLIC")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                privacy === "PUBLIC"
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Public
            </button>
          </div>
          <p className="text-xs text-muted/70">
            {privacy === "PUBLIC"
              ? "Anyone can find this playlist in search."
              : "Only you can see this playlist."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" className="rounded-lg" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="rounded-lg min-w-[90px]"
            onClick={handleSubmit}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {mode === "create" ? "Creating" : "Saving"}
              </span>
            ) : (
              mode === "create" ? "Create" : "Save"
            )}
          </Button>
        </div>
      </GlassWindow>
    </div>
  );

  return createPortal(modal, document.body);
}
