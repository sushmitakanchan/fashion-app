import { AI_PROVIDERS, type AiProvider } from "@/lib/ai/provider";

export type HealthcheckStatus = "passed" | "skipped" | "failed";

export type HealthcheckResult = {
  name: string;
  status: HealthcheckStatus;
  detail: string;
};

export type HealthcheckEnvironment = {
  databaseUrl?: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  aiProvider?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
};

export type HealthcheckProbes = {
  clerk: () => Promise<void>;
  database: () => Promise<void>;
  cloudinary: () => Promise<void>;
  ai: (provider: AiProvider, model: string) => Promise<void>;
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
};

function hasAnyValue(...values: Array<string | undefined>): boolean {
  return values.some(Boolean);
}

function hasEveryValue(...values: Array<string | undefined>): boolean {
  return values.every(Boolean);
}

function failure(name: string, error: unknown): HealthcheckResult {
  const detail = error instanceof Error ? error.message : String(error);
  return { name, status: "failed", detail };
}

async function checkConfiguredService(
  name: string,
  configured: boolean,
  missingDetail: string,
  probe: () => Promise<void>,
): Promise<HealthcheckResult> {
  if (!configured) {
    return { name, status: "skipped", detail: "not configured" };
  }

  if (missingDetail) {
    return { name, status: "failed", detail: missingDetail };
  }

  try {
    await probe();
    return { name, status: "passed", detail: "connected" };
  } catch (error) {
    return failure(name, error);
  }
}

function resolveAiProvider(
  environment: HealthcheckEnvironment,
): { provider?: AiProvider; failureDetail?: string } {
  const { aiProvider } = environment;
  if (aiProvider && !AI_PROVIDERS.includes(aiProvider as AiProvider)) {
    return {
      failureDetail: `AI_PROVIDER must be one of: ${AI_PROVIDERS.join(", ")}.`,
    };
  }

  const hasAiConfiguration = hasAnyValue(
    aiProvider,
    environment.openaiApiKey,
    environment.openaiModel,
    environment.anthropicApiKey,
    environment.anthropicModel,
  );
  if (!hasAiConfiguration) {
    return {};
  }

  return { provider: (aiProvider as AiProvider | undefined) ?? "openai" };
}

async function checkAi(
  environment: HealthcheckEnvironment,
  probes: HealthcheckProbes,
): Promise<HealthcheckResult> {
  const selection = resolveAiProvider(environment);
  if (selection.failureDetail) {
    return { name: "AI", status: "failed", detail: selection.failureDetail };
  }

  if (!selection.provider) {
    return { name: "AI", status: "skipped", detail: "not configured" };
  }

  const provider = selection.provider;
  const apiKey =
    provider === "openai"
      ? environment.openaiApiKey
      : environment.anthropicApiKey;
  const keyName = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const model =
    provider === "openai"
      ? environment.openaiModel ?? DEFAULT_MODELS.openai
      : environment.anthropicModel ?? DEFAULT_MODELS.anthropic;

  if (!apiKey) {
    return {
      name: "AI",
      status: "failed",
      detail: `${provider} is selected but ${keyName} is not set.`,
    };
  }

  try {
    await probes.ai(provider, model);
    return { name: "AI", status: "passed", detail: `${provider} (${model}) connected` };
  } catch (error) {
    return failure("AI", error);
  }
}

/**
 * Verifies configuration and connectivity without mutating application or
 * provider state. The probe implementations perform read-only requests only.
 */
export async function runHealthcheck(
  environment: HealthcheckEnvironment,
  probes: HealthcheckProbes,
): Promise<HealthcheckResult[]> {
  const clerkConfigured = hasAnyValue(
    environment.clerkPublishableKey,
    environment.clerkSecretKey,
  );
  const cloudinaryConfigured = hasAnyValue(
    environment.cloudinaryCloudName,
    environment.cloudinaryApiKey,
    environment.cloudinaryApiSecret,
  );

  return Promise.all([
    checkConfiguredService(
      "Clerk",
      clerkConfigured,
      hasEveryValue(environment.clerkPublishableKey, environment.clerkSecretKey)
        ? ""
        : "Set both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, or leave both unset for keyless development.",
      probes.clerk,
    ),
    checkConfiguredService(
      "Prisma/Neon",
      Boolean(environment.databaseUrl),
      "",
      probes.database,
    ),
    checkConfiguredService(
      "Cloudinary",
      cloudinaryConfigured,
      hasEveryValue(
        environment.cloudinaryCloudName,
        environment.cloudinaryApiKey,
        environment.cloudinaryApiSecret,
      )
        ? ""
        : "Set a Cloudinary cloud name plus CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
      probes.cloudinary,
    ),
    checkAi(environment, probes),
  ]);
}
