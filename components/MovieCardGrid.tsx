export type MovieCard = {
  id: number | string;
  title: string;
  overview?: string | null;
  releaseYear?: number | null;
  posterUrl?: string | null;
  genres?: string[];
  matchConfidence?: string;
};

type FeedbackHandler = (movieId: string | number, rating: 1 | -1) => void;

export function MovieCardGrid({
  movies,
  onFeedback,
  feedbackById,
  feedbackStatusById
}: {
  movies?: MovieCard[];
  onFeedback?: FeedbackHandler;
  feedbackById?: Record<string, 1 | -1 | null | undefined>;
  feedbackStatusById?: Record<string, string | undefined>;
}) {
  if (!movies || movies.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-zinc-400">
        Movie recommendations
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {movies.map((movie) => (
          <div
            key={movie.id}
            className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2"
          >
            {movie.posterUrl && (
              <img
                src={movie.posterUrl}
                alt={movie.title}
                className="h-20 w-14 flex-shrink-0 rounded object-cover"
              />
            )}
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-zinc-100">
                {movie.title}
                {movie.releaseYear && (
                  <span className="text-zinc-400"> ({movie.releaseYear})</span>
                )}
              </div>
              {movie.genres && movie.genres.length > 0 && (
                <p className="text-[11px] text-zinc-400">
                  {movie.genres.join(", ")}
                </p>
              )}
              {movie.overview && (
                <p className="line-clamp-2 text-[11px] text-zinc-400">
                  {movie.overview}
                </p>
              )}
              {onFeedback && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    className={`rounded border px-2 py-0.5 text-[11px] transition ${
                      feedbackById?.[String(movie.id)] === 1
                        ? "border-zinc-200 bg-zinc-100 text-black"
                        : "border-zinc-700 text-zinc-200 hover:border-zinc-400"
                    }`}
                    onClick={() => onFeedback(movie.id, 1)}
                    aria-label={`Like ${movie.title}`}
                  >
                    Thumbs up
                  </button>
                  <button
                    type="button"
                    className={`rounded border px-2 py-0.5 text-[11px] transition ${
                      feedbackById?.[String(movie.id)] === -1
                        ? "border-zinc-200 bg-zinc-100 text-black"
                        : "border-zinc-700 text-zinc-200 hover:border-zinc-400"
                    }`}
                    onClick={() => onFeedback(movie.id, -1)}
                    aria-label={`Dislike ${movie.title}`}
                  >
                    Thumbs down
                  </button>
                  {feedbackStatusById?.[String(movie.id)] && (
                    <span className="text-[11px] text-zinc-500">
                      {feedbackStatusById[String(movie.id)]}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
