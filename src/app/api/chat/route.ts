import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";

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

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful fashion stylist. Give concise, friendly outfit advice.",
      },
      { role: "user", content: parsed.data.prompt },
    ],
  });

  return NextResponse.json({
    reply: completion.choices[0]?.message?.content ?? "",
  });
}
