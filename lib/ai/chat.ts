/**
 * OpenAI chat orchestration with tool calling.
 * Handles the conversation flow: user message → tool calls → assistant response.
 */

import OpenAI from "openai";
import { config, ensureServerEnv } from "../config";
import { prisma } from "../prisma";
import { tools, executeTool } from "./tools";

// System prompt that defines the bot's role and behavior
const SYSTEM_PROMPT = `You are Gleni, a helpful AI assistant specialized in discovering movies and music. Your goal is to help users find new content they'll love by:

1. Understanding what they like (movies they've watched, songs they've listened to)
2. Using real data from TMDB (movies) and Spotify (music) to provide accurate recommendations
3. Cross-referencing movies and songs (e.g., "What songs are in this movie?" or "Which movies feature this song?")
4. Remembering user preferences by saving their watched movies and listened songs

Important guidelines:
- Always use tools to get real data. Never make up movie titles, song names, or details.
- When a user mentions they watched/liked a movie, use save_watched_movie to remember it.
- When a user mentions they listened/liked a song, use save_listened_song to remember it.
- For recommendations, use get_movie_recommendations or get_track_recommendations based on specific items, or get_recommendations_from_history for personalized suggestions.
- For thematic \"movies like X\" questions, PREFER get_semantic_movie_recommendations over get_movie_recommendations, because it uses embeddings + Supabase for better similarity.
- Use get_user_feedback to learn what the user likes/dislikes and refine recommendations. Prioritize items similar to liked entries and down-rank items similar to disliked entries (do not hard-exclude unless the user asks).
- For cross-references, use find_songs_in_movie or find_movies_with_song.

Reasoning:
- Before deciding which tools to call, think step by step about the user's intent and which tools are most appropriate.
- Keep chain-of-thought private; do NOT include step-by-step reasoning. You must include a short "reasoning" field in the JSON (1-2 sentences) that explains at a high level why the results were chosen.

Opinions & explanations:
- If the user asks for your opinion, provide a short, friendly opinion and explain it using concrete shared traits (themes, tone, genre, or narrative elements).
- When recommending movies or songs, include a brief explanation in the "message" for why those items fit the request. If possible, mention 2-3 shared traits with the user's reference.

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
  ],
  "songs": [
    {
      "id": "spotify-track-id",
      "name": "Song Name",
      "artists": ["Artist 1", "Artist 2"],
      "album": "Album Name",
      "releaseYear": 2019,
      "previewUrl": "https://...",
      "source": "spotify"
    }
  ]
}

- Always include a helpful "message" string summarizing what you did.
- Include a concise "reasoning" field describing why you chose these movies/songs (one or two sentences, no step-by-step).
- Use "movies" for any movie recommendations or results (can be empty array).
- Use "songs" for any song/track recommendations or results (can be empty array).
- Keep titles and overviews concise so they fit nicely in UI cards.`;

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
    apiKey: config.openAiApiKey
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
        id: `tokens-${iteration}`,
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
          id: `tool-error-${Date.now()}`,
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
          id: `tool-error-${toolCall.id}`,
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
