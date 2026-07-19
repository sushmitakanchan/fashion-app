/**
 * PROTOTYPE — THROWAWAY. Not part of the app, not imported by anything.
 *
 * Answers wayfinder ticket #54: "Does the AURA portrait survive a second
 * generation pass?" The map (#51) locks portrait-as-input, so a try-on is a
 * *second* model pass over an already-generated likeness — and the AURA studio
 * prompt dresses the subject in "simple, fitted neutral clothing", so try-on
 * must paint over existing clothes rather than dress a neutral body.
 *
 * This bench generates the evidence for that judgement. It does not make the
 * judgement: #54 is judged by eye, by a human, on the contact sheet this emits.
 *
 * Run:  bun run prototype:tryon
 *
 * With no OPENAI_API_KEY it runs in PLACEHOLDER mode — every step except the
 * model call executes, and stand-in outputs are written so the wiring, fixture
 * layout, latency table, and contact sheet are all verifiable today. Drop a key
 * in .env and real garment/portrait files into the fixture dir, and the same
 * command produces the real thing.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";

import { resolveAuraPortraitModel } from "@/lib/aura-portrait-config";
import { getOpenAI } from "@/lib/openai";

const FIXTURES = "prototype/tryon-fixtures";
const OUT = "prototype/tryon-out";

/** What images.edit will actually accept. SVG placeholders are deliberately not here. */
const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * The three garment cases #54 names. Loose/structured and patterned are the
 * ones expected to break: a coat changes the silhouette the portrait fixed,
 * and a print is the case where "same category and colour" masquerades as
 * garment fidelity.
 */
const GARMENT_CASES = [
  { slug: "fitted-top", label: "Fitted top" },
  { slug: "coat", label: "Loose / structured coat" },
  { slug: "patterned", label: "Patterned or printed" },
] as const;

/**
 * Prompt variants. #54 asks whether prompt shape, masking, or input ordering
 * materially improves the result, so the bench varies exactly those three
 * things and holds everything else constant.
 */
const VARIANTS = [
  {
    slug: "baseline",
    label: "Baseline",
    note: "Naive instruction. The control.",
    order: "portrait-first" as const,
    prompt: `
Image 1 is a full-body studio portrait of a person. Image 2 is a garment.
Show the same person from image 1 wearing the garment from image 2.
Keep the pose, framing, lighting, and background exactly as they are in image 1.
`,
  },
  {
    slug: "explicit-replace",
    label: "Explicit replace",
    note: "Names the existing neutral clothing and orders its removal — targets bleed-through.",
    order: "portrait-first" as const,
    prompt: `
Image 1 is a full-body studio portrait of a person wearing simple, fitted
neutral clothing. Image 2 is a garment on its own.

Completely remove and replace the clothing the person is wearing in image 1
with the garment from image 2. None of the original neutral clothing may remain
visible — no collar, hem, sleeve, or edge of it anywhere in the result.

Reproduce the garment from image 2 exactly: its cut, drape, length, colour, and
any pattern, print, or texture on it. Do not substitute a similar garment.

Preserve without alteration the person's face, hairstyle, skin tone, and body
proportions, and the pose, crop, lighting, and background of image 1.
`,
  },
  {
    slug: "garment-first",
    label: "Garment first",
    note: "Same instruction, inputs reversed — tests whether ordering carries role.",
    order: "garment-first" as const,
    prompt: `
Image 1 is a garment on its own. Image 2 is a full-body studio portrait of a
person wearing simple, fitted neutral clothing.

Completely remove and replace the clothing the person is wearing in image 2
with the garment from image 1. None of the original neutral clothing may remain
visible — no collar, hem, sleeve, or edge of it anywhere in the result.

Reproduce the garment from image 1 exactly: its cut, drape, length, colour, and
any pattern, print, or texture on it. Do not substitute a similar garment.

Preserve without alteration the person's face, hairstyle, skin tone, and body
proportions, and the pose, crop, lighting, and background of image 2.
`,
  },
] as const;

