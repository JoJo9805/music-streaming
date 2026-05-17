"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bot, Loader2, Music, Plus, Save, Send, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GlassWindow } from "@/components/ui/GlassWindow";
import { Typography } from "@/components/ui/Typography";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { usePlayerStore } from "@/stores/playerStore";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

interface PlaylistTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  similarity?: string;
}

interface PlaylistData {
  seedFound: string;
  playlistName?: string;
  playlist: PlaylistTrack[];
}

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Chào bạn, mình là trợ lý AI MelodyMix. Hỏi mình về playlist, tâm trạng nghe nhạc, hoặc tìm bài hát bạn muốn nhé!",
  },
];

const CHATBOT_STORAGE_KEY = "melodymix-chatbot-state-v1";

type StoredChatbotState = {
  messages?: ChatMessage[];
  playlist?: PlaylistData | null;
  savedPlaylistId?: string | null;
};

function readStoredChatbotState(): StoredChatbotState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CHATBOT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredChatbotState;
  } catch {
    return null;
  }
}

function restoreMessages(): ChatMessage[] {
  const stored = readStoredChatbotState();
  if (!stored?.messages?.length) return initialMessages;

  return stored.messages
    .filter((message) => message.role && typeof message.content === "string")
    .map((message) => ({ ...message, isStreaming: false }));
}

function restorePlaylist(): PlaylistData | null {
  const stored = readStoredChatbotState();
  return stored?.playlist?.playlist?.length ? stored.playlist : null;
}

function restoreSavedPlaylistId(): string | null {
  return readStoredChatbotState()?.savedPlaylistId ?? null;
}

