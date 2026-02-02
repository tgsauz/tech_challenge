/**
 * TMDB (The Movie Database) API client.
 * Handles movie search, details, recommendations, and soundtrack data.
 */

import { z } from "zod";
import { config } from "./config";

// Base URL for TMDB API v3
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Zod schemas for TMDB API responses (we validate to avoid runtime errors)
const TmdbMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string().nullable(),
  overview: z.string().nullable(),
  poster_path: z.string().nullable(),
  genre_ids: z.array(z.number()).optional()
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
    const response = await fetch(url.toString(), {
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
    const response = await fetch(url.toString(), {
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
  movieId: number
): Promise<MovieSummary[]> {
  if (!config.tmdbApiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_BASE_URL}/movie/${movieId}/recommendations`);
  url.searchParams.set("api_key", config.tmdbApiKey);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");

  try {
    const response = await fetch(url.toString(), {
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
    const parsed = TmdbSearchResponseSchema.parse(data);

    return parsed.results.slice(0, 10).map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseYear: movie.release_date
        ? parseInt(movie.release_date.split("-")[0], 10)
      : null,
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null,
      genres: []
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`TMDB API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get soundtrack/music information for a movie.
 * Note: TMDB doesn't have a dedicated soundtrack endpoint, so we use credits
 * to find music department crew and make best-effort guesses.
 */
export async function getMovieSoundtrack(
  movieId: number
): Promise<Array<{ songTitle: string; artist?: string; source: string }>> {
  if (!config.tmdbApiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_BASE_URL}/movie/${movieId}`);
  url.searchParams.set("api_key", config.tmdbApiKey);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("append_to_response", "credits");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Movie with ID ${movieId} not found`);
      }
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const credits = data.credits
      ? TmdbCreditsSchema.parse(data.credits)
      : { crew: [], cast: [] };

    // Extract music department crew (composers, music supervisors, etc.)
    const musicCrew = credits.crew.filter(
      (person) =>
        person.department === "Sound" ||
        person.department === "Music" ||
        person.job.toLowerCase().includes("music") ||
        person.job.toLowerCase().includes("composer")
    );

    // Best-effort: return music crew names as "artists"
    // In a real app, we'd cross-reference with Spotify or other music APIs
    const soundtrack: Array<{ songTitle: string; artist?: string; source: string }> =
      musicCrew.map((person) => ({
        songTitle: `Music by ${person.name}`,
        artist: person.name,
        source: "tmdb_credits"
      }));

    return soundtrack;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`TMDB API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}
