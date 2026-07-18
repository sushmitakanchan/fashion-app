import { PROVIDER_API_KEY_ENV, type AiProvider } from "@/lib/ai/provider";

import { selectAiProvider, type EnvRecord } from "./config";
import type { Probes } from "./run";

/**
 * Live probes for the configured services.
 *
 * Every probe is read-only by construction: it either reads a listing endpoint
 * or issues `SELECT 1`. None creates, updates, or deletes anything, so running
 * the healthcheck against a real deployment is safe.
 */

const TIMEOUT_MS = 10_000;

/** Bounded so an unreachable host fails the check instead of hanging it. */
async function probeFetch(
  url: string,
  init: RequestInit & { headers: HeadersInit },
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    method: "GET",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `${new URL(url).host} responded ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

/**
 * Reads the user count — the cheapest read-only call on the Clerk backend API.
 *
 * This exercises `CLERK_SECRET_KEY` only. The publishable key is still required
 * to call Clerk configured (the browser cannot sign anyone in without it), but
 * validating it means a Frontend API call derived from the key itself, which
 * this probe does not do — so the report says which key it checked.
 */
async function probeClerk(env: EnvRecord): Promise<string> {
  await probeFetch("https://api.clerk.com/v1/users/count", {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });

  return "backend API reachable (secret key verified)";
}

/** `SELECT 1` — proves the adapter, connection string, and Neon host all work. */
async function probeDatabase(): Promise<string> {
  const { getPrisma } = await import("@/lib/prisma");
  const prisma = getPrisma();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return "connected";
  } finally {
    await prisma.$disconnect();
  }
}

/** Cloudinary's own read-only credential check. */
async function probeCloudinary(): Promise<string> {
  const { cloudinary } = await import("@/lib/cloudinary");
  const { status } = await cloudinary.api.ping();

  return `account reachable (${status})`;
}

/**
 * Lists the provider's models. Deliberately not a generation call — a probe
 * should not spend tokens, and a listing already proves the key is accepted.
 */
const AI_PROBES: Record<AiProvider, (key: string) => Promise<void>> = {
  openai: async (key) => {
    await probeFetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
  },
  anthropic: async (key) => {
    await probeFetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
  },
};

async function probeAi(env: EnvRecord): Promise<string> {
  const selection = selectAiProvider(env);

  if (selection.status !== "configured") {
    // Unreachable via `runHealthcheck`, which only probes configured services.
    throw new Error("no AI provider is configured");
  }

  const { provider } = selection;
  await AI_PROBES[provider](env[PROVIDER_API_KEY_ENV[provider]]!);

  return `${provider} reachable`;
}

export function createProbes(env: EnvRecord): Probes {
  return {
    clerk: () => probeClerk(env),
    database: () => probeDatabase(),
    cloudinary: () => probeCloudinary(),
    ai: () => probeAi(env),
  };
}
