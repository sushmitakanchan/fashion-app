import {
  classifyServices,
  SERVICE_LABELS,
  type EnvRecord,
  type ServiceId,
} from "./config";

/**
 * A live, non-mutating probe of one service. Resolves with a short human
 * detail for the report; rejects to fail the check.
 *
 * Injected rather than imported so the run logic stays free of network and SDK
 * dependencies — the script in `scripts/healthcheck.ts` supplies the real ones.
 */
export type Probe = () => Promise<string>;

export type Probes = Record<ServiceId, Probe>;

export type CheckOutcome = {
  service: ServiceId;
  status: "skipped" | "ok" | "failed";
  message: string;
};

/**
 * Not every rejection is an `Error`: Neon's WebSocket driver rejects with an
 * `ErrorEvent`, which stringifies to a useless "[object ErrorEvent]". Read the
 * message off anything that carries one, so the report stays actionable.
 */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string" && message.trim()) return message;
  }

  return String(error);
}

/**
 * Classify every service's credentials, then live-probe the configured ones.
 *
 * The three outcomes map onto the three configuration states: an absent
 * integration is skipped (a credential-free checkout still passes), a partially
 * configured one fails without being probed (the probe would only produce a
 * confusing auth error), and a fully configured one is only as healthy as the
 * live probe says it is.
 */
export async function runHealthcheck(
  env: EnvRecord,
  probes: Probes,
): Promise<CheckOutcome[]> {
  // Probes run concurrently: they are independent, and one broken integration
  // should not delay or hide the state of the rest.
  return Promise.all(
    classifyServices(env).map(async (config): Promise<CheckOutcome> => {
      const { service } = config;

      if (config.status === "absent") {
        return { service, status: "skipped", message: "not configured" };
      }

      if (config.status === "incomplete") {
        return {
          service,
          status: "failed",
          message: `partially configured — set ${config.missing.join(", ")}`,
        };
      }

      try {
        const detail = await probes[service]();
        return { service, status: "ok", message: detail };
      } catch (error) {
        return { service, status: "failed", message: describe(error) };
      }
    }),
  );
}

/** Any failure fails the command; skipped services do not. */
export function exitCodeFor(outcomes: CheckOutcome[]): number {
  return outcomes.some((outcome) => outcome.status === "failed") ? 1 : 0;
}

const ICONS: Record<CheckOutcome["status"], string> = {
  skipped: "-",
  ok: "✓",
  failed: "✗",
};

/** Render the outcomes as the lines the command prints. */
export function formatReport(outcomes: CheckOutcome[]): string[] {
  const lines = outcomes.map(
    ({ service, status, message }) =>
      `${ICONS[status]} ${SERVICE_LABELS[service]}: ${message}`,
  );

  const failed = outcomes.filter((outcome) => outcome.status === "failed");
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped");

  lines.push(
    "",
    failed.length > 0
      ? `${failed.length} of ${outcomes.length} checks failed.`
      : `All configured checks passed (${skipped.length} skipped).`,
  );

  return lines;
}
