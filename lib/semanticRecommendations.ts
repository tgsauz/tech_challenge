/**
 * Semantic movie recommendations using embeddings + Supabase (pgvector).
 *
 * We assume a Supabase table + RPC function like:
 *
 * Table: movie_embeddings
 *  - id (uuid)
 *  - tmdb_id (int)
 *  - title (text)
 *  - overview (text)
 *  - genres (text[])
 *  - year (int)
 *  - poster_url (text)
 *  - embedding (vector)
 *
 * RPC: match_movies(query_embedding vector, match_count int, similarity_threshold float)
 *  - Returns rows ordered by similarity with fields matching the table above
 */

import OpenAI from "openai";
import { config, OPENAI_API_KEY } from "./config";
import { supabase } from "./supabaseClient";
import type { MovieDetails, MovieSummary } from "./tmdb";

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: 20000
});

export type SemanticMovieRecommendation = MovieSummary & {
  matchConfidence?: "high" | "medium" | "low";
};

export async function getSemanticMovieRecommendations(
  seed: MovieDetails,
  options?: { excludeGenres?: string[]; minYear?: number; maxYear?: number }
): Promise<SemanticMovieRecommendation[]> {
  // Build a compact description for embedding
  const description = [
    `${seed.title} (${seed.releaseYear ?? "unknown year"})`,
    seed.genres.length ? `Genres: ${seed.genres.join(", ")}` : "",
    seed.overview ?? ""
  ]
    .filter(Boolean)
    .join("\n");

  // 1) Get embedding from OpenAI
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: description
  });

  const embedding = embeddingResponse.data[0]?.embedding;
  if (!embedding) {
    throw new Error("Failed to generate embedding for seed movie");
  }

  // 2) Query Supabase for similar movies using a pgvector RPC
  const { data, error } = await supabase.rpc("match_movies", {
    query_embedding: embedding,
    match_count: 12,
    similarity_threshold: 0.7
  });

  if (error) {
    console.error("Supabase match_movies error:", error);
    throw new Error("Failed to fetch semantic recommendations from Supabase");
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  // 3) Map Supabase rows into our MovieSummary shape
  const excludedGenresInput = (options?.excludeGenres ?? []).map((g) =>
    g.trim().toLowerCase()
  );
  const excludedGenres =
    excludedGenresInput.length > 0 ? new Set(excludedGenresInput) : null;

  const mapped = (data as any[]).map((row) => {
    const similarity: number | undefined = row.similarity ?? row.score;
    let matchConfidence: "high" | "medium" | "low" | undefined;
    if (typeof similarity === "number") {
      if (similarity >= 0.9) matchConfidence = "high";
      else if (similarity >= 0.8) matchConfidence = "medium";
      else matchConfidence = "low";
    }

    return {
      id: row.tmdb_id,
      title: row.title,
      overview: row.overview ?? null,
      releaseYear: row.year ?? null,
      posterUrl: row.poster_url ?? null,
      genres: Array.isArray(row.genres) ? row.genres : [],
      matchConfidence
    } satisfies SemanticMovieRecommendation;
  });

  const filteredByGenre = !excludedGenres
    ? mapped
    : mapped.filter((movie) =>
        movie.genres.every((g) => !excludedGenres.has(g.toLowerCase()))
      );

  const minYear = typeof options?.minYear === "number" ? options.minYear : null;
  const maxYear = typeof options?.maxYear === "number" ? options.maxYear : null;
  if (!minYear && !maxYear) return filteredByGenre;

  return filteredByGenre.filter((movie) => {
    const year = movie.releaseYear ?? null;
    if (year === null) return false;
    if (minYear && year < minYear) return false;
    if (maxYear && year > maxYear) return false;
    return true;
  });
}
