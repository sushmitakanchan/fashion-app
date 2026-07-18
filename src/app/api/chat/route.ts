import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { APICallError } from "ai";
import { z } from "zod";

import { AiProviderConfigError, generateText } from "@/lib/ai";

const bodySchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(500),
});

export async function POST(req: Request) {
  // Clerk auth works here because the proxy matcher includes /api routes.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { text } = await generateText({
      instructions:
        "You are a helpful fashion stylist. Give concise, friendly outfit advice.",
      prompt: parsed.data.prompt,
    });
    return NextResponse.json({ reply: text });
  } catch (error) {
    // Both branches are operator problems, not client ones. The log names the
    // provider and the missing/rejected credential; the response deliberately
    // doesn't, so an unset env var isn't probeable from outside.
    if (error instanceof AiProviderConfigError) {
      console.error("AI provider is not configured", error);
      return NextResponse.json(
        { error: "The stylist isn't configured in this environment." },
        { status: 503 },
      );
    }
    if (APICallError.isInstance(error)) {
      console.error("AI provider rejected the request", error);
      return NextResponse.json(
        { error: "The stylist is unavailable right now. Please try again." },
        { status: 502 },
      );
    }
    throw error;
  }
}
