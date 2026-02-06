/**
 * OpenAI chat orchestration with tool calling.
 * Handles the conversation flow: user message → tool calls → assistant response.
 */

import OpenAI from "openai";
import { config, ensureServerEnv } from "../config";
import { prisma } from "../prisma";
import { tools, executeTool } from "./tools";
import { searchMovies, getMovieDetails, getMovieRecommendations } from "../tmdb";
import { getSemanticMovieRecommendations } from "../semanticRecommendations";
import { getRecommendationsFromHistory } from "../persistence";

const GENRE_ALIASES: Record<string, string[]> = {
  "Action": ["action"],
  "Adventure": ["adventure"],
  "Animation": ["animation", "animated"],
  "Comedy": ["comedy", "comedies", "funny"],
  "Crime": ["crime", "criminal"],
  "Documentary": ["documentary", "documentaries", "doc"],
  "Drama": ["drama", "dramatic"],
  "Family": ["family", "kids", "kid", "children"],
  "Fantasy": ["fantasy", "fantastical"],
  "History": ["history", "historical"],
  "Horror": ["horror", "scary", "frightening"],
  "Music": ["music", "musical"],
  "Mystery": ["mystery"],
  "Romance": ["romance", "romantic", "love story"],
  "Science Fiction": [
    "science fiction",
    "sci fi",
    "sci-fi",
    "scifi"
  ],
  "TV Movie": ["tv movie", "television movie", "tv-movie"],
  "Thriller": ["thriller", "thrillers"],
  "War": ["war", "warfare"],
  "Western": ["western", "west"]
};

const AVOID_CUES = ["avoid", "no", "not", "without", "exclude", "skip"];
const RECENT_CUES = ["recent", "newer", "latest", "modern", "not so old"];
const RECOMMENDATION_CUES = [
  "recommend",
  "recommendation",
  "movies like",
  "similar to",
  "suggest"
];
const FRANCHISE_CUES = ["saga", "series", "franchise"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractExcludedGenres(message: string): string[] {
  const lower = message.toLowerCase();
  const hasCue = AVOID_CUES.some((cue) =>
    new RegExp(`\\b${escapeRegExp(cue)}\\b`, "i").test(lower)
  );
  if (!hasCue) return [];

  const excluded: string[] = [];
  for (const [genre, aliases] of Object.entries(GENRE_ALIASES)) {
    for (const alias of aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (pattern.test(lower)) {
        excluded.push(genre);
        break;
      }
    }
  }

  return Array.from(new Set(excluded));
}

function extractYearConstraints(message: string): {
  minYear?: number;
  maxYear?: number;
  notAsOldAsTitle?: string;
} {
  const lower = message.toLowerCase();
  const currentYear = new Date().getFullYear();
  const matchAfter = lower.match(/\b(after|since)\s+(19|20)\d{2}\b/);
  if (matchAfter) {
    const year = parseInt(matchAfter[0].slice(-4), 10);
    return { minYear: year };
  }
  const matchAtLeast = lower.match(/\bat least (?:from|since)?\s*(19|20)\d{2}\b/);
  if (matchAtLeast) {
    const year = parseInt(matchAtLeast[0].slice(-4), 10);
    return { minYear: year };
  }
  const matchBefore = lower.match(/\b(before|older than)\s+(19|20)\d{2}\b/);
  if (matchBefore) {
    const year = parseInt(matchBefore[0].slice(-4), 10);
    return { maxYear: year };
  }
  const matchLastYears = lower.match(/\blast\s+(\d{1,2})\s+years?\b/);
  if (matchLastYears) {
    const years = parseInt(matchLastYears[1], 10);
    if (!Number.isNaN(years)) {
      return { minYear: currentYear - years };
    }
  }
  const hasRecentCue = RECENT_CUES.some((cue) =>
    new RegExp(`\\b${escapeRegExp(cue)}\\b`, "i").test(lower)
  );
  if (hasRecentCue) {
    return { minYear: currentYear - 15 };
  }
  const notAsOldAs = message.match(/not as old as\s+([^\n.,;!?]+)/i);
  if (notAsOldAs && notAsOldAs[1]) {
    const raw = notAsOldAs[1];
    const cleaned = raw.split(/but|and|without|avoid/i)[0]?.trim();
    if (cleaned) return { notAsOldAsTitle: cleaned };
  }
  return {};
}

function isRecommendationIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return RECOMMENDATION_CUES.some((cue) => lower.includes(cue));
}

