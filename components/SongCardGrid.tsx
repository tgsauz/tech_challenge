export type SongCard = {
  id: string | number;
  name: string;
  artists?: string[];
  album?: string | null;
  releaseYear?: number | null;
  previewUrl?: string | null;
  source?: string;
};

export function SongCardGrid({ songs }: { songs?: SongCard[] }) {
  if (!songs || songs.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-zinc-400">
        Song recommendations
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {songs.map((song) => (
          <div
            key={song.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2 text-xs"
          >
            <div className="font-semibold text-zinc-100">{song.name}</div>
            {song.artists && song.artists.length > 0 && (
              <p className="text-[11px] text-zinc-400">
                {song.artists.join(", ")}
              </p>
            )}
            {song.album && (
              <p className="text-[11px] text-zinc-500">Album: {song.album}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

