/**
 * TMDB (The Movie Database) API client.
 * Handles movie search, details, and recommendations.
 */

import { z } from "zod";
import { config } from "./config";
import { fetchWithTimeout } from "./http";

// Base URL for TMDB API v3
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Zod schemas for TMDB API responses (we validate to avoid runtime errors)
const TmdbMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string().nullable(),
  overview: z.string().nullable(),
  poster_path: z.string().nullable(),
  genre_ids: z.array(z.number()).optional(),
  vote_average: z.number().optional()
});

const TmdbSearchResponseSchema = z.object({
  results: z.array(TmdbMovieSchema),
  total_results: z.number()
});

const TmdbGenreSchema = z.object({
  id: z.number(),
  name: z.string()
});

const TmdbMovieDetailsSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string().nullable(),
  overview: z.string().nullable(),
  poster_path: z.string().nullable(),
  genres: z.array(TmdbGenreSchema),
  vote_average: z.number().optional(),
  runtime: z.number().nullable().optional()
});

const TmdbCreditsSchema = z.object({
  crew: z.array(
    z.object({
      job: z.string(),
      name: z.string(),
      department: z.string()
    })
  ),
  cast: z.array(
    z.object({
      name: z.string(),
      character: z.string().optional()
    })
  )
});

// Types we'll use in our app (simpler than raw TMDB responses)
export type MovieSummary = {
  id: number;
  title: string;
  releaseYear: number | null;
  overview: string | null;
  posterUrl: string | null;
  genres: string[];
};

export type MovieDetails = MovieSummary & {
  voteAverage?: number;
  runtime?: number | null;
  topCast: string[];
};

/**
 * Search for movies by title.
 * Returns up to 20 results sorted by popularity.
 */
