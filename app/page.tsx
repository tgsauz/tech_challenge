"use client";

import { useEffect, useState } from "react";
import type { MovieCard } from "@/components/MovieCardGrid";
import { MovieCardGrid } from "@/components/MovieCardGrid";
import type { SongCard } from "@/components/SongCardGrid";
import { SongCardGrid } from "@/components/SongCardGrid";
import { DebugPanel } from "@/components/DebugPanel";

type Role = "user" | "assistant";

type AssistantMessagePayload = {
  message: string;
  movies?: MovieCard[];
  songs?: SongCard[];
};

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  movies?: MovieCard[];
  songs?: SongCard[];
};

type DebugEvent = {
  id: string;
  type: string;
  message: string;
};

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [movieFeedback, setMovieFeedback] = useState<
    Record<string, 1 | -1 | null | undefined>
  >({});
  const [feedbackStatus, setFeedbackStatus] = useState<
    Record<string, string | undefined>
  >({});

  // Simple user id persistence in localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem("gleni_user_id");
    if (existing) {
      setUserId(existing);
    } else {
      const id = crypto.randomUUID();
      window.localStorage.setItem("gleni_user_id", id);
      setUserId(id);
    }
  }, []);

  // Load last conversation history for this user so chat persists across reloads
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const res = await fetch("/api/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ userId })
        });

        if (!res.ok) return;

        const data = await res.json();
        if (data.conversationId) {
          setConversationId(data.conversationId as string);
        }
        if (Array.isArray(data.messages)) {
          setMessages(data.messages as ChatMessage[]);
        }
      } catch (err) {
        console.error("Failed to load history", err);
      }
    })();
  }, [userId]);

  // Load feedback so toggle states are persistent
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const res = await fetch(`/api/feedback?userId=${userId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.feedback)) {
          const next: Record<string, 1 | -1 | null> = {};
          for (const item of data.feedback) {
            if (item.itemType === "movie") {
              next[String(item.itemId)] = item.rating === 1 ? 1 : -1;
            }
          }
          setMovieFeedback(next);
        }
      } catch (err) {
        console.error("Failed to load feedback", err);
      }
    })();
  }, [userId]);

  async function handleSend() {
    if (!input.trim() || !userId) return;
    setError(null);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const payload: Record<string, unknown> = {
        userId,
        message: userMessage.content
      };
      if (conversationId) payload.conversationId = conversationId;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => null);
        console.error("API error", res.status, bodyText);
        setError(bodyText ?? `Request failed (${res.status})`);
        setIsLoading(false);
        return;
      }

      const data = await res.json();

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      if (Array.isArray(data.debugEvents)) {
        setDebugEvents((prev) => [...prev, ...data.debugEvents]);
      }

      if (data.assistantMessage) {
        const payload: AssistantMessagePayload = data.assistantMessage;
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.message ?? "",
          movies: payload.movies ?? [],
          songs: payload.songs ?? []
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        setError("The assistant did not return a message.");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMovieFeedback(movieId: string | number, rating: 1 | -1) {
    if (!userId) return;
    const key = String(movieId);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          itemType: "movie",
          itemId: movieId,
          rating
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setMovieFeedback((prev) => ({
          ...prev,
          [key]: data.rating ?? null
        }));
        setFeedbackStatus((prev) => ({
          ...prev,
          [key]: data.rating ? "Saved" : "Removed"
        }));
        window.setTimeout(() => {
          setFeedbackStatus((prev) => ({ ...prev, [key]: undefined }));
        }, 1200);
      }
    } catch (err) {
      console.error("Failed to save feedback", err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex min-h-screen bg-black text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
        <header className="mb-2 border-b border-zinc-800 pb-3">
          <h1 className="text-2xl font-semibold">
            Gleni Movie &amp; Music Discovery Chatbot
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Ask for movie and music recommendations, cross references between
            films and songs, and more.
          </p>
        </header>

        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <section className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Chat
              </h2>
              <button
                type="button"
                className="text-xs text-zinc-400 underline"
                onClick={() => setShowDebug((v) => !v)}
              >
                {showDebug ? "Hide debug" : "Show debug"}
              </button>
            </div>

            <div className="mb-3 h-[420px] space-y-3 overflow-y-auto rounded-lg bg-black/60 p-3">
              {messages.length === 0 && (
                <p className="text-sm text-zinc-400">
                  Start by telling me a movie or song you like. For example:
                  &quot;I loved Inception and Interstellar&quot; or &quot;What
                  songs are in Pulp Fiction?&quot;
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[80%] space-y-2">
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-zinc-100 text-black"
                          : "bg-zinc-800 text-zinc-50"
                      }`}
                    >
                      {m.content}
                    </div>

                    {m.role === "assistant" &&
                      ((m.movies?.length ?? 0) > 0 ||
                        (m.songs?.length ?? 0) > 0) && (
                        <div className="space-y-2">
                          <MovieCardGrid
                            movies={m.movies}
                            onFeedback={handleMovieFeedback}
                            feedbackById={movieFeedback}
                            feedbackStatusById={feedbackStatus}
                          />
                          <SongCardGrid songs={m.songs} />
                        </div>
                      )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <p className="text-xs text-zinc-400">
                  Gleni is thinking and may call external tools…
                </p>
              )}
            </div>

            <div className="space-y-2">
              <textarea
                className="h-20 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm outline-none focus:border-zinc-300"
                placeholder="Ask for recommendations, soundtracks, or movies with specific songs..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading || !userId}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {error && <span className="text-red-400">{error}</span>}
                  {!error && isLoading && (
                    <span>Working with TMDB, Spotify and OpenAI…</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={isLoading || !input.trim() || !userId}
                  onClick={handleSend}
                  className="rounded-md bg-zinc-100 px-4 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:bg-zinc-600"
                >
                  {isLoading ? "Thinking..." : "Send"}
                </button>
              </div>
            </div>
          </section>

          {showDebug && <DebugPanel events={debugEvents} />}
        </div>
      </main>
    </div>
  );
}
