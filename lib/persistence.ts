/**
 * Persistence helpers for user history (watched movies).
 * Uses Prisma to interact with SQLite database.
 */

import { prisma } from "./prisma";
import { getMovieRecommendations } from "./tmdb";

/** Removes duplicate items based on `id` using a Set for O(n) performance */
function uniqueById<T extends { id: string | number }>(items: T[]): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/**
 * Save a watched movie to the user's history.
 * If the movie is already saved, this is a no-op (idempotent).
 */
export async function saveWatchedMovie(
  userId: string,
  movieId: number,
  movieTitle: string
): Promise<void> {
  try {
    if (!userId || typeof movieId !== "number" || !movieTitle) {
      throw new Error("Invalid arguments passed to saveWatchedMovie");
    }
    await prisma.watchedMovie.upsert({
      where: {
        userId_movieId: {
          userId,
          movieId
        }
      },
      create: {
        userId,
        movieId,
        movieTitle
      },
      update: {
        // Update title and refresh the addedAt timestamp so recent activity is tracked
        movieTitle,
        addedAt: new Date()
      }
    });
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to save watched movie: ${String(error)}`);
  }
}

/**
 * Get the user's complete history (watched movies).
 */
export async function getUserHistory(userId: string): Promise<{
  watchedMovies: Array<{
    id: string;
    movieId: number;
    movieTitle: string;
    addedAt: Date;
  }>;
}> {
  try {
    const watchedMovies = await prisma.watchedMovie.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" }
    });

    return {
      watchedMovies: watchedMovies.map((m) => ({
        id: m.id,
        movieId: m.movieId,
        movieTitle: m.movieTitle,
        addedAt: m.addedAt
      }))
    };
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to get user history: ${String(error)}`);
  }
}

/**
 * Generate recommendations based on the user's saved history.
 * Returns movie recommendations based on watched content.
 */
export async function getRecommendationsFromHistory(
  userId: string,
  options?: { excludeGenres?: string[]; minYear?: number; maxYear?: number }
): Promise<{
  movieRecommendations: Array<{
    id: number;
    title: string;
    releaseYear: number | null;
    overview: string | null;
    posterUrl: string | null;
    genres: string[];
  }>;
}> {
  try {
    const history = await getUserHistory(userId);

    // Get recommendations for the last 3 watched movies
    const recentMovies = history.watchedMovies.slice(0, 3);
    const movieRecsPromises = recentMovies.map((m) =>
      getMovieRecommendations(m.movieId, {
        excludeGenres: options?.excludeGenres,
        minYear: options?.minYear,
        maxYear: options?.maxYear
      }).catch((err) => {
        console.error("getMovieRecommendations error:", err);
        return [] as any[];
      })
    );
    const movieRecsArrays = await Promise.all(movieRecsPromises);
    const movieRecommendations = uniqueById(movieRecsArrays.flat()).slice(0, 10);

    return {
      movieRecommendations
    };
  } catch (error) {
    throw new Error(`Failed to get recommendations from history: ${error}`);
  }
}

/**
 * Save user feedback (thumbs up/down) for an item.
 */
export async function toggleFeedback(
  userId: string,
  itemType: string,
  itemId: string,
  rating: 1 | -1
): Promise<{ rating: 1 | -1 | null }> {
  try {
    if (!userId || !itemType || !itemId || (rating !== 1 && rating !== -1)) {
      throw new Error("Invalid arguments passed to toggleFeedback");
    }

    const existing = await prisma.feedback.findUnique({
      where: {
        userId_itemType_itemId: {
          userId,
          itemType,
          itemId
        }
      }
    });

    if (existing && existing.rating === rating) {
      await prisma.feedback.delete({
        where: { id: existing.id }
      });
      return { rating: null };
    }

    if (existing) {
      const updated = await prisma.feedback.update({
        where: { id: existing.id },
        data: { rating }
      });
      return { rating: updated.rating as 1 | -1 };
    }

    const created = await prisma.feedback.create({
      data: {
        userId,
        itemType,
        itemId,
        rating
      }
    });
    return { rating: created.rating as 1 | -1 };
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to toggle feedback: ${String(error)}`);
  }
}

/**
 * Get the user's feedback history.
 */
export async function getUserFeedback(userId: string): Promise<
  Array<{
    id: string;
    itemType: string;
    itemId: string;
    rating: number;
    createdAt: Date;
  }>
> {
  try {
    const feedback = await prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });

    return feedback.map((f) => ({
      id: f.id,
      itemType: f.itemType,
      itemId: f.itemId,
      rating: f.rating,
      createdAt: f.createdAt
    }));
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to get user feedback: ${String(error)}`);
  }
}