export async function searchMovies(query: string): Promise<MovieSummary[]> {
  if (!config.tmdbApiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_BASE_URL}/search/movie`);
  url.searchParams.set("api_key", config.tmdbApiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");

  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("TMDB API key is invalid");
      }
      if (response.status === 429) {
        throw new Error("TMDB API rate limit exceeded. Please try again later.");
      }
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = TmdbSearchResponseSchema.parse(data);

    return parsed.results.map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseYear: movie.release_date
        ? parseInt(movie.release_date.split("-")[0], 10)
        : null,
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null,
      genres: [] // We'll get genres from details endpoint
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`TMDB API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get detailed information about a movie by ID.
 * Includes genres, cast, and other metadata.
 */
export async function getMovieDetails(movieId: number): Promise<MovieDetails> {
  if (!config.tmdbApiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_BASE_URL}/movie/${movieId}`);
  url.searchParams.set("api_key", config.tmdbApiKey);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("append_to_response", "credits");

  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Movie with ID ${movieId} not found`);
      }
      if (response.status === 401) {
        throw new Error("TMDB API key is invalid");
      }
      if (response.status === 429) {
        throw new Error("TMDB API rate limit exceeded. Please try again later.");
      }
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const movieDetails = TmdbMovieDetailsSchema.parse(data);
    const credits = data.credits
      ? TmdbCreditsSchema.parse(data.credits)
      : { crew: [], cast: [] };

    // Get top 5 cast members
    const topCast = credits.cast.slice(0, 5).map((c) => c.name);

    return {
      id: movieDetails.id,
      title: movieDetails.title,
      releaseYear: movieDetails.release_date
        ? parseInt(movieDetails.release_date.split("-")[0], 10)
        : null,
      overview: movieDetails.overview,
      posterUrl: movieDetails.poster_path
        ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
        : null,
      genres: movieDetails.genres.map((g) => g.name),
      voteAverage: movieDetails.vote_average,
      runtime: movieDetails.runtime,
      topCast
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`TMDB API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get movie recommendations based on a movie ID.
 * Returns similar movies that users might enjoy.
 */
export async function getMovieRecommendations(
  movieId: number,
  options?: { excludeGenres?: string[]; minYear?: number; maxYear?: number }
): Promise<MovieSummary[]> {
  if (!config.tmdbApiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }
  const apiKey = config.tmdbApiKey as string;
  // Helper: fetch genre map (id -> name) and cache it
  let genreMap: Map<number, string> | null = null;
  async function getGenreMap(): Promise<Map<number, string>> {
    if (genreMap) return genreMap;
    const url = new URL(`${TMDB_BASE_URL}/genre/movie/list`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", "en-US");
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`Failed to fetch genres: ${res.status}`);
    const json = await res.json();
    const parsed = z.object({ genres: z.array(TmdbGenreSchema) }).parse(json);
    genreMap = new Map(parsed.genres.map((g) => [g.id, g.name] as [number, string]));
    return genreMap;
  }

  try {
    // Get seed movie details to extract its genres
    const seedDetails = await getMovieDetails(movieId);
    const genreLookup = await getGenreMap();
    const seedGenreIds = Array.from(genreLookup.entries())
      .filter(([, name]) => seedDetails.genres.includes(name))
      .map(([id]) => id);

    // Endpoints to call: recommendations and similar
    const endpoints = [
      `${TMDB_BASE_URL}/movie/${movieId}/recommendations`,
      `${TMDB_BASE_URL}/movie/${movieId}/similar`
    ];

    const responses = await Promise.all(
      endpoints.map((ep) => {
        const url = new URL(ep);
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("language", "en-US");
        url.searchParams.set("page", "1");
        return fetchWithTimeout(url.toString(), {
          headers: { Accept: "application/json" }
        });
      })
    );

    const ok = responses.every((r) => r.ok);
    if (!ok) {
      const bad = responses.find((r) => !r.ok)!;
      if (bad.status === 401) throw new Error("TMDB API key is invalid");
      if (bad.status === 429) throw new Error("TMDB API rate limit exceeded. Please try again later.");
      throw new Error(`TMDB API error: ${bad.status} ${bad.statusText}`);
    }

    const datas = await Promise.all(responses.map((r) => r.json()));
    const parsedArrays = datas.map((d) => TmdbSearchResponseSchema.parse(d).results);
    // Flatten and dedupe by id
    const combined = parsedArrays.flat();
    const seen = new Set<number>();
    const unique: (z.infer<typeof TmdbMovieSchema>)[] = [];
    for (const item of combined) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }

    // Filter candidates: require intersection with seed genres and min vote_average
    const excludedGenresInput = (options?.excludeGenres ?? []).map((g) =>
      g.trim().toLowerCase()
    );
    const excludedGenres =
      excludedGenresInput.length > 0 ? new Set(excludedGenresInput) : null;
    const MIN_VOTE = 6.5;
    const minYear = typeof options?.minYear === "number" ? options.minYear : null;
    const maxYear = typeof options?.maxYear === "number" ? options.maxYear : null;

    const filtered = unique.filter((movie) => {
      const candidateGenreIds = movie.genre_ids ?? [];
      const candidateGenres = candidateGenreIds.map((id) => genreLookup.get(id)).filter(Boolean) as string[];

      // Exclude if it matches explicitly excluded genres
      if (
        excludedGenres &&
        candidateGenres.some((g) => excludedGenres.has(g.toLowerCase()))
      ) {
        return false;
      }

      // Require at least one shared genre with seed
      if (seedGenreIds.length > 0 && !candidateGenreIds.some((id) => seedGenreIds.includes(id))) return false;

      // Require minimum vote average when available
      if (typeof movie.vote_average === "number" && movie.vote_average < MIN_VOTE) return false;

      if (minYear || maxYear) {
        const year = movie.release_date
          ? parseInt(movie.release_date.split("-")[0], 10)
          : null;
        if (typeof minYear === "number" && year !== null && year < minYear)
          return false;
        if (typeof maxYear === "number" && year !== null && year > maxYear)
          return false;
        if (year === null) return false;
      }

      return true;
    });

    return filtered.slice(0, 10).map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseYear: movie.release_date ? parseInt(movie.release_date.split("-")[0], 10) : null,
      overview: movie.overview,
      posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      genres: (movie.genre_ids ?? []).map((id) => genreLookup.get(id)).filter(Boolean) as string[]
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`TMDB API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}
