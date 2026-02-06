/**
 * OpenAI tool definitions and execution logic.
 * Maps tool names to our actual functions (TMDB, persistence, cross-reference).
 */

import OpenAI from "openai";
import { z } from "zod";
import {
  searchMovies,
  getMovieDetails,
  getMovieRecommendations
} from "../tmdb";
import {
  saveWatchedMovie,
  getUserHistory,
  getRecommendationsFromHistory,
  getUserFeedback
} from "../persistence";
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
  // Cross-reference tools
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
      name: "get_user_history",
      description:
        "Get the user's watched movies history. Use this when the user asks about their history or what they've watched.",
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
        "Generate personalized recommendations based on the user's saved history. Use this when the user asks for recommendations based on what they've watched.",
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
        try {
          const results = await getSemanticMovieRecommendations(seed);
          if (!results || results.length === 0) {
            const fallback = await getMovieRecommendations(movie_id);
            return { result: fallback };
          }
          return { result: results };
        } catch (error) {
          console.warn(
            "Semantic recommendations failed, falling back to TMDB:",
            error
          );
          const fallback = await getMovieRecommendations(movie_id);
          return { result: fallback };
        }
      }
      // Cross-reference tools
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
