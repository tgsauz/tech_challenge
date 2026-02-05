import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleFeedback, getUserFeedback } from "@/lib/persistence";

const feedbackSchema = z.object({
  userId: z.string().min(1),
  itemType: z.string().min(1),
  itemId: z.union([z.string(), z.number()]),
  rating: z.union([z.literal(1), z.literal(-1)])
});

const feedbackQuerySchema = z.object({
  userId: z.string().min(1)
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") ?? "";
    const parsed = feedbackQuerySchema.safeParse({ userId });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request query", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const feedback = await getUserFeedback(parsed.data.userId);
    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to load feedback" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = feedbackSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { userId, itemType, itemId, rating } = parsed.data;

    const result = await toggleFeedback(userId, itemType, String(itemId), rating);

    return NextResponse.json({ success: true, rating: result.rating });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}
