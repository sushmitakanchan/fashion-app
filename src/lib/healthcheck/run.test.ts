import { describe, expect, it } from "bun:test";

import { exitCodeFor, runHealthcheck, type Probes } from "./run";
import type { ServiceId } from "./config";

const configured: Record<string, string | undefined> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  CLERK_SECRET_KEY: "sk_test_x",
  DATABASE_URL: "postgres://x",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  OPENAI_API_KEY: "sk-x",
};

/** Records which services were probed, so tests can assert on the calls made. */
function spyProbes(
  overrides: Partial<Record<ServiceId, () => Promise<string>>> = {},
) {
  const probed: ServiceId[] = [];
  const make = (service: ServiceId) => async () => {
    probed.push(service);
    return overrides[service] ? overrides[service]!() : "reachable";
  };

  const probes: Probes = {
    clerk: make("clerk"),
    database: make("database"),
    cloudinary: make("cloudinary"),
    ai: make("ai"),
    auraPortrait: make("auraPortrait"),
  };

  return { probes, probed };
}

function outcomeFor(
  outcomes: Awaited<ReturnType<typeof runHealthcheck>>,
  service: ServiceId,
) {
  return outcomes.find((outcome) => outcome.service === service)!;
}

describe("runHealthcheck", () => {
  it("skips absent services and succeeds", async () => {
    const { probes, probed } = spyProbes();

    const outcomes = await runHealthcheck({}, probes);

    expect(outcomes.every((outcome) => outcome.status === "skipped")).toBe(true);
    expect(probed).toEqual([]);
    expect(exitCodeFor(outcomes)).toBe(0);
  });

  it("passes when every configured probe succeeds", async () => {
    const { probes, probed } = spyProbes();

    const outcomes = await runHealthcheck(configured, probes);

    expect(outcomes.every((outcome) => outcome.status === "ok")).toBe(true);
    expect(probed.sort()).toEqual([
      "ai",
      "auraPortrait",
      "clerk",
      "cloudinary",
      "database",
    ]);
    expect(exitCodeFor(outcomes)).toBe(0);
  });

  it("fails partial configuration without probing that service", async () => {
    const { probes, probed } = spyProbes();

    const outcomes = await runHealthcheck(
      { ...configured, CLOUDINARY_API_SECRET: undefined },
      probes,
    );

    const cloudinary = outcomeFor(outcomes, "cloudinary");
    expect(cloudinary.status).toBe("failed");
    expect(cloudinary.message).toContain("CLOUDINARY_API_SECRET");
    expect(probed).not.toContain("cloudinary");
    expect(exitCodeFor(outcomes)).toBe(1);
  });

  it("fails the run when a probe rejects, and reports why", async () => {
    const { probes } = spyProbes({
      database: async () => {
        throw new Error("connection refused");
      },
    });

    const outcomes = await runHealthcheck(configured, probes);

    const database = outcomeFor(outcomes, "database");
    expect(database.status).toBe("failed");
    expect(database.message).toContain("connection refused");
    expect(exitCodeFor(outcomes)).toBe(1);
  });

  it("reads the message off a rejection that is not an Error", async () => {
    // Neon's WebSocket driver rejects with an ErrorEvent, which stringifies to
    // a useless "[object ErrorEvent]" — the operator needs the message.
    const { probes } = spyProbes({
      database: () =>
        Promise.reject({ message: "failed to connect", type: "error" }),
    });

    const outcomes = await runHealthcheck(configured, probes);

    expect(outcomeFor(outcomes, "database").message).toBe("failed to connect");
  });

  it("fails a probe that hangs instead of hanging the command", async () => {
    // An unreachable host must produce a non-zero exit, not stall forever.
    const { probes } = spyProbes({ database: () => new Promise<string>(() => {}) });

    const outcomes = await runHealthcheck(configured, probes, { timeoutMs: 20 });

    const database = outcomeFor(outcomes, "database");
    expect(database.status).toBe("failed");
    expect(database.message).toContain("timed out");
    expect(exitCodeFor(outcomes)).toBe(1);
  });

  it("keeps checking the other services after one fails", async () => {
    const { probes, probed } = spyProbes({
      clerk: async () => {
        throw new Error("401 Unauthorized");
      },
    });

    const outcomes = await runHealthcheck(configured, probes);

    // A single broken integration should not hide the state of the rest.
    expect(probed.sort()).toEqual([
      "ai",
      "auraPortrait",
      "clerk",
      "cloudinary",
      "database",
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "ok")).toHaveLength(
      4,
    );
  });

  it("surfaces the detail a probe reports", async () => {
    const { probes } = spyProbes({ ai: async () => "openai reachable" });

    const outcomes = await runHealthcheck(configured, probes);

    expect(outcomeFor(outcomes, "ai").message).toContain("openai reachable");
  });

  it("reports a failed portrait-image capability probe", async () => {
    const { probes } = spyProbes({
      auraPortrait: async () => {
        throw new Error("OpenAI organization verification is required for gpt-image-2");
      },
    });

    const outcomes = await runHealthcheck(configured, probes);

    const portrait = outcomeFor(outcomes, "auraPortrait");
    expect(portrait.status).toBe("failed");
    expect(portrait.message).toContain("organization verification");
  });

  it("fails incomplete portrait-image configuration without probing it", async () => {
    const { probes, probed } = spyProbes();
    const outcomes = await runHealthcheck(
      { ...configured, OPENAI_API_KEY: undefined, AURA_PORTRAIT_MODEL: "gpt-image-2" },
      probes,
    );

    const portrait = outcomeFor(outcomes, "auraPortrait");
    expect(portrait.status).toBe("failed");
    expect(portrait.message).toContain("OPENAI_API_KEY");
    expect(probed).not.toContain("auraPortrait");
  });

  it("summarizes when live AURA is unavailable", async () => {
    const { probes } = spyProbes();
    const outcomes = await runHealthcheck(
      { ...configured, DATABASE_URL: undefined, OPENAI_API_KEY: undefined },
      probes,
    );

    const { formatReport } = await import("./run");

    expect(formatReport(outcomes).join("\n")).toContain(
      "AURA live readiness: unavailable",
    );
    expect(formatReport(outcomes).join("\n")).toContain("persistence");
    expect(formatReport(outcomes).join("\n")).toContain("portrait generation");
  });
});