function extractSeedTitle(message: string): string | null {
  const quoted = message.match(/["“”']([^"“”']+)["“”']/);
  if (quoted && quoted[1]) return quoted[1].trim();

  const likeMatch = message.match(/(?:like|similar to)\s+([^\n.,;!?]+)/i);
  if (likeMatch && likeMatch[1]) {
    const raw = likeMatch[1];
    const cleaned = raw.split(/but|and|without|avoid/i)[0]?.trim();
    if (cleaned) return cleaned;
  }

  return null;
}

function extractExcludedTitles(message: string): string[] {
  const lower = message.toLowerCase();
  const hasCue = AVOID_CUES.some((cue) =>
    new RegExp(`\\b${escapeRegExp(cue)}\\b`, "i").test(lower)
  );
  if (!hasCue) return [];

  const excluded: string[] = [];

  const quoted = [...message.matchAll(/["“”']([^"“”']+)["“”']/g)];
  for (const match of quoted) {
    if (!match[1]) continue;
    const before = message.slice(0, match.index ?? 0).toLowerCase();
    if (AVOID_CUES.some((cue) => before.includes(cue))) {
      excluded.push(match[1].trim());
    }
  }

  const franchiseMatch = message.match(
    /avoid(?: any| the)?(?: movies)?(?: from)?(?: the)?\s+(.+?)\s+(saga|series|franchise)/i
  );
  if (franchiseMatch && franchiseMatch[1]) {
    excluded.push(franchiseMatch[1].trim());
  }

  if (lower.includes("star trek") && hasCue) {
    excluded.push("Star Trek");
  }

  return Array.from(new Set(excluded));
}

function contentToString(
  content: OpenAI.Chat.Completions.ChatCompletionMessageParam["content"]
): string {
  return typeof content === "string" ? content : "";
}

function filterExcludedTitles<T extends { title: string }>(
  items: T[],
  excludedTitles: string[]
): T[] {
  if (!excludedTitles.length) return items;
  return items.filter((item) => {
    const title = item.title.toLowerCase();
    return excludedTitles.every((ex) => !title.includes(ex.toLowerCase()));
  });
}

async function buildRecommendationResponse(
  userMessage: string,
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  userId: string
): Promise<string | null> {
  const excludedGenres = extractExcludedGenres(userMessage);
  const excludedTitles = extractExcludedTitles(userMessage);
  const yearConstraints = extractYearConstraints(userMessage);

  const seedFromMessage = extractSeedTitle(userMessage);
  const lastUserMessage = [...history]
    .reverse()
    .find((m) => m.role === "user" && m.content);
  const seedFromHistory = seedFromMessage
    ? null
    : lastUserMessage
      ? extractSeedTitle(contentToString(lastUserMessage.content))
      : null;
  const seedTitle = seedFromMessage ?? seedFromHistory;

  let minYear = yearConstraints.minYear;
  let maxYear = yearConstraints.maxYear;

  if (yearConstraints.notAsOldAsTitle) {
    const search = await searchMovies(yearConstraints.notAsOldAsTitle);
    const seed = search[0];
    if (seed?.releaseYear) {
      minYear = seed.releaseYear + 1;
    }
  }

  let movies: Array<{
    id: number | string;
    title: string;
    overview: string | null;
    releaseYear: number | null;
    posterUrl: string | null;
    genres: string[];
    matchConfidence?: "high" | "medium" | "low";
  }> = [];

  if (seedTitle) {
    const search = await searchMovies(seedTitle);
    const seed = search[0];
    if (seed) {
      const seedDetails = await getMovieDetails(seed.id);
      const semantic = await getSemanticMovieRecommendations(seedDetails, {
        excludeGenres: excludedGenres,
        minYear,
        maxYear
      });
      const requiresSciFi = seedDetails.genres.includes("Science Fiction");
      const semanticFiltered = requiresSciFi
        ? semantic.filter((m) => m.genres.includes("Science Fiction"))
        : semantic;
      const semanticNoTitles = filterExcludedTitles(
        semanticFiltered,
        excludedTitles
      );
      if (semanticNoTitles.length > 0) {
        movies = semanticNoTitles;
      } else {
        const tmdb = await getMovieRecommendations(seed.id, {
          excludeGenres: excludedGenres,
          minYear,
          maxYear
        });
        const tmdbNoTitles = filterExcludedTitles(tmdb, excludedTitles);
        movies = requiresSciFi
          ? tmdbNoTitles.filter((m) => m.genres.includes("Science Fiction"))
          : tmdbNoTitles;
      }
    }
  }

  if (movies.length === 0) {
    const historyRecs = await getRecommendationsFromHistory(userId, {
      excludeGenres: excludedGenres,
      minYear,
      maxYear
    });
    movies = filterExcludedTitles(
      historyRecs.movieRecommendations,
      excludedTitles
    );
  }

  if (movies.length === 0) return null;

  const excludedNote =
    excludedGenres.length > 0
      ? ` Excluding: ${excludedGenres.join(", ")}.`
      : "";
  const yearNote =
    typeof minYear === "number"
      ? ` From ${minYear} onward.`
      : "";

  return JSON.stringify({
    message: seedTitle
      ? `Here are recommendations similar to ${seedTitle}.${excludedNote}${yearNote}`
      : `Here are recommendations based on your history.${excludedNote}${yearNote}`,
    reasoning: "Matched themes and applied your constraints.",
    movies
  });
}

