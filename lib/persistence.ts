/**
 * Persistence helpers for user history (watched movies, listened songs).
 * Uses Prisma to interact with SQLite database.
 */

import { prisma } from "./prisma";
import { getMovieRecommendations } from "./tmdb";
import { getTrackRecommendations } from "./spotify";

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
 * Save a listened song to the user's history.
 * If the song is already saved, this is a no-op (idempotent).
 */
export async function saveListenedSong(
  userId: string,
  trackId: string,
  trackName: string,
  artist: string
): Promise<void> {
  try {
    if (!userId || !trackId || !trackName) {
      throw new Error("Invalid arguments passed to saveListenedSong");
    }
    await prisma.listenedSong.upsert({
      where: {
        userId_trackId: {
          userId,
          trackId
        }
      },
      create: {
        userId,
        trackId,
        trackName,
        artist
      },
      update: {
        // Update metadata and refresh timestamp
        trackName,
        artist,
        addedAt: new Date()
      }
    });
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to save listened song: ${String(error)}`);
  }
}

/**
 * Get the user's complete history (watched movies and listened songs).
 */
export async function getUserHistory(userId: string): Promise<{
  watchedMovies: Array<{
    id: string;
    movieId: number;
    movieTitle: string;
    addedAt: Date;
  }>;
  listenedSongs: Array<{
    id: string;
    trackId: string;
    trackName: string;
    artist: string;
    addedAt: Date;
  }>;
}> {
  try {
    const [watchedMovies, listenedSongs] = await Promise.all([
      prisma.watchedMovie.findMany({
        where: { userId },
        orderBy: { addedAt: "desc" }
      }),
      prisma.listenedSong.findMany({
        where: { userId },
        orderBy: { addedAt: "desc" }
      })
    ] as const);

    return {
      watchedMovies: watchedMovies.map((m) => ({
        id: m.id,
        movieId: m.movieId,
        movieTitle: m.movieTitle,
        addedAt: m.addedAt
      })),
      listenedSongs: listenedSongs.map((s) => ({
        id: s.id,
        trackId: s.trackId,
        trackName: s.trackName,
        artist: s.artist,
        addedAt: s.addedAt
      }))
    };
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to get user history: ${String(error)}`);
  }
}

/**
 * Generate recommendations based on the user's saved history.
 * Returns movie and song recommendations by analyzing their watched/listened content.
 */
export async function getRecommendationsFromHistory(userId: string): Promise<{
  movieRecommendations: Array<{
    id: number;
    title: string;
    releaseYear: number | null;
    overview: string | null;
    posterUrl: string | null;
    genres: string[];
  }>;
  songRecommendations: Array<{
    id: string;
    name: string;
    artists: string[];
    album: string;
    releaseYear: number | null;
    previewUrl: string | null;
    popularity?: number;
  }>;
}> {
  try {
    const history = await getUserHistory(userId);

    // Get recommendations for the last 3 watched movies
    const recentMovies = history.watchedMovies.slice(0, 3);
    const movieRecsPromises = recentMovies.map((m) =>
      getMovieRecommendations(m.movieId).catch((err) => {
        console.error("getMovieRecommendations error:", err);
        return [] as any[];
      })
    );
    const movieRecsArrays = await Promise.all(movieRecsPromises);
    const movieRecommendations = uniqueById(movieRecsArrays.flat()).slice(0, 10);

    // Get recommendations for the last 3 listened songs
    const recentSongs = history.listenedSongs.slice(0, 3);
    const songRecsPromises = recentSongs.map((s) =>
      getTrackRecommendations([s.trackId]).catch((err) => {
        console.error("getTrackRecommendations error:", err);
        return [] as any[];
      })
    );
    const songRecsArrays = await Promise.all(songRecsPromises);
    const songRecommendations = uniqueById(songRecsArrays.flat()).slice(0, 10);

    return {
      movieRecommendations,
      songRecommendations
    };
  } catch (error) {
    throw new Error(`Failed to get recommendations from history: ${error}`);
  }
}
