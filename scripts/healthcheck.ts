import { createClerkClient } from "@clerk/backend";

import { healthcheckEnv } from "../src/lib/healthcheck-env";
import {
  runHealthcheck,
  type HealthcheckEnvironment,
  type HealthcheckResult,
} from "../src/lib/healthcheck";

const environment: HealthcheckEnvironment = {
  databaseUrl: healthcheckEnv.DATABASE_URL,
  clerkPublishableKey: healthcheckEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: healthcheckEnv.CLERK_SECRET_KEY,
  cloudinaryCloudName:
    healthcheckEnv.CLOUDINARY_CLOUD_NAME ??
    healthcheckEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: healthcheckEnv.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: healthcheckEnv.CLOUDINARY_API_SECRET,
  aiProvider: healthcheckEnv.AI_PROVIDER,
  openaiApiKey: healthcheckEnv.OPENAI_API_KEY,
  openaiModel: healthcheckEnv.OPENAI_MODEL,
  anthropicApiKey: healthcheckEnv.ANTHROPIC_API_KEY,
  anthropicModel: healthcheckEnv.ANTHROPIC_MODEL,
};

function formatResult(result: HealthcheckResult): string {
  const marker = {
    passed: "PASS",
    skipped: "SKIP",
    failed: "FAIL",
  }[result.status];
  return `[${marker}] ${result.name}: ${result.detail}`;
}

const results = await runHealthcheck(environment, {
  async clerk() {
    await createClerkClient({ secretKey: environment.clerkSecretKey }).instance.get();
  },
  async database() {
    const { getPrisma } = await import("../src/lib/prisma");
    const prisma = getPrisma();
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
    } finally {
      await prisma.$disconnect();
    }
  },
  async cloudinary() {
    const { pingCloudinary } = await import("../src/lib/cloudinary");
    await pingCloudinary({
      cloudName: environment.cloudinaryCloudName,
      apiKey: environment.cloudinaryApiKey,
      apiSecret: environment.cloudinaryApiSecret,
    });
  },
  async ai(provider, model) {
    if (provider === "openai") {
      const { probeOpenAI } = await import("../src/lib/openai");
      await probeOpenAI(model);
      return;
    }

    const { probeAnthropic } = await import("../src/lib/anthropic");
    await probeAnthropic(model);
  },
});

for (const result of results) {
  console.log(formatResult(result));
}

if (results.some((result) => result.status === "failed")) {
  process.exitCode = 1;
}
