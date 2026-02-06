type DebugEvent = {
  id: string;
  type: string;
  message: string;
};

type Props = {
  events: DebugEvent[];
};

export function DebugPanel({ events }: Props) {
  return (
    <aside className="debug-panel w-64 rounded-xl p-3 text-xs">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Debug panel
      </h2>
      <p className="mb-2 text-[11px] text-zinc-500">
        Shows which tools the AI used, short descriptions, token usage, and any
        errors. Useful to prove the bot is doing real work with TMDB, Supabase,
        and the database.
      </p>
      <div className="space-y-1 overflow-y-auto">
        {events.length === 0 && (
          <p className="text-zinc-600">No debug events yet.</p>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1"
          >
            <div className="debug-event-row flex items-center justify-between">
              <span className="debug-event-title font-semibold text-zinc-200">
                {e.type}
              </span>
            </div>
            <p
              className={`debug-event-message mt-1 text-[11px] text-zinc-400 ${
                e.type === "tokens" ? "debug-event-message--mono" : ""
              }`}
            >
              {e.message}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
