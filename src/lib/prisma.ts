import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let client: PrismaClient | undefined;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.",
    );
  }

  // Neon's WebSocket pool adapter supports interactive transactions.
  // It relies on a global WebSocket, available on Node.js 22+ (and the Edge
  // runtime), which this project targets.
  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

/**
 * Lazily construct the Prisma client, reusing a single instance.
 *
 * Using a getter (instead of a top-level `new PrismaClient()`) means importing
 * this module never throws during build when DATABASE_URL is absent — the
 * connection string is only required when a request is actually served. Same
 * reasoning as `getOpenAI()` / `getAnthropic()`.
 *
 * In development the instance is cached on `globalThis` so hot reloads reuse it
 * instead of exhausting database connections.
 */
export function getPrisma(): PrismaClient {
  client ??= globalForPrisma.prisma ?? createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}
