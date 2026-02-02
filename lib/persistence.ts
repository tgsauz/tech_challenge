/**
 * Persistence helpers for user history (watched movies, listened songs).
 * Uses Prisma to interact with SQLite database.
 */

import { prisma } from "./prisma";
import { getMovieRecommendations } from "./tmdb";
import { getTrackRecommendations } from "./spotify";

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
        // If it exists, just update the timestamp
        movieTitle
      }
    });
  } catch (error) {
    throw new Error(`Failed to save watched movie: ${error}`);
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
        // If it exists, just update the timestamp
        trackName,
        artist
      }
    });
  } catch (error) {
    throw new Error(`Failed to save listened song: ${error}`);
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
    ]);

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
    throw new Error(`Failed to get user history: ${error}`);
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
      getMovieRecommendations(m.movieId).catch(() => [])
    );
    const movieRecsArrays = await Promise.all(movieRecsPromises);
    const movieRecommendations = movieRecsArrays
      .flat()
      .filter(
        (movie, index, self) =>
          index === self.findIndex((m) => m.id === movie.id)
      )
      .slice(0, 10); // Limit to 10 unique recommendations

    // Get recommendations for the last 3 listened songs
    const recentSongs = history.listenedSongs.slice(0, 3);
    const songRecsPromises = recentSongs.map((s) =>
      getTrackRecommendations([s.trackId]).catch(() => [])
    );
    const songRecsArrays = await Promise.all(songRecsPromises);
    const songRecommendations = songRecsArrays
      .flat()
      .filter(
        (song, index, self) =>
          index === self.findIndex((s) => s.id === song.id)
      )
      .slice(0, 10); // Limit to 10 unique recommendations

    return {
      movieRecommendations,
      songRecommendations
    };
  } catch (error) {
    throw new Error(`Failed to get recommendations from history: ${error}`);
  }
}
