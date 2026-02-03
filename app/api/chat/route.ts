export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { chatWithTools } from "@/lib/ai/chat";

const chatRequestSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().min(1)
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

    return NextResponse.json({
      assistantMessage: {
        message: assistantMessage,
        type: "info"
      },
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

