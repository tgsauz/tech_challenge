import { NextResponse } from "next/server";
import { z } from "zod";
import { chatWithTools } from "@/lib/ai/chat";

const chatRequestSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().min(1)
});

// Shape of the assistant payload we want to send to the UI
const assistantPayloadSchema = z.object({
  message: z.string(),
  movies: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]),
        title: z.string(),
        overview: z.string().nullable().optional(),
        releaseYear: z.number().nullable().optional(),
        posterUrl: z.string().nullable().optional(),
        genres: z.array(z.string()).optional(),
        matchConfidence: z.string().optional()
      })
    )
    .optional()
    .default([]),
  songs: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]),
        name: z.string(),
        artists: z.array(z.string()).optional().default([]),
        album: z.string().nullable().optional(),
        releaseYear: z.number().nullable().optional(),
        previewUrl: z.string().nullable().optional(),
        source: z.string().optional()
      })
    )
    .optional()
    .default([])
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    console.debug("/api/chat request body:", json);
    const parseResult = chatRequestSchema.safeParse(json);

    if (!parseResult.success) {
      console.error("/api/chat validation failed:", parseResult.error.format());
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parseResult.error.format()
        },
        { status: 400 }
      );
    }

    const { message, userId, conversationId } = parseResult.data;

    // Call the AI orchestration function
    const { assistantMessage, newConversationId, debugEvents } =
      await chatWithTools(userId, conversationId ?? null, message);

    // Try to parse the assistant message as our structured JSON format.
    let payload;
    try {
      const parsedJson = JSON.parse(assistantMessage);
      payload = assistantPayloadSchema.parse(parsedJson);
    } catch {
      // Fallback: treat it as plain text
      payload = {
        message: assistantMessage,
        movies: [],
        songs: []
      };
    }

    return NextResponse.json({
      assistantMessage: payload,
      conversationId: newConversationId,
      debugEvents
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An error occurred while processing your request",
        assistantMessage: {
          message:
            "I apologize, but I encountered an error. Please check your API keys and try again.",
          type: "error"
        },
        debugEvents: [
          {
            id: `error-${Date.now()}`,
            type: "error",
            message:
              error instanceof Error ? error.message : String(error)
          }
        ]
      },
      { status: 500 }
    );
  }
}

