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

**Important guidelines:**
- Always use tools to get real data. Never make up movie titles, song names, or details.
- When a user mentions they watched/liked a movie, use save_watched_movie to remember it.
- When a user mentions they listened/liked a song, use save_listened_song to remember it.
- For recommendations, use get_movie_recommendations or get_track_recommendations based on specific items, or get_recommendations_from_history for personalized suggestions.
- For cross-references, use find_songs_in_movie or find_movies_with_song.
- Always provide structured, helpful responses with clear lists when showing recommendations.

**Response format:**
When returning recommendations or information, structure your response as:
- A friendly, conversational explanation
- Clear lists of movies or songs with key details (title, year, genre for movies; name, artist for songs)
- Links or references when helpful

Be concise but informative.`;

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

  return messages.map(
    (msg: { role: "user" | "assistant" | "system"; content: string | null }) => ({
    role: msg.role,
    content: msg.content ?? ""
  }));
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
