export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { chatWithTools } from "@/lib/ai/chat";

type ErrorInfo = {
  name: string;
  message: string;
  stack?: string;
  cause?: string;
};

const chatRequestSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().min(1)
});

function serializeError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "string"
          ? error.cause
          : undefined;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : JSON.stringify(error)
  };
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  try {
    const json = await req.json().catch(() => null);
    console.debug("/api/chat request body", { requestId, body: json });
    const parseResult = chatRequestSchema.safeParse(json);

    if (!parseResult.success) {
      console.error("/api/chat validation failed", {
        requestId,
        issues: parseResult.error.issues,
        formatted: parseResult.error.format()
      });
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parseResult.error.format(),
          requestId
        },
        { status: 400 }
      );
    }

    const { message, userId, conversationId } = parseResult.data;

    // Call the AI orchestration function
    const { assistantMessage, newConversationId, debugEvents } =
      await chatWithTools(userId, conversationId ?? null, message);

    console.info("/api/chat request completed", {
      requestId,
      durationMs: Date.now() - startTime,
      conversationId: newConversationId,
      userId
    });

    return NextResponse.json({
      assistantMessage: {
        message: assistantMessage,
        type: "info"
      },
      conversationId: newConversationId,
      debugEvents,
      requestId
    });
  } catch (error) {
    const errorInfo = serializeError(error);
    console.error("/api/chat error", {
      requestId,
      durationMs: Date.now() - startTime,
      error: errorInfo
    });
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
            message: errorInfo.message
          }
        ],
        requestId
      },
      { status: 500 }
    );
  }
}
