/**
 * Cross-reference logic: finding connections between movies and songs.
 * Combines TMDB and Spotify APIs to answer questions like:
 * - "What songs are in this movie?"
 * - "Which movies feature this song?"
 */

import { searchMovies, getMovieSoundtrack } from "./tmdb";
import { searchTracks } from "./spotify";

export type MovieWithSongMatch = {
  movieId: number;
  title: string;
  releaseYear: number | null;
  matchConfidence: "high" | "medium" | "low";
};

/**
 * Find movies that feature a specific song.
 * Strategy:
 * 1. Search Spotify to find the canonical song
 * 2. Search TMDB for movies with the song name in title/keywords
 * 3. Check soundtrack data for matches
 * 
 * Note: This is best-effort since TMDB doesn't have perfect soundtrack data.
 */
export async function findMoviesWithSong(
  songName: string,
  artist?: string
): Promise<MovieWithSongMatch[]> {
  try {
    // Step 1: Find the song on Spotify to get canonical name
    const searchQuery = artist ? `${songName} ${artist}` : songName;
    const spotifyResults = await searchTracks(searchQuery);
    
    if (spotifyResults.length === 0) {
      return [];
    }

    const canonicalSong = spotifyResults[0];

    // Step 2: Search TMDB for movies that might contain this song
    // We'll search with the song name and also check soundtrack data
    const movieSearchQueries = [
      songName,
      canonicalSong.name,
      ...(artist ? [artist] : [])
    ];

    const movieCandidates: Map<number, MovieWithSongMatch> = new Map();

    for (const query of movieSearchQueries.slice(0, 2)) {
      // Limit to avoid too many API calls
      const movies = await searchMovies(query);
      
      for (const movie of movies.slice(0, 5)) {
        // Step 3: Check soundtrack for this movie
        try {
          const soundtrack = await getMovieSoundtrack(movie.id);
          
          // Look for matches in soundtrack data
          const hasMatch = soundtrack.some(
            (item) =>
              item.songTitle.toLowerCase().includes(songName.toLowerCase()) ||
              item.artist?.toLowerCase().includes(artist?.toLowerCase() || "") ||
              item.songTitle.toLowerCase().includes(canonicalSong.name.toLowerCase())
          );

          if (hasMatch) {
            movieCandidates.set(movie.id, {
              movieId: movie.id,
              title: movie.title,
              releaseYear: movie.releaseYear,
              matchConfidence: "high"
            });
          } else {
            // Lower confidence if movie title matches but soundtrack doesn't confirm
            if (!movieCandidates.has(movie.id)) {
              movieCandidates.set(movie.id, {
                movieId: movie.id,
                title: movie.title,
                releaseYear: movie.releaseYear,
                matchConfidence: "medium"
              });
            }
          }
        } catch {
          // If soundtrack check fails, still add with low confidence
          if (!movieCandidates.has(movie.id)) {
            movieCandidates.set(movie.id, {
              movieId: movie.id,
              title: movie.title,
              releaseYear: movie.releaseYear,
              matchConfidence: "low"
            });
          }
        }
      }
    }

    // Sort by confidence (high -> medium -> low) and return
    const results = Array.from(movieCandidates.values());
    results.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      return confidenceOrder[b.matchConfidence] - confidenceOrder[a.matchConfidence];
    });

    return results.slice(0, 10); // Limit to top 10
  } catch (error) {
    throw new Error(`Failed to find movies with song: ${error}`);
  }
}

export type SongInMovie = {
  trackId?: string;
  trackName: string;
  artist?: string;
  source: "tmdb" | "spotify" | "combined";
};

/**
 * Find songs featured in a specific movie.
 * Strategy:
 * 1. Search TMDB for the movie
 * 2. Get soundtrack data from TMDB (best-effort)
 * 3. Search Spotify for soundtrack albums/playlists
 * 4. Merge and deduplicate results
 */
export async function findSongsInMovie(
  movieTitle: string
): Promise<SongInMovie[]> {
  try {
    // Step 1: Find the movie on TMDB
    const movies = await searchMovies(movieTitle);
    
    if (movies.length === 0) {
      return [];
    }

    const movie = movies[0]; // Use top result
    const songs: Map<string, SongInMovie> = new Map();

    // Step 2: Get soundtrack hints from TMDB
    try {
      const soundtrack = await getMovieSoundtrack(movie.id);
      
      for (const item of soundtrack) {
        const key = `${item.songTitle}-${item.artist || ""}`.toLowerCase();
        songs.set(key, {
          trackName: item.songTitle,
          artist: item.artist,
          source: "tmdb"
        });
      }
    } catch {
      // If TMDB soundtrack fails, continue with Spotify search
    }

    // Step 3: Search Spotify for soundtrack albums/playlists
    const spotifyQueries = [
      `${movieTitle} soundtrack`,
      `${movieTitle} original soundtrack`,
      `${movieTitle} OST`
    ];

    for (const query of spotifyQueries.slice(0, 2)) {
      // Limit to avoid rate limits
      try {
        const spotifyResults = await searchTracks(query);
        
        for (const track of spotifyResults.slice(0, 10)) {
          const key = `${track.name}-${track.artists.join(",")}`.toLowerCase();
          
          if (!songs.has(key)) {
            songs.set(key, {
              trackId: track.id,
              trackName: track.name,
              artist: track.artists.join(", "),
              source: "spotify"
            });
          } else {
            // Upgrade to "combined" if we have both sources
            const existing = songs.get(key)!;
            if (existing.source !== "combined") {
              songs.set(key, {
                ...existing,
                trackId: track.id,
                source: "combined"
              });
            }
          }
        }
      } catch {
        // If Spotify search fails, continue
      }
    }

    // Return as array, sorted by source priority (combined > spotify > tmdb)
    const results = Array.from(songs.values());
    results.sort((a, b) => {
      const sourceOrder = { combined: 3, spotify: 2, tmdb: 1 };
      return sourceOrder[b.source] - sourceOrder[a.source];
    });

    return results.slice(0, 20); // Limit to top 20 songs
  } catch (error) {
    throw new Error(`Failed to find songs in movie: ${error}`);
  }
}