function createMessage(role: ChatMessage["role"], content: string, isStreaming?: boolean): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    isStreaming,
  };
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|<u>(.*?)<\/u>|\+\+(.+?)\+\+|~~(.+?)~~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${keyPrefix}-${nodes.length}`;
    if (match[2] || match[3]) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {match[2] ?? match[3]}
        </strong>,
      );
    } else if (match[4] || match[5]) {
      nodes.push(
        <em key={key} className="italic">
          {match[4] ?? match[5]}
        </em>,
      );
    } else if (match[6] || match[7]) {
      nodes.push(
        <span key={key} className="underline decoration-accent/70 underline-offset-4">
          {match[6] ?? match[7]}
        </span>,
      );
    } else if (match[8]) {
      nodes.push(
        <span key={key} className="line-through decoration-muted">
          {match[8]}
        </span>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <div key={index} className="h-1" />;
        }

        const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-0.5 text-accent">•</span>
              <span>{renderInlineMarkdown(bulletMatch[1], `${index}-bullet`)}</span>
            </div>
          );
        }

        const numberedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-2">
              <span className="min-w-5 text-accent">{numberedMatch[1]}.</span>
              <span>{renderInlineMarkdown(numberedMatch[2], `${index}-numbered`)}</span>
            </div>
          );
        }

        return <p key={index}>{renderInlineMarkdown(line, `${index}-line`)}</p>;
      })}
    </div>
  );
}

function splitArtistNames(artists: string): string[] {
  return artists
    .split(";")
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function PlaylistTrackCard({
  track,
  index,
  playingTrackId,
  onPlay,
}: {
  track: PlaylistTrack;
  index: number;
  playingTrackId: string | null;
  onPlay: (trackId: string) => void;
}) {
  return (
    <div
      key={`${track.id || track.name}-${index}`}
      className="rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10"
    >
      <button
        type="button"
        disabled={playingTrackId === track.id}
        onClick={() => onPlay(track.id)}
        className="block w-full min-w-0 text-left text-sm font-semibold leading-5 text-foreground transition-colors hover:text-accent hover:underline disabled:cursor-wait disabled:text-muted"
      >
        <span className="block break-words">{track.name}</span>
      </button>

      <div className="mt-1 flex min-w-0 flex-wrap gap-x-1 gap-y-0.5 text-xs leading-5 text-muted">
        {splitArtistNames(track.artist).map((artist, artistIndex, artists) => (
          <span key={`${track.id}-${artist}-${artistIndex}`} className="min-w-0 max-w-full">
            <Link
              href={`/artist/${encodeURIComponent(artist)}`}
              className="break-words transition-colors hover:text-accent hover:underline"
            >
              {artist}
            </Link>
            {artistIndex < artists.length - 1 && ","}
          </span>
        ))}
      </div>

      {track.similarity && (
        <p className="mt-2 rounded-lg bg-accent/10 px-2 py-1 text-[11px] font-medium leading-4 text-accent/90 [overflow-wrap:anywhere]">
          {track.similarity}
        </p>
      )}
    </div>
  );
}

export default function ChatbotPage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlaylistId, setSavedPlaylistId] = useState<string | null>(null);
  const [isMobilePlaylistOpen, setIsMobilePlaylistOpen] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [loadedUserEmail, setLoadedUserEmail] = useState<string | null | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const userEmail = session?.user?.email;
  const canSend = useMemo(() => draft.trim().length > 0 && !isLoading, [draft, isLoading]);

  // 1. Load chat state when session is ready or user changes
  useEffect(() => {
    if (status === "loading") return;

    const key = userEmail ? `${CHATBOT_STORAGE_KEY}-${userEmail}` : CHATBOT_STORAGE_KEY;
    
    let loadedMessages = initialMessages;
    let loadedPlaylist: PlaylistData | null = null;
    let loadedSavedPlaylistId: string | null = null;

    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw) as StoredChatbotState;
        if (stored?.messages?.length) {
          loadedMessages = stored.messages
            .filter((message) => message.role && typeof message.content === "string")
            .map((message) => ({ ...message, isStreaming: false }));
        }
        if (stored?.playlist?.playlist?.length) {
          loadedPlaylist = stored.playlist;
        }
        if (stored?.savedPlaylistId) {
          loadedSavedPlaylistId = stored.savedPlaylistId;
        }
      }
    } catch (e) {
      console.error("Failed to load stored chat state:", e);
    }

    setMessages(loadedMessages);
    setPlaylist(loadedPlaylist);
    setSavedPlaylistId(loadedSavedPlaylistId);
    setLoadedUserEmail(userEmail ?? null); // Set this to signify we have successfully loaded for this email
  }, [userEmail, status]);

  // 2. Save chat state when messages, playlist, or savedPlaylistId changes,
  // but ONLY if the loadedUserEmail matches the current userEmail to avoid overwriting or race conditions
  useEffect(() => {
    const currentUserEmail = userEmail ?? null;
    if (loadedUserEmail !== currentUserEmail || status === "loading") return;

    const key = currentUserEmail ? `${CHATBOT_STORAGE_KEY}-${currentUserEmail}` : CHATBOT_STORAGE_KEY;
    const persistedMessages = messages
      .filter((message) => message.role === "user" || message.content.trim().length > 0)
      .map((message) => ({ ...message, isStreaming: false }));

    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ messages: persistedMessages, playlist, savedPlaylistId }),
      );
    } catch (e) {
      console.error("Failed to save chat state:", e);
    }
  }, [messages, playlist, savedPlaylistId, userEmail, loadedUserEmail, status]);

  function scrollToBottom() {
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }

  async function handleSavePlaylist() {
    if (!playlist || playlist.playlist.length === 0 || isSaving) return;

    setIsSaving(true);
    try {
      const songName = playlist.seedFound || "bài hát";
      const playlistName = playlist.playlistName || `Gợi ý từ Gemini - ${songName.split(" — ")[0] || songName}`;

      const created = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: playlistName }),
      }).then((r) => r.json());

      const playlistId = created.id;

      // Add all tracks sequentially
      for (const track of playlist.playlist) {
        await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ trackId: track.id }),
        });
      }

      setSavedPlaylistId(playlistId);
      queryClient.invalidateQueries({ queryKey: ["sidebar-playlists"] });
    } catch (err) {
      console.error("Lỗi lưu playlist:", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePlayGeneratedTrack(trackId: string) {
    if (playingTrackId) return;

    setPlayingTrackId(trackId);
    try {
      const track = await api.tracks.get(trackId);
      playTrack(track);
    } catch (err) {
      console.error("Lỗi phát bài hát gợi ý:", err);
    } finally {
      setPlayingTrackId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();
    if (!content || isLoading) return;

    const userMessage = createMessage("user", content);
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setIsLoading(true);
    setPlaylist(null);
    setSavedPlaylistId(null);
    setIsMobilePlaylistOpen(false);

    const assistantId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const placeholderMsg: ChatMessage = {
      id: `assistant-${assistantId}`,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    setMessages((prev) => [...prev, placeholderMsg]);
    scrollToBottom();

    try {
      const currentMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages, message: content }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let responseText = "";
      let hasPlaylist = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case "text-delta":
                responseText += event.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === `assistant-${assistantId}`
                      ? { ...m, content: responseText }
                      : m
                  )
                );
                scrollToBottom();
                break;

              case "tool-result":
                if (event.result) {
                  hasPlaylist = true;
                  setPlaylist({
                    seedFound: event.result.seedFound,
                    playlistName: event.result.playlistName,
                    playlist: event.result.playlist ?? [],
                  });
                }
                break;

              case "error":
                responseText = event.error ?? "Có lỗi xảy ra.";
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === `assistant-${assistantId}`
                      ? { ...m, content: responseText, isStreaming: false }
                      : m
                  )
                );
                break;
            }
          } catch {
            // bỏ qua dòng parse lỗi
          }
        }
      }

      if (!responseText && hasPlaylist) {
        responseText = "Mình đã tìm thấy các bài hát tương tự cho bạn! Bạn có thể lưu playlist này vào thư viện.";
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === `assistant-${assistantId}`
            ? { ...m, isStreaming: false, content: responseText || "Mình chưa có câu trả lời, bạn thử lại nhé." }
            : m
        )
      );
    } catch (err: unknown) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === `assistant-${assistantId}`
            ? {
              ...m, isStreaming: false, content: (err as Error)?.message?.includes("quota")
                ? "API đã hết quota, vui lòng thử lại sau."
                : "Không kết nối được với server. Bạn kiểm tra lại kết nối mạng nhé."
            }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }

  return (
    <div className="h-[calc(100dvh-14rem)] overflow-hidden p-4 md:h-[calc(100dvh-11rem)] md:min-h-0 md:overflow-hidden md:p-5 lg:p-6 xl:p-8">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 md:gap-4 lg:gap-5">
        <header className="shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-accent shadow-[0_0_24px_rgba(250,88,182,0.18)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <Typography variant="caption" className="text-accent uppercase font-bold tracking-widest">
                  MelodyMix AI
                </Typography>
                <Typography variant="h1" className="mt-1">Chatbot</Typography>
              </div>
            </div>
            {playlist && playlist.playlist.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="xl:hidden shrink-0 gap-2 border border-white/10 bg-white/5 px-3 text-xs"
                onClick={() => setIsMobilePlaylistOpen((prev) => !prev)}
              >
                <Music className="h-4 w-4" />
                Playlist
              </Button>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-6">
          {/* ─── Chat panel ──────────────────────────────────────── */}
          <GlassWindow className="flex min-h-0 flex-1 flex-col rounded-2xl" intensity="medium">
            <div className="border-b border-white/10 px-5 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <Typography variant="h4" className="text-base md:text-lg">
                    Listening Assistant
                  </Typography>
                  <Typography variant="caption" color="muted">
                    Gemini AI · gợi ý từ dataset của app
                  </Typography>
                </div>
              </div>
            </div>

            <div
              ref={listRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 md:px-6"
            >
              {messages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap md:max-w-[68%] ${isUser
                          ? "bg-accent text-white shadow-[0_0_22px_rgba(250,88,182,0.2)]"
                          : "border border-white/10 bg-white/8 text-foreground"
                        }`}
                    >
                      <MarkdownMessage content={message.content} />
                      {message.isStreaming && (
                        <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-accent align-middle" />
                      )}
                    </div>
                    {isUser && (
                      <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                        <UserRound className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.isStreaming && (
                <div className="flex items-end gap-3 justify-start">
                  <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-white/10 p-4 md:p-5">
              <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-background/50 p-2 focus-within:border-accent/60 focus-within:shadow-[0_0_24px_rgba(250,88,182,0.12)]">
                <label htmlFor="chatbot-message" className="sr-only">
                  Tin nhắn
                </label>
                <textarea
                  id="chatbot-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Hỏi nhạc..."
                  className="max-h-28 min-h-10 flex-1 resize-none overflow-hidden bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
                />
                <Button type="submit" size="icon" disabled={!canSend} aria-label="Gửi tin nhắn">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </GlassWindow>

          {/* ─── Playlist sidebar ────────────────────────────────── */}
          {playlist && playlist.playlist.length > 0 && isMobilePlaylistOpen && (
            <div className="fixed inset-x-4 bottom-28 z-40 h-[46dvh] overflow-hidden xl:hidden">
              <GlassWindow className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl" intensity="medium">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Music className="h-5 w-5 text-accent" />
                    <Typography variant="h4" className="text-base">
                      Playlist gợi ý
                    </Typography>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => setIsMobilePlaylistOpen(false)}
                  >
                    Đóng
                  </Button>
                </div>

                <div className="shrink-0 px-4 py-3">
                  {playlist.seedFound && (
                    <Typography variant="caption" color="muted" className="block">
                      Playlist: <span className="text-accent">{playlist.playlistName || playlist.seedFound}</span>
                    </Typography>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                  <div className="space-y-2">
                    {playlist.playlist.map((track, i) => (
                      <PlaylistTrackCard
                        key={`${track.id || track.name}-${i}`}
                        track={track}
                        index={i}
                        playingTrackId={playingTrackId}
                        onPlay={handlePlayGeneratedTrack}
                      />
                    ))}
                  </div>
                </div>

                <div className="shrink-0 space-y-2 border-t border-white/10 px-4 py-3">
                  {session?.user ? (
                    savedPlaylistId ? (
                      <div className="space-y-2">
                        <Typography variant="caption" className="text-emerald-400 flex items-center gap-1">
                          <Save className="h-3 w-3" /> Đã lưu vào thư viện
                        </Typography>
                        <Link
                          href={`/playlist/${savedPlaylistId}`}
                          className="block text-xs text-accent hover:underline"
                        >
                          Xem playlist →
                        </Link>
                      </div>
                    ) : (
                      <Button
                        onClick={handleSavePlaylist}
                        disabled={isSaving}
                        className="w-full gap-2"
                        size="sm"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {isSaving ? "Đang lưu..." : "Lưu Playlist vào thư viện"}
                      </Button>
                    )
                  ) : (
                    <Typography variant="caption" color="muted" className="text-center block">
                      <Link href="/login" className="text-accent hover:underline">Đăng nhập</Link> để lưu playlist
                    </Typography>
                  )}
                </div>
              </GlassWindow>
            </div>
          )}
          {playlist && playlist.playlist.length > 0 && (
            <div className="hidden w-[26rem] shrink-0 xl:flex xl:min-h-0">
              <GlassWindow className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl p-5" intensity="medium">
                <div className="mb-4 flex shrink-0 items-center gap-2">
                  <Music className="h-5 w-5 text-accent" />
                  <Typography variant="h4" className="text-base">
                    Playlist gợi ý
                  </Typography>
                </div>

                {playlist.seedFound && (
                  <Typography variant="caption" color="muted" className="mb-3 block shrink-0">
                    Playlist: <span className="text-accent">{playlist.playlistName || playlist.seedFound}</span>
                  </Typography>
                )}

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {playlist.playlist.map((track, i) => (
                    <PlaylistTrackCard
                      key={`${track.id || track.name}-${i}`}
                      track={track}
                      index={i}
                      playingTrackId={playingTrackId}
                      onPlay={handlePlayGeneratedTrack}
                    />
                  ))}
                </div>

                <div className="mt-4 shrink-0 space-y-2 border-t border-white/10 pt-3">
                  {session?.user ? (
                    savedPlaylistId ? (
                      <div className="space-y-2">
                        <Typography variant="caption" className="text-emerald-400 flex items-center gap-1">
                          <Save className="h-3 w-3" /> Đã lưu vào thư viện
                        </Typography>
                        <Link
                          href={`/playlist/${savedPlaylistId}`}
                          className="block text-xs text-accent hover:underline"
                        >
                          Xem playlist →
                        </Link>
                      </div>
                    ) : (
                      <Button
                        onClick={handleSavePlaylist}
                        disabled={isSaving}
                        className="w-full gap-2"
                        size="sm"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {isSaving ? "Đang lưu..." : "Lưu Playlist vào thư viện"}
                      </Button>
                    )
                  ) : (
                    <Typography variant="caption" color="muted" className="text-center block">
                      <Link href="/login" className="text-accent hover:underline">Đăng nhập</Link> để lưu playlist
                    </Typography>
                  )}
                </div>
              </GlassWindow>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
