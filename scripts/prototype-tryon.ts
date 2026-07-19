/**
 * PROTOTYPE — THROWAWAY. Not part of the app, not imported by anything.
 *
 * Answers wayfinder ticket #54: "Does the AURA portrait survive a second
 * generation pass?" The map (#51) locks portrait-as-input, so a try-on is a
 * *second* model pass over an already-generated likeness — and the AURA studio
 * prompt dresses the subject in "simple, fitted neutral clothing", so try-on
 * must paint over existing clothes rather than dress a neutral body.
 *
 * One garment in, one image out — a fitting room, not a test matrix. The
 * subject is implicit: a try-on is always against your own AURA profile, so the
 * portrait is never something the user picks. The three garments here are three
 * separate try-ons, run in one go only so there is something to compare.
 *
 * This bench generates the evidence. It does not make the judgement: #54 is
 * judged by eye, by a human, on the contact sheet this emits.
 *
 * Run:  bun run prototype:tryon
 *
 * With no OPENAI_API_KEY it runs in PLACEHOLDER mode — every step except the
 * model call executes, so the wiring, fixtures, and sheet are verifiable today.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";

import { resolveAuraPortraitModel } from "@/lib/aura-portrait-config";
import { getOpenAI } from "@/lib/openai";

const FIXTURES = "prototype/tryon-fixtures";
const OUT = "prototype/tryon-out";

/** What images.edit accepts. SVG is deliberately absent — see ensureFixtures. */
const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Three garments, three independent try-ons. Loose/structured and patterned are
 * the ones expected to break: a coat changes the silhouette the portrait fixed,
 * and a print is the case where "same category and colour" can masquerade as
 * garment fidelity.
 */
const GARMENTS = [
  { slug: "fitted-top", label: "Fitted top" },
  { slug: "coat", label: "Loose / structured coat" },
  { slug: "patterned", label: "Patterned or printed" },
] as const;

/**
 * The try-on prompt. Written against what #52 established: images.edit takes
 * its inputs as undifferentiated references, so which image is the subject and
 * which is the garment is prompt-asserted, and masking is prompt-based rather
 * than precise. Hence the explicitness about removing the existing clothing.
 */
const TRYON_PROMPT = `
Image 1 is a full-body studio portrait of a person wearing simple, fitted
neutral clothing. Image 2 is a garment on its own.

Completely remove and replace the clothing the person is wearing in image 1
with the garment from image 2. None of the original clothing may remain
visible — no collar, hem, sleeve, or edge of it anywhere in the result.

Reproduce the garment from image 2 exactly: its cut, drape, length, colour, and
any pattern, print, or texture on it. Do not substitute a similar garment.

Preserve without alteration the person's face, hairstyle, skin tone, and body
proportions, and the pose, crop, lighting, and background of image 1.
`;

type Run = { garment: string; file: string | null; ms: number; error: string | null };

/** Finds a fixture by stem, whatever extension it was dropped in as. */
async function findFixture(stem: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(FIXTURES);
  } catch {
    return null;
  }
  const hit = entries.find((e) => basename(e, extname(e)) === stem);
  return hit ? join(FIXTURES, hit) : null;
}

/**
 * Stand-ins so the bench runs on a bare checkout. Deliberately SVG: images.edit
 * rejects SVG, so placeholders can never be silently spent against a real API
 * key — the run refuses instead. Dropping in a .jpg of the same stem is the
 * whole handover.
 */
