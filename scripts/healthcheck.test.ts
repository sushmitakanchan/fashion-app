import { describe, expect, it } from "bun:test";

/**
 * The observable seam: `bun run healthcheck` itself — its exit status and the
 * report it prints.
 *
 * Both cases here resolve without touching the network. Absent services are
 * skipped and partial configuration fails at classification, so neither reaches
 * a probe; that keeps the suite hermetic while still exercising the real
 * command end to end.
 */
async function healthcheck(env: Record<string, string>) {
  const child = Bun.spawn(["bun", "run", "scripts/healthcheck.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    // A replaced environment, so a developer's own .env can't sway the result.
    env: { PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);

  return { stdout, exitCode };
}

describe("bun run healthcheck", () => {
  it("succeeds when every optional integration is absent", async () => {
    const { stdout, exitCode } = await healthcheck({});

    expect(exitCode).toBe(0);
    expect(stdout).toContain("not configured");
    expect(stdout).toContain("5 skipped");
  });

  it("exits non-zero with an actionable diagnostic on partial configuration", async () => {
    const { stdout, exitCode } = await healthcheck({
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      // CLOUDINARY_API_SECRET deliberately missing.
    });

    expect(exitCode).toBe(1);
    // Actionable means naming the variable the operator has to set.
    expect(stdout).toContain("CLOUDINARY_API_SECRET");
  });
});