/**
 * Few-shot examples (concise, format-focused)
 * These guide tool usage and response structure without leaking chain-of-thought.
 */
const FEW_SHOT_EXAMPLES = `
Examples:
User: "Movies like Inception, please."
Assistant:
{
  "message": "Here are movies that match Inception's mind-bending sci-fi tone and layered narrative.",
  "reasoning": "These share similar themes and atmospheric tension.",
  "movies": [
    { "id": 123, "title": "Example Movie", "overview": "A brief overview.", "releaseYear": 2010, "posterUrl": "https://...", "genres": ["Sci-Fi"], "matchConfidence": "high" }
  ],
}

`;

// System prompt that defines the bot's role and behavior
const SYSTEM_PROMPT = `You are Gleni, a helpful AI assistant specialized in discovering movies. Your goal is to help users find new content they'll love by:

1. Understanding what they like (movies they've watched)
2. Using real data from TMDB (movies) to provide accurate recommendations
3. Remembering user preferences by saving their watched movies

Important guidelines:
- Always use tools to get real data. Never make up movie titles or details.
- When a user mentions they watched/liked a movie, use save_watched_movie to remember it.
- For recommendations, use get_movie_recommendations based on specific items, or get_recommendations_from_history for personalized suggestions.
- For thematic \"movies like X\" questions, PREFER get_semantic_movie_recommendations over get_movie_recommendations, because it uses embeddings + Supabase for better similarity.
- Use get_user_feedback to learn what the user likes/dislikes and refine recommendations. Prioritize items similar to liked entries and down-rank items similar to disliked entries (do not hard-exclude unless the user asks).

Reasoning:
- Before deciding which tools to call, think step by step about the user's intent and which tools are most appropriate.
- Keep chain-of-thought private; do NOT include step-by-step reasoning. You must include a short "reasoning" field in the JSON (1-2 sentences) that explains at a high level why the results were chosen.

Opinions & explanations:
- If the user asks for your opinion, provide a short, friendly opinion and explain it using concrete shared traits (themes, tone, genre, or narrative elements).
- When recommending movies, include a brief explanation in the "message" for why those items fit the request. If possible, mention 2-3 shared traits with the user's reference.

CRITICAL: Final response format
- Your final answer (after using any tools) MUST be a single JSON object, and nothing else.
- Do NOT include markdown, headings, or surrounding prose outside the JSON.
- The JSON must have this shape (fields may be empty, but must exist):
{
  "message": "short friendly explanation in plain text",
  "reasoning": "very short explanation of why these results were chosen",
  "movies": [
    {
      "id": 123,
      "title": "Movie Title",
      "overview": "Short overview",
      "releaseYear": 2020,
      "posterUrl": "https://...",
      "genres": ["Action", "Sci-Fi"],
      "matchConfidence": "high"
    }
  ]
}

- Always include a helpful "message" string summarizing what you did.
- Include a concise "reasoning" field describing why you chose these movies (one or two sentences, no step-by-step).
- Use "movies" for any movie recommendations or results (can be empty array).
- - Keep titles and overviews concise so they fit nicely in UI cards.
${FEW_SHOT_EXAMPLES}`;

/**
 * Get conversation history from the database.
 */
async function getConversationHistory(
  conversationId: string,
  limit: number = 20
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      role: { in: ["user", "assistant", "system"] }
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  const allowedRoles = ["user", "assistant", "system"] as const;

  return messages.map((msg: { role: string; content: string | null }) => {
    const rawRole = typeof msg.role === "string" ? msg.role : "system";
    const role = (allowedRoles.includes(rawRole as any)
      ? (rawRole as typeof allowedRoles[number])
      : "system");

    return {
      role,
      content: msg.content ?? ""
    };
  });
}

