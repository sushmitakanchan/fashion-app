import {
  aiProviderSchema,
  DEFAULT_AI_PROVIDER,
  PROVIDER_API_KEY_ENV,
  resolveProvider,
  type AiProvider,
} from "@/lib/ai/provider";

/**
 * The optional integrations the healthcheck knows about. Kept free of SDK and
 * network imports so this module stays a pure, testable core — `./run.ts` wires
 * it to the actual services.
 */
export const SERVICE_LABELS = {
  clerk: "Clerk",
  database: "Prisma/Neon",
  cloudinary: "Cloudinary",
  ai: "AI provider",
} as const;

export type ServiceId = keyof typeof SERVICE_LABELS;

export const SERVICE_IDS = Object.keys(SERVICE_LABELS) as ServiceId[];

/**
 * How a service's credentials look right now.
 *
 * `absent` is a legitimate state — an integration nobody configured is skipped,
 * not failed, so a credential-free checkout still passes. `incomplete` is not:
 * half-configured credentials mean someone meant to enable the service, and
 * silently skipping would hide the mistake until a request fails in production.
 */
export type ServiceConfig =
  | { service: ServiceId; status: "absent" }
  | { service: ServiceId; status: "incomplete"; missing: string[] }
  | { service: ServiceId; status: "configured"; detail?: string };

/**
 * One credential a service needs. `envVars` lists interchangeable variable
 * names — any one of them satisfies the requirement (Cloudinary's cloud name
 * can come from either the public or the server-only variable).
 */
type Credential = { envVars: [string, ...string[]] };

const CREDENTIALS: Record<Exclude<ServiceId, "ai">, Credential[]> = {
  clerk: [
    { envVars: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] },
    { envVars: ["CLERK_SECRET_KEY"] },
  ],
  database: [{ envVars: ["DATABASE_URL"] }],
  cloudinary: [
    { envVars: ["CLOUDINARY_CLOUD_NAME", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] },
    { envVars: ["CLOUDINARY_API_KEY"] },
    { envVars: ["CLOUDINARY_API_SECRET"] },
  ],
};

export type EnvRecord = Record<string, string | undefined>;

/** Blank and whitespace-only values are how Clerk keyless mode is expressed. */
function isSet(env: EnvRecord, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function classifyCredentials(
  service: Exclude<ServiceId, "ai">,
  env: EnvRecord,
): ServiceConfig {
  const credentials = CREDENTIALS[service];
  const satisfied = credentials.filter((credential) =>
    credential.envVars.some((name) => isSet(env, name)),
  );

  if (satisfied.length === 0) return { service, status: "absent" };
  if (satisfied.length === credentials.length) {
    return { service, status: "configured" };
  }

  return {
    service,
    status: "incomplete",
    missing: credentials
      .filter((credential) => !satisfied.includes(credential))
      // The first name is the canonical one to tell the operator to set.
      .map((credential) => credential.envVars[0]),
  };
}

/**
 * Which provider would serve a request in this environment, or why none would.
 *
 * Goes through the same `resolveProvider` the app uses at request time, so the
 * healthcheck can't disagree with `generateText()` about which provider a
 * deployment selected — or accept a configuration it would reject.
 */
export type AiSelection =
  | { status: "absent" }
  | { status: "incomplete"; missing: [string] }
  | { status: "configured"; provider: AiProvider };

export function selectAiProvider(env: EnvRecord): AiSelection {
  const selection = env.AI_PROVIDER?.trim();
  const credentials = {
    openai: isSet(env, PROVIDER_API_KEY_ENV.openai),
    anthropic: isSet(env, PROVIDER_API_KEY_ENV.anthropic),
  };

  // No selection and no keys: AI is simply not set up here.
  if (!selection && !credentials.openai && !credentials.anthropic) {
    return { status: "absent" };
  }

  let configured: AiProvider | undefined;
  if (selection) {
    const parsed = aiProviderSchema.safeParse(selection);
    if (!parsed.success) return { status: "incomplete", missing: ["AI_PROVIDER"] };
    configured = parsed.data;
  }

  try {
    return { status: "configured", provider: resolveProvider(configured, credentials) };
  } catch {
    return {
      status: "incomplete",
      missing: [PROVIDER_API_KEY_ENV[configured ?? DEFAULT_AI_PROVIDER]],
    };
  }
}

function classifyAi(env: EnvRecord): ServiceConfig {
  const service = "ai" as const;
  const selection = selectAiProvider(env);

  return selection.status === "configured"
    ? { service, status: "configured", detail: selection.provider }
    : { service, ...selection };
}

/** Classify every service's credentials, in a stable reporting order. */
export function classifyServices(env: EnvRecord): ServiceConfig[] {
  return SERVICE_IDS.map((service) =>
    service === "ai" ? classifyAi(env) : classifyCredentials(service, env),
  );
}