function placeholderSvg(title: string, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#dfe6ec"/>
  <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#0003" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="50%" y="48%" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24" font-weight="600" fill="#0009">${title}</text>
  <text x="50%" y="48%" dy="28" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#0006">PLACEHOLDER — replace with a real image</text>
</svg>`;
}

async function ensureFixtures() {
  await mkdir(FIXTURES, { recursive: true });

  let portrait = await findFixture("portrait");
  if (!portrait) {
    portrait = join(FIXTURES, "portrait.svg");
    await writeFile(portrait, placeholderSvg("AURA portrait", 512, 768));
  }

  const garments = new Map<string, string>();
  for (const g of GARMENTS) {
    const stem = `garment-${g.slug}`;
    let path = await findFixture(stem);
    if (!path) {
      path = join(FIXTURES, `${stem}.svg`);
      await writeFile(path, placeholderSvg(g.label, 512, 512));
    }
    garments.set(g.slug, path);
  }

  return { portrait, garments };
}

async function toFile(path: string): Promise<File> {
  const type = path.endsWith(".png")
    ? "image/png"
    : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return new File([await readFile(path)], basename(path), { type });
}

/** One try-on: the profile's portrait plus one garment, in, one image out. */
async function tryOn(portrait: string, garment: string) {
  const image = await Promise.all([toFile(portrait), toFile(garment)]);

  const started = performance.now();
  const result = await getOpenAI().images.edit(
    {
      image,
      model: resolveAuraPortraitModel(process.env),
      prompt: TRYON_PROMPT,
      n: 1,
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      background: "opaque",
    },
    { timeout: 120_000, maxRetries: 0 },
  );
  const ms = Math.round(performance.now() - started);

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in response");
  return { b64, ms };
}

function contactSheet(runs: Run[], live: boolean, why: string, garments: Map<string, string>) {
  const rel = (p: string) => `../${basename(FIXTURES)}/${basename(p)}`;

  const pairs = GARMENTS.map((g) => {
    const r = runs.find((x) => x.garment === g.slug)!;
    const out = r.file
      ? `<img src="${basename(r.file)}" alt="${g.slug} result">`
      : `<div class="err">${r.error ?? "not generated"}</div>`;
    return `<section class="tryon">
      <h3>${g.label}</h3>
      <div class="pair">
        <figure class="garment"><img src="${rel(garments.get(g.slug)!)}" alt="${g.slug}"><figcaption>Garment in</figcaption></figure>
        <div class="arrow">→</div>
        <figure class="result">${out}<figcaption>Try-on out${r.ms ? ` · ${r.ms} ms` : ""}</figcaption></figure>
      </div>
    </section>`;
  }).join("");

  const times = runs.filter((r) => r.ms > 0).map((r) => r.ms);
  const sorted = [...times].sort((a, b) => a - b);
  const stat = times.length
    ? `${times.length} try-ons · min ${sorted[0]} ms · median ${sorted[sorted.length >> 1]} ms · max ${sorted[sorted.length - 1]} ms`
    : "nothing generated yet";

  return `<!doctype html><meta charset="utf-8"><title>Try-on bench — ticket #54</title>
<style>
 body{font:15px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px;background:#fbfbfa;color:#1a1a1a}
 h1{margin:0 0 4px;font-size:22px} .sub{color:#666;margin:0 0 24px}
 .banner{padding:12px 16px;border-radius:8px;margin:0 0 28px;font-size:14px;max-width:80ch}
 .placeholder{background:#fff4d6;border:1px solid #e5c76b}
 .live{background:#e6f4ea;border:1px solid #86c79b}
 .tryon{margin:0 0 28px;padding:0 0 24px;border-bottom:1px solid #eee}
 .tryon h3{margin:0 0 12px;font-size:15px}
 .pair{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
 figure{margin:0} figcaption{font-size:12px;color:#666;margin-top:6px}
 .garment img{width:190px;border-radius:6px;border:1px solid #ddd;display:block;background:#fff}
 .result img{width:250px;border-radius:6px;border:1px solid #ddd;display:block;background:#fff}
 .arrow{font-size:26px;color:#bbb}
 .err{width:250px;aspect-ratio:2/3;display:grid;place-items:center;border:1px dashed #ccc;border-radius:6px;color:#999;font-size:12px;text-align:center;padding:10px;background:#fff}
 ol{max-width:72ch;color:#333} li{margin:6px 0}
 code{background:#eee;padding:1px 5px;border-radius:4px;font-size:13px}
</style>
<h1>Try-on bench — ticket #54</h1>
<p class="sub">Does the AURA portrait survive a second generation pass? · ${stat}</p>
${
  live
    ? `<p class="banner live"><strong>Live run.</strong> Real model output. Judge it.</p>`
    : `<p class="banner placeholder"><strong>Nothing generated: ${why}.</strong> Everything except the model call ran. Set <code>OPENAI_API_KEY</code> in <code>.env</code> and re-run <code>bun run prototype:tryon</code> — the garments below are already in place. 3 try-ons, ~$0.12.</p>`
}
<p class="sub">Each row is one independent try-on: your AURA portrait plus one garment, one image out. The portrait is not shown as an input because it is never chosen — a try-on is always against your own profile.</p>
${pairs}
<h3>Judge each result against these — they are the ticket's criteria</h3>
<ol>
 <li><strong>Likeness drift</strong> — still recognisably the same person after two passes? Face, hair, skin tone, body proportions.</li>
 <li><strong>Bleed-through</strong> — does the original clothing show through, ghost at the edges, or fight the new garment? The subject's striped polo makes this obvious.</li>
 <li><strong>Garment fidelity</strong> — is it recognisably <em>that</em> garment, or just something of the same category and colour? Pattern and print are the hard case.</li>
 <li><strong>Framing stability</strong> — do pose, lighting, and crop hold across try-ons? This is the entire justification for holding the portrait fixed.</li>
</ol>
<p class="sub">Latency feeds <a href="https://github.com/sushmitakanchan/fashion-app/issues/55">#55</a>. If the one-hop edit does not hold up, that invalidates portrait-as-input on <a href="https://github.com/sushmitakanchan/fashion-app/issues/51">#51</a> — say so plainly rather than papering over it.</p>`;
}

// ---- run ----

const { portrait, garments } = await ensureFixtures();
await mkdir(OUT, { recursive: true });

const fixturesAreReal =
  RASTER.has(extname(portrait)) && [...garments.values()].every((g) => RASTER.has(extname(g)));
const live = Boolean(process.env.OPENAI_API_KEY) && fixturesAreReal;
const why = !process.env.OPENAI_API_KEY
  ? "OPENAI_API_KEY is not set"
  : !fixturesAreReal
    ? "fixtures are not raster images images.edit can accept"
    : "";

if (!live) console.log(`PLACEHOLDER MODE — ${why}. Wiring runs; the model call is skipped.\n`);

const runs: Run[] = [];
for (const g of GARMENTS) {
  if (!live) {
    runs.push({ garment: g.slug, file: null, ms: 0, error: "not generated" });
    console.log(`  skip  ${g.slug}`);
    continue;
  }
  try {
    const { b64, ms } = await tryOn(portrait, garments.get(g.slug)!);
    const file = join(OUT, `${g.slug}.jpg`);
    await writeFile(file, Buffer.from(b64, "base64"));
    runs.push({ garment: g.slug, file, ms, error: null });
    console.log(`  ok    ${g.slug}  ${ms} ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runs.push({ garment: g.slug, file: null, ms: 0, error: message });
    console.log(`  FAIL  ${g.slug}  ${message}`);
  }
}

const sheet = join(OUT, "index.html");
await writeFile(sheet, contactSheet(runs, live, why, garments));

console.log(`\nContact sheet: ${sheet}`);
const times = runs.filter((r) => r.ms > 0).map((r) => r.ms);
if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(
    `Latency (n=${times.length}): min ${sorted[0]} ms · median ${sorted[sorted.length >> 1]} ms · max ${sorted[sorted.length - 1]} ms  → #55`,
  );
  console.log(`Spend: ~$${(times.length * 0.041).toFixed(2)} at $0.041/image`);
}
