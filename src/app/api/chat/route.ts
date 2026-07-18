import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { AiProviderConfigError, aiProviderSchema, generateText } from "@/lib/ai";

const bodySchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(500),
  // Omit to use the default provider (OpenAI).
  provider: aiProviderSchema.optional(),
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
    const { text, provider } = await generateText({
      prompt: parsed.data.prompt,
      provider: parsed.data.provider,
      system:
        "You are a helpful fashion stylist. Give concise, friendly outfit advice.",
    });
    return NextResponse.json({ reply: text, provider });
  } catch (error) {
    // A misconfigured provider is an operator problem, not a client one — say
    // so plainly instead of falling through to a generic 500.
    if (error instanceof AiProviderConfigError) {
      console.error("AI provider not configured", error);
      return NextResponse.json(
        { error: error.message, provider: error.provider },
        { status: 503 },
      );
    }
    throw error;
  }
}
