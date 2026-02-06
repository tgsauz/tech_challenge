import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const historyRequestSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().optional()
});

const historyDeleteSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().optional(),
  clearAll: z.boolean().optional()
});

// Reuse the same assistant payload shape used in /api/chat
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
    .default([])
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parseResult = historyRequestSchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { userId, conversationId } = parseResult.data;

    // Find the conversation: use provided ID or the most recent for this user.
    let conversation = null;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
    } else {
      conversation = await prisma.conversation.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" }
      });
    }

    if (!conversation) {
      return NextResponse.json({
        conversationId: null,
        messages: []
      });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" }
    });

    // Transform messages into the shape expected by the frontend
    const transformed = messages.map((m) => {
      if (m.role === "assistant") {
        // Try to parse structured payload from assistant messages
        try {
          const parsed = assistantPayloadSchema.parse(JSON.parse(m.content));
          return {
            id: m.id,
            role: "assistant" as const,
            content: parsed.message,
            movies: parsed.movies
          };
        } catch {
          return {
            id: m.id,
            role: "assistant" as const,
            content: m.content,
            movies: []
          };
        }
      }

      // User or other roles: plain text only
      return {
        id: m.id,
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
        movies: []
      };
    });

    return NextResponse.json({
      conversationId: conversation.id,
      messages: transformed
    });
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to load history" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parseResult = historyDeleteSchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { userId, conversationId, clearAll } = parseResult.data;

    if (clearAll) {
      const deleted = await prisma.$transaction([
        prisma.conversation.deleteMany({ where: { userId } }),
        prisma.feedback.deleteMany({ where: { userId } }),
        prisma.watchedMovie.deleteMany({ where: { userId } })
      ]);

      return NextResponse.json({
        cleared: true,
        deleted
      });
    }

    let conversation = null;

    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId }
      });
    } else {
      conversation = await prisma.conversation.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" }
      });
    }

    if (!conversation) {
      return NextResponse.json({ cleared: false });
    }

    await prisma.conversation.delete({
      where: { id: conversation.id }
    });

    return NextResponse.json({
      cleared: true,
      conversationId: conversation.id
    });
  } catch (error) {
    console.error("History DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to clear history" },
      { status: 500 }
    );
  }
}
