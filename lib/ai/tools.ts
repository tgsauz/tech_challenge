/**
 * OpenAI tool definitions and execution logic.
 * Maps tool names to our actual functions (TMDB, Spotify, persistence, cross-reference).
 */

import OpenAI from "openai";
import { z } from "zod";
import {
  searchMovies,
  getMovieDetails,
  getMovieRecommendations,
  getMovieSoundtrack
} from "../tmdb";
import {
  searchTracks,
  getTrackDetails,
  getTrackRecommendations,
  getTrackAlbum
} from "../spotify";
import {
  saveWatchedMovie,
  saveListenedSong,
  getUserHistory,
  getRecommendationsFromHistory,
  getUserFeedback
} from "../persistence";
import { findMoviesWithSong, findSongsInMovie } from "../crossReference";
import { getSemanticMovieRecommendations } from "../semanticRecommendations";

/**
 * Define all available tools for OpenAI function calling.
 * Each tool has a name, description, and Zod schema for parameters.
 */
export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  // TMDB tools
  {
    type: "function",
    function: {
      name: "search_movies",
      description:
        "Search for movies by title. Use this when the user mentions a movie name or asks about movies.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Movie title to search for"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_movie_details",
      description:
        "Get detailed information about a specific movie by its TMDB ID. Use this after searching for a movie to get full details.",
      parameters: {
        type: "object",
        properties: {
          movie_id: {
            type: "number",
            description: "TMDB movie ID"
          }
        },
        required: ["movie_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_movie_recommendations",
      description:
        "Get movie recommendations based on a movie ID. Use this when the user wants similar movies or recommendations.",
      parameters: {
        type: "object",
        properties: {
          movie_id: {
            type: "number",
            description: "TMDB movie ID to get recommendations for"
          }
        },
        required: ["movie_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_semantic_movie_recommendations",
      description:
        "Get semantically similar movie recommendations based on embeddings + Supabase. Prefer this when the user asks for 'movies like X' or 'similar to X' for better thematic matches.",
      parameters: {
        type: "object",
        properties: {
          movie_id: {
            type: "number",
            description: "TMDB movie ID for the seed movie"
          }
        },
        required: ["movie_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_movie_soundtrack",
      description:
        "Get soundtrack/music information for a movie. Use this when the user asks about songs in a movie.",
      parameters: {
        type: "object",
        properties: {
          movie_id: {
            type: "number",
            description: "TMDB movie ID"
          }
        },
        required: ["movie_id"]
      }
    }
  },
  // Spotify tools
  {
    type: "function",
    function: {
      name: "search_tracks",
      description:
        "Search for songs/tracks on Spotify. Use this when the user mentions a song name or artist.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Song name, artist, or combination to search for"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_track_details",
      description:
        "Get detailed information about a specific track by its Spotify ID.",
      parameters: {
        type: "object",
        properties: {
          track_id: {
            type: "string",
            description: "Spotify track ID"
          }
        },
        required: ["track_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_track_recommendations",
      description:
        "Get song recommendations based on seed tracks. Use this when the user wants similar songs.",
      parameters: {
        type: "object",
        properties: {
          seed_tracks: {
            type: "array",
            items: { type: "string" },
            description: "Array of Spotify track IDs (1-5 tracks)"
          }
        },
        required: ["seed_tracks"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_track_albums",
      description:
        "Get album information for a track. Useful for finding soundtrack albums.",
      parameters: {
        type: "object",
        properties: {
          track_id: {
            type: "string",
            description: "Spotify track ID"
          }
        },
        required: ["track_id"]
      }
    }
  },
  // Cross-reference tools
  {
    type: "function",
    function: {
      name: "find_movies_with_song",
      description:
        "Find movies that feature a specific song. Use this when the user asks 'which movies have this song?' or similar.",
      parameters: {
        type: "object",
        properties: {
          song_name: {
            type: "string",
            description: "Name of the song"
          },
          artist: {
            type: "string",
            description: "Optional: artist name for better matching"
          }
        },
        required: ["song_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_songs_in_movie",
      description:
        "Find songs featured in a specific movie. Use this when the user asks 'what songs are in this movie?' or 'soundtrack of X'.",
      parameters: {
        type: "object",
        properties: {
          movie_title: {
            type: "string",
            description: "Title of the movie"
          }
        },
        required: ["movie_title"]
      }
    }
  },
  // Persistence tools
  {
    type: "function",
    function: {
      name: "save_watched_movie",
      description:
        "Save a movie to the user's watched list. Use this when the user says they watched, liked, or enjoyed a movie.",
      parameters: {
        type: "object",
        properties: {
          movie_id: {
            type: "number",
            description: "TMDB movie ID"
          },
          movie_title: {
            type: "string",
            description: "Movie title"
          },
          user_id: {
            type: "string",
            description: "User ID"
          }
        },
        required: ["movie_id", "movie_title", "user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_listened_song",
      description:
        "Save a song to the user's listened list. Use this when the user says they listened to, liked, or enjoyed a song.",
      parameters: {
        type: "object",
        properties: {
          track_id: {
            type: "string",
            description: "Spotify track ID"
          },
          track_name: {
            type: "string",
            description: "Track name"
          },
          artist: {
            type: "string",
            description: "Artist name(s)"
          },
          user_id: {
            type: "string",
            description: "User ID"
          }
        },
        required: ["track_id", "track_name", "artist", "user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_history",
      description:
        "Get the user's watched movies and listened songs history. Use this when the user asks about their history or what they've watched/listened to.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "User ID"
          }
        },
        required: ["user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recommendations_from_history",
      description:
        "Generate personalized recommendations based on the user's saved history. Use this when the user asks for recommendations based on what they've watched/listened to.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "User ID"
          }
        },
        required: ["user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_feedback",
      description:
        "Get the user's feedback (likes/dislikes) for items. Use this to refine recommendations and avoid items similar to disliked ones while prioritizing liked ones.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "User ID"
          }
        },
        required: ["user_id"]
      }
    }
  }
];

/**
 * Execute a tool call from OpenAI.
 * Maps tool names to our actual functions and handles errors gracefully.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string
): Promise<{ result: unknown; error?: string }> {
  try {
    switch (toolName) {
      // TMDB tools
      case "search_movies": {
        const schema = z.object({ query: z.string() });
        const { query } = schema.parse(args);
        const results = await searchMovies(query);
        return { result: results };
      }
      case "get_movie_details": {
        const schema = z.object({ movie_id: z.number() });
        const { movie_id } = schema.parse(args);
        const result = await getMovieDetails(movie_id);
        return { result };
      }
      case "get_movie_recommendations": {
        const schema = z.object({ movie_id: z.number() });
        const { movie_id } = schema.parse(args);
        const results = await getMovieRecommendations(movie_id);
        return { result: results };
      }
      case "get_semantic_movie_recommendations": {
        const schema = z.object({ movie_id: z.number() });
        const { movie_id } = schema.parse(args);
        const seed = await getMovieDetails(movie_id);
        const results = await getSemanticMovieRecommendations(seed);
        return { result: results };
      }
      case "get_movie_soundtrack": {
        const schema = z.object({ movie_id: z.number() });
        const { movie_id } = schema.parse(args);
        const results = await getMovieSoundtrack(movie_id);
        return { result: results };
      }
      // Spotify tools
      case "search_tracks": {
        const schema = z.object({ query: z.string() });
        const { query } = schema.parse(args);
        const results = await searchTracks(query);
        return { result: results };
      }
      case "get_track_details": {
        const schema = z.object({ track_id: z.string() });
        const { track_id } = schema.parse(args);
        const result = await getTrackDetails(track_id);
        return { result };
      }
      case "get_track_recommendations": {
        const schema = z.object({ seed_tracks: z.array(z.string()) });
        const { seed_tracks } = schema.parse(args);
        const results = await getTrackRecommendations(seed_tracks);
        return { result: results };
      }
      case "get_track_albums": {
        const schema = z.object({ track_id: z.string() });
        const { track_id } = schema.parse(args);
        const result = await getTrackAlbum(track_id);
        return { result };
      }
      // Cross-reference tools
      case "find_movies_with_song": {
        const schema = z.object({
          song_name: z.string(),
          artist: z.string().optional()
        });
        const { song_name, artist } = schema.parse(args);
        const results = await findMoviesWithSong(song_name, artist);
        return { result: results };
      }
      case "find_songs_in_movie": {
        const schema = z.object({ movie_title: z.string() });
        const { movie_title } = schema.parse(args);
        const results = await findSongsInMovie(movie_title);
        return { result: results };
      }
      // Persistence tools
      case "save_watched_movie": {
        const schema = z.object({
          movie_id: z.number(),
          movie_title: z.string(),
          user_id: z.string()
        });
        const { movie_id, movie_title, user_id } = schema.parse(args);
        await saveWatchedMovie(user_id, movie_id, movie_title);
        return { result: { success: true, message: "Movie saved to history" } };
      }
      case "save_listened_song": {
        const schema = z.object({
          track_id: z.string(),
          track_name: z.string(),
          artist: z.string(),
          user_id: z.string()
        });
        const { track_id, track_name, artist, user_id } = schema.parse(args);
        await saveListenedSong(user_id, track_id, track_name, artist);
        return { result: { success: true, message: "Song saved to history" } };
      }
      case "get_user_history": {
        const schema = z.object({ user_id: z.string() });
        const { user_id } = schema.parse(args);
        const result = await getUserHistory(user_id);
        return { result };
      }
      case "get_recommendations_from_history": {
        const schema = z.object({ user_id: z.string() });
        const { user_id } = schema.parse(args);
        const result = await getRecommendationsFromHistory(user_id);
        return { result };
      }
      case "get_user_feedback": {
        const schema = z.object({ user_id: z.string() });
        const { user_id } = schema.parse(args);
        const result = await getUserFeedback(user_id);
        return { result };
      }
      default:
        return {
          result: null,
          error: `Unknown tool: ${toolName}`
        };
    }
  } catch (error) {
    return {
      result: null,
      error:
        error instanceof Error
          ? error.message
          : `Tool execution failed: ${String(error)}`
    };
  }
}
