"use client";

import { useState } from "react";

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
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  function toggleExpanded(movieId: string | number) {
    setExpandedId((prev) => (prev === movieId ? null : movieId));
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-zinc-400">
        Movie recommendations
      </p>
      <div className="card-grid">
        {movies.map((movie, index) => (
          <div
            key={`${movie.id}-${index}`}
            className={`card flex cursor-pointer gap-2 p-2 ${
              expandedId === movie.id ? "card--expanded" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-expanded={expandedId === movie.id}
            onClick={() => toggleExpanded(movie.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleExpanded(movie.id);
              }
            }}
          >
            {movie.posterUrl && (
              <img
                src={movie.posterUrl}
                alt={movie.title}
                className="h-20 w-14 flex-shrink-0 rounded object-cover"
              />
            )}
            <div className="card-body space-y-1 text-xs">
              <div className="font-semibold text-zinc-100">
                {movie.title}
                {movie.releaseYear && (
                  <span className="text-zinc-400"> ({movie.releaseYear})</span>
                )}
              </div>
              <div
                className={`card-details ${
                  expandedId === movie.id
                    ? "card-details--expanded"
                    : "card-details--collapsed"
                }`}
              >
                {movie.genres && movie.genres.length > 0 && (
                  <p className="text-[11px] text-zinc-400">
                    {movie.genres.join(", ")}
                  </p>
                )}
                {movie.overview && (
                  <p
                    className={`card-overview text-[11px] text-zinc-400 ${
                      expandedId === movie.id ? "" : "card-overview--collapsed"
                    }`}
                  >
                    {movie.overview}
                  </p>
                )}
                {onFeedback && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      className={`feedback-button ${
                        feedbackById?.[String(movie.id)] === 1
                          ? "is-active"
                          : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onFeedback(movie.id, 1);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      aria-label={`Like ${movie.title}`}
                    >
                      Thumbs up
                    </button>
                    <button
                      type="button"
                      className={`feedback-button ${
                        feedbackById?.[String(movie.id)] === -1
                          ? "is-active"
                          : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onFeedback(movie.id, -1);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
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
          </div>
        ))}
      </div>
    </div>
  );
}