/**
 * Main chat function: processes user message and returns assistant response.
 * Handles tool calling in a loop until OpenAI returns a final answer.
 */
export async function chatWithTools(
  userId: string,
  conversationId: string | null,
  userMessage: string
): Promise<{
  assistantMessage: string;
  newConversationId: string;
  debugEvents: Array<{ id: string; type: string; message: string }>;
}> {
  ensureServerEnv();

  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: config.openAiApiKey,
    timeout: 20000
  });

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
    const conv = await prisma.conversation.create({
      data: { userId }
    });
    convId = conv.id;
  }

  if (!convId) {
    throw new Error("Conversation ID was not created")
  }

  // Save user message
  await prisma.message.create({
    data: {
      conversationId: convId,
      role: "user",
      content: userMessage
    }
  });

  // Get conversation history
  const history = await getConversationHistory(convId);

  // Build messages array for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage }
  ];

  const debugEvents: Array<{ id: string; type: string; message: string }> = [];
  const wantsRecommendations = isRecommendationIntent(userMessage);

  if (wantsRecommendations) {
    const override = await buildRecommendationResponse(
      userMessage,
      history,
      userId
    );
    if (override) {
      await prisma.message.create({
        data: {
          conversationId: convId,
          role: "assistant",
          content: override
        }
      });
      return {
        assistantMessage: override,
        newConversationId: convId,
        debugEvents
      };
    }
  }

  // Tool calling loop (max 5 iterations to avoid infinite loops)
  let finalResponse = "";
  let iteration = 0;
  const maxIterations = 5;

  while (iteration < maxIterations) {
    iteration++;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency, can switch to gpt-4o if needed
      messages,
      tools,
      tool_choice: "auto"
    });

    const choice = completion.choices[0];
    if (completion.usage) {
      debugEvents.push({
        id: `tokens-${iteration}-${crypto.randomUUID()}`,
        type: "tokens",
        message: JSON.stringify(completion.usage)
      });
    }
    if (!choice.message) {
      throw new Error("OpenAI returned no message");
    }

    // Add assistant message to history
    messages.push({
      role: "assistant",
      content: choice.message.content ?? "",
      tool_calls: choice.message.tool_calls
    });

    // If no tool calls, we're done
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      finalResponse = choice.message.content || "I apologize, but I couldn't generate a response.";
      break;
    }

    // Execute all tool calls
    const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    for (const toolCall of choice.message.tool_calls) {
      const toolName = toolCall.function.name;
      let args: Record<string, unknown>;
      
      try {
        args = JSON.parse(toolCall.function.arguments ?? "{}");
      } catch {
        debugEvents.push({
          id: `tool-error-${crypto.randomUUID()}`,
          type: "tool_error",
          message: `Failed to parse arguments for ${toolName}`
        });
        continue;
      }

      // Add user_id to persistence tools automatically
      if (
        toolName.includes("save") ||
        toolName.includes("get_user") ||
        toolName.includes("get_recommendations_from_history")
      ) {
        args.user_id = userId;
      }

      debugEvents.push({
        id: `tool-${toolCall.id}`,
        type: `tool_call:${toolName}`,
        message: `Called ${toolName} with args: ${JSON.stringify(args).substring(0, 100)}...`
      });

      const { result, error } = await executeTool(toolName, args, userId);

      if (error) {
        debugEvents.push({
          id: `tool-error-${toolCall.id}-${crypto.randomUUID()}`,
          type: "tool_error",
          message: `${toolName} failed: ${error}`
        });
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error })
        });
      } else {
        debugEvents.push({
          id: `tool-success-${toolCall.id}`,
          type: `tool_success:${toolName}`,
          message: `${toolName} completed successfully`
        });
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    // Add tool results to messages for next iteration
    messages.push(...toolResults);
  }

  if (iteration >= maxIterations) {
    finalResponse =
      "I apologize, but I reached the maximum number of tool calls. Please try rephrasing your question.";
  }


  // Save assistant message
  await prisma.message.create({
    data: {
      conversationId: convId,
      role: "assistant",
      content: finalResponse
    }
  });

  return {
    assistantMessage: finalResponse,
    newConversationId: convId,
    debugEvents
  };
}
