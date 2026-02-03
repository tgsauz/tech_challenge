"use client";

import { useEffect, useState } from "react";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
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
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.assistantMessage.message ?? data.assistantMessage
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

        <div className="flex flex-1 gap-4">
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
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-zinc-100 text-black"
                        : "bg-zinc-800 text-zinc-50"
                    }`}
                  >
                    {m.content}
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

          {showDebug && (
            <aside className="w-64 rounded-xl border border-zinc-800 bg-black/80 p-3 text-xs">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Debug panel
              </h2>
              <p className="mb-2 text-[11px] text-zinc-500">
                Shows which tools the AI used, short descriptions, and any
                errors. This helps prove the bot is doing real work with TMDB,
                Spotify, and the database.
              </p>
              <div className="space-y-1 overflow-y-auto">
                {debugEvents.length === 0 && (
                  <p className="text-zinc-600">No debug events yet.</p>
                )}
                {debugEvents.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">
                        {e.type}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {e.message}
                    </p>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