type Run = {
  garment: string;
  variant: string;
  file: string | null;
  ms: number;
  error: string | null;
};

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
 * Stand-in fixtures so the bench runs on a bare checkout. Deliberately SVG:
 * images.edit rejects SVG, so placeholders can never be silently spent against
 * a real API key — the run refuses instead. Replacing a .svg with a .jpg of the
 * same stem is the whole handover.
 */
function placeholderSvg(title: string, sub: string, fill: string, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${fill}"/>
  <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#0003" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="50%" y="47%" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26" font-weight="600" fill="#0009">${title}</text>
  <text x="50%" y="47%" dy="30" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" fill="#0007">${sub}</text>
  <text x="50%" y="47%" dy="58" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#0006">PLACEHOLDER — replace with a real image</text>
</svg>`;
}

async function ensureFixtures(): Promise<{ portrait: string; garments: Map<string, string> }> {
  await mkdir(FIXTURES, { recursive: true });

  let portrait = await findFixture("portrait");
  if (!portrait) {
    portrait = join(FIXTURES, "portrait.svg");
    await writeFile(
      portrait,
      placeholderSvg("AURA portrait", "the try-on subject", "#e8e2d9", 512, 768),
    );
  }

  const garments = new Map<string, string>();
  for (const g of GARMENT_CASES) {
    const stem = `garment-${g.slug}`;
    let path = await findFixture(stem);
    if (!path) {
      path = join(FIXTURES, `${stem}.svg`);
      await writeFile(path, placeholderSvg(g.label, stem, "#dfe6ec", 512, 512));
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

async function generate(
  portrait: string,
  garment: string,
  variant: (typeof VARIANTS)[number],
): Promise<{ b64: string; ms: number }> {
  const files = await Promise.all([toFile(portrait), toFile(garment)]);
  const image = variant.order === "garment-first" ? [files[1], files[0]] : files;

  const started = performance.now();
  const result = await getOpenAI().images.edit(
    {
      image,
      model: resolveAuraPortraitModel(process.env),
      prompt: variant.prompt,
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

function contactSheet(runs: Run[], live: boolean) {
  const cell = (r: Run) => {
    const body = r.file
      ? `<img src="${basename(r.file)}" alt="${r.garment} / ${r.variant}">`
      : `<div class="err">${r.error ?? "not generated"}</div>`;
    return `<figure>${body}<figcaption>${r.variant} · ${r.ms ? `${r.ms} ms` : "—"}</figcaption></figure>`;
  };

  const rows = GARMENT_CASES.map((g) => {
    const cells = VARIANTS.map((v) =>
      cell(runs.find((r) => r.garment === g.slug && r.variant === v.slug)!),
    ).join("");
    return `<section><h3>${g.label}</h3><div class="row">${cells}</div></section>`;
  }).join("");

  const times = runs.filter((r) => r.ms > 0).map((r) => r.ms);
  const stat = times.length
    ? `min ${Math.min(...times)} ms · median ${times.sort((a, b) => a - b)[times.length >> 1]} ms · max ${Math.max(...times)} ms`
    : "no timings — nothing was generated";

  return `<!doctype html><meta charset="utf-8"><title>Try-on bench — ticket #54</title>
<style>
 body{font:15px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px;background:#fbfbfa;color:#1a1a1a}
 h1{margin:0 0 4px;font-size:22px} .sub{color:#666;margin:0 0 24px}
 .banner{padding:12px 16px;border-radius:8px;margin:0 0 24px;font-size:14px}
 .placeholder{background:#fff4d6;border:1px solid #e5c76b}
 .live{background:#e6f4ea;border:1px solid #86c79b}
 section{margin:0 0 32px} h3{margin:0 0 10px;font-size:15px}
 .row{display:flex;gap:14px;flex-wrap:wrap}
 figure{margin:0;width:230px} figure img{width:100%;border-radius:6px;border:1px solid #ddd;display:block;background:#fff}
 figcaption{font-size:12px;color:#666;margin-top:6px}
 .err{aspect-ratio:2/3;display:grid;place-items:center;border:1px dashed #c66;border-radius:6px;color:#c33;font-size:12px;text-align:center;padding:10px;background:#fff}
 ol{max-width:70ch;color:#333} li{margin:6px 0}
 code{background:#eee;padding:1px 5px;border-radius:4px;font-size:13px}
</style>
<h1>Try-on bench — ticket #54</h1>
<p class="sub">Does the AURA portrait survive a second generation pass? · ${stat}</p>
${
  live
    ? `<p class="banner live"><strong>Live run.</strong> These are real model outputs. Judge them.</p>`
    : `<p class="banner placeholder"><strong>Placeholder run — nothing was generated.</strong> No <code>OPENAI_API_KEY</code>, or the fixtures are still SVG stand-ins. The pipeline below is wired and ran end to end; only the model call was skipped. To produce real output: set <code>OPENAI_API_KEY</code> in <code>.env</code>, replace the files in <code>${FIXTURES}/</code> with real JPG/PNG images of the same stem, and re-run <code>bun run prototype:tryon</code>.</p>`
}
${rows}
<h3>Judge each cell against these — they are the ticket's criteria</h3>
<ol>
 <li><strong>Likeness drift</strong> — still recognisably the same person after two passes? Face, hair, skin tone, body proportions.</li>
 <li><strong>Bleed-through</strong> — does the original neutral clothing show through, ghost at the edges, or fight the new garment?</li>
 <li><strong>Garment fidelity</strong> — is it recognisably <em>that</em> garment, or just something of the same category and colour? Pattern and print are the hard case.</li>
 <li><strong>Framing stability</strong> — do pose, lighting, and crop hold across try-ons? This is the entire justification for holding the portrait fixed.</li>
 <li><strong>Variant delta</strong> — does prompt shape or input ordering materially improve any of the above, reading across a row?</li>
</ol>
<p class="sub">Latency per cell feeds <a href="https://github.com/sushmitakanchan/fashion-app/issues/55">#55</a>. If the one-hop edit does not hold up, that invalidates portrait-as-input on <a href="https://github.com/sushmitakanchan/fashion-app/issues/51">#51</a> — say so plainly rather than papering over it.</p>`;
}

// ---- run ----

const { portrait, garments } = await ensureFixtures();
await mkdir(OUT, { recursive: true });

const fixturesAreReal =
  RASTER.has(extname(portrait)) &&
  [...garments.values()].every((g) => RASTER.has(extname(g)));
const live = Boolean(process.env.OPENAI_API_KEY) && fixturesAreReal;

if (!live) {
  const why = !process.env.OPENAI_API_KEY
    ? "OPENAI_API_KEY is not set"
    : "fixtures are still SVG placeholders";
  console.log(`PLACEHOLDER MODE — ${why}. Wiring runs; the model call is skipped.\n`);
}

const runs: Run[] = [];
for (const g of GARMENT_CASES) {
  for (const v of VARIANTS) {
    const tag = `${g.slug}__${v.slug}`;
    if (!live) {
      runs.push({ garment: g.slug, variant: v.slug, file: null, ms: 0, error: "skipped — placeholder mode" });
      console.log(`  skip  ${tag}`);
      continue;
    }
    try {
      const { b64, ms } = await generate(portrait, garments.get(g.slug)!, v);
      const file = join(OUT, `${tag}.jpg`);
      await writeFile(file, Buffer.from(b64, "base64"));
      runs.push({ garment: g.slug, variant: v.slug, file, ms, error: null });
      console.log(`  ok    ${tag}  ${ms} ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runs.push({ garment: g.slug, variant: v.slug, file: null, ms: 0, error: message });
      console.log(`  FAIL  ${tag}  ${message}`);
    }
  }
}

const sheet = join(OUT, "index.html");
await writeFile(sheet, contactSheet(runs, live));

const times = runs.filter((r) => r.ms > 0).map((r) => r.ms);
console.log(`\nContact sheet: ${sheet}`);
if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(
    `Latency (n=${times.length}): min ${sorted[0]} ms · median ${sorted[sorted.length >> 1]} ms · max ${sorted[sorted.length - 1]} ms  → #55`,
  );
  console.log(`Spend: ~$${(times.length * 0.041).toFixed(2)} at $0.041/image`);
}
