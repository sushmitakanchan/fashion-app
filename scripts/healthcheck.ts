/**
 * `bun run healthcheck` — a non-mutating smoke check of the optional
 * integrations AURA can use.
 *
 * Services nobody configured are skipped, so a credential-free checkout passes.
 * Partially configured, unreachable, or rejecting services fail with a non-zero
 * exit status. See `src/lib/healthcheck/` for the logic; this file is only the
 * wiring and the output.
 */
import { createProbes } from "@/lib/healthcheck/probes";
import { exitCodeFor, formatReport, runHealthcheck } from "@/lib/healthcheck/run";

const outcomes = await runHealthcheck(process.env, createProbes(process.env));

for (const line of formatReport(outcomes)) console.log(line);

process.exit(exitCodeFor(outcomes));
