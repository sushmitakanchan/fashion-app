/**
 * PROTOTYPE — THROWAWAY. Not part of the app, not imported by anything.
 *
 * Answers wayfinder ticket #54: "Does the AURA portrait survive a second
 * generation pass?" The map (#51) locks portrait-as-input, so a try-on is a
 * *second* model pass over an already-generated likeness — and the AURA studio
 * prompt dresses the subject in "simple, fitted neutral clothing", so try-on
 * must paint over existing clothes rather than dress a neutral body.
 *
 * One outfit in, one image out — a fitting room, not a test matrix. The subject
 * is implicit: a try-on is always against your own AURA profile, so the portrait
 * is never something the user picks.
 *
 * An outfit may be several garments — a top, a pair of trousers, shoes. Every
 * `garment-*` file in the fixtures dir is one piece of the SAME outfit, worn
 * together in a single generated image. Supplying two pieces of the same type
 * (two tops) is a user error the bench warns about but does not enforce.
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
 * The warning the surface has to carry. Two pieces of the same type give the
 * model two candidates for one slot, and it will silently pick one or blend
 * them — a failure that looks like a bad generation rather than bad input.
 * Stated, not enforced: this is a warning, not validation.
 */
const SAME_TYPE_WARNING =
  "Add at most one garment per type — one top, one pair of trousers, one pair of shoes. " +
  "Two of the same type (two tops) will confuse the model: it may wear one, the other, or a blend of both.";

/**
 * The try-on prompt. Written against what #52 established: images.edit takes
 * its inputs as undifferentiated references, so which image is the subject and
 * which are garments is prompt-asserted, and masking is prompt-based rather
 * than precise. Hence the explicitness about removing the existing clothing,
 * and about every garment being worn at once rather than as alternatives.
 */
function tryOnPrompt(garmentCount: number): string {
  const list =
    garmentCount === 1
      ? "Image 2 is a garment on its own."
      : `Images 2 to ${garmentCount + 1} are ${garmentCount} separate garments, each on its own. ` +
        "They are one outfit, not alternatives.";

  const wear =
    garmentCount === 1
      ? "the garment from image 2"
      : `every garment from images 2 to ${garmentCount + 1}, all worn together at the same time`;

  return `
Image 1 is a full-body studio portrait of a person wearing simple, fitted
neutral clothing. ${list}

Dress the person from image 1 in ${wear}. Completely remove and replace the
clothing they are currently wearing. None of the original clothing may remain
visible — no collar, hem, sleeve, or edge of it anywhere in the result.
${
  garmentCount > 1
    ? `
Every supplied garment must appear in the result, worn on the correct part of
the body. Do not omit any of them and do not substitute one for another.
`
    : ""
}
Reproduce each garment exactly: its cut, drape, length, colour, and any
pattern, print, or texture on it. Do not substitute a similar garment.

Preserve without alteration the person's face, hairstyle, skin tone, and body
proportions, and the pose, crop, lighting, and background of image 1.
`;
}

type Garment = { slug: string; label: string; path: string };

/** Finds a fixture by stem, whatever extension it was dropped in as. */
async function findFixture(stem: string): Promise<string | null> {
  const hit = (await listFixtures()).find((e) => basename(e, extname(e)) === stem);
  return hit ? join(FIXTURES, hit) : null;
}

async function listFixtures(): Promise<string[]> {
  try {
    return await readdir(FIXTURES);
  } catch {
    return [];
  }
}

/** "garment-fitted-top" -> "Fitted top". The filename is the only label there is. */
function labelFor(slug: string): string {
  const words = slug.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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

/**
 * The portrait, plus every `garment-*` file as one piece of a single outfit.
 * Discovery is by glob rather than a fixed list so that adding a fourth piece
 * is dropping in a file — which is the input model this is meant to exercise.
 */
async function ensureFixtures(): Promise<{ portrait: string; garments: Garment[] }> {
  await mkdir(FIXTURES, { recursive: true });

  let portrait = await findFixture("portrait");
  if (!portrait) {
    portrait = join(FIXTURES, "portrait.svg");
    await writeFile(portrait, placeholderSvg("AURA portrait", 512, 768));
  }

  let files = (await listFixtures()).filter((f) => f.startsWith("garment-")).sort();
  if (files.length === 0) {
    for (const slug of ["top", "pants", "shoes"]) {
      const name = `garment-${slug}.svg`;
      await writeFile(join(FIXTURES, name), placeholderSvg(labelFor(slug), 512, 512));
      files.push(name);
    }
    files = files.sort();
  }

  const garments = files.map((f) => {
    const slug = basename(f, extname(f)).replace(/^garment-/, "");
    return { slug, label: labelFor(slug), path: join(FIXTURES, f) };
  });

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

/** One try-on: the profile's portrait plus the whole outfit in, one image out. */
async function tryOn(portrait: string, garments: Garment[]) {
  const image = await Promise.all([
    toFile(portrait),
    ...garments.map((g) => toFile(g.path)),
  ]);

  const started = performance.now();
  const result = await getOpenAI().images.edit(
    {
      image,
      model: resolveAuraPortraitModel(process.env),
      prompt: tryOnPrompt(garments.length),
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

function contactSheet(
  live: boolean,
  why: string,
  garments: Garment[],
  result: { file: string | null; ms: number; error: string | null },
) {
  const rel = (p: string) => `../${basename(FIXTURES)}/${basename(p)}`;

  const pieces = garments
    .map(
      (g) =>
        `<figure class="garment"><img src="${rel(g.path)}" alt="${g.slug}"><figcaption>${g.label}</figcaption></figure>`,
    )
    .join("");

  const out = result.file
    ? `<img src="${basename(result.file)}" alt="try-on result">`
    : `<div class="err">${result.error ?? "not generated"}</div>`;

  return `<!doctype html><meta charset="utf-8"><title>Try-on bench — ticket #54</title>
<style>
 body{font:15px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px;background:#fbfbfa;color:#1a1a1a}
 h1{margin:0 0 4px;font-size:22px} .sub{color:#666;margin:0 0 24px;max-width:80ch}
 .banner{padding:12px 16px;border-radius:8px;margin:0 0 20px;font-size:14px;max-width:80ch}
 .placeholder{background:#fff4d6;border:1px solid #e5c76b}
 .live{background:#e6f4ea;border:1px solid #86c79b}
 .warn{background:#fdecea;border:1px solid #e6a8a2}
 .outfit{display:flex;align-items:center;gap:18px;margin:0 0 12px;overflow-x:auto;padding-bottom:8px}
 .pieces{display:flex;gap:10px;flex:0 0 auto}
 figure{margin:0} figcaption{font-size:12px;color:#666;margin-top:6px}
 .garment img{width:118px;border-radius:6px;border:1px solid #ddd;display:block;background:#fff}
 .arrow,.result{flex:0 0 auto}
 .result img{width:280px;border-radius:6px;border:1px solid #ddd;display:block;background:#fff}
 .arrow{font-size:30px;color:#bbb}
 .err{width:280px;aspect-ratio:2/3;display:grid;place-items:center;border:1px dashed #ccc;border-radius:6px;color:#999;font-size:12px;text-align:center;padding:10px;background:#fff}
 h3{margin:24px 0 10px;font-size:15px}
 ol{max-width:72ch;color:#333} li{margin:6px 0}
 code{background:#eee;padding:1px 5px;border-radius:4px;font-size:13px}
</style>
<h1>Try-on bench — ticket #54</h1>
<p class="sub">Does the AURA portrait survive a second generation pass?${result.ms ? ` · ${result.ms} ms` : ""}</p>
${
  live
    ? `<p class="banner live"><strong>Live run.</strong> Real model output. Judge it.</p>`
    : `<p class="banner placeholder"><strong>Nothing generated: ${why}.</strong> Everything except the model call ran. Set <code>OPENAI_API_KEY</code> in <code>.env</code> and re-run <code>bun run prototype:tryon</code> — the outfit below is already in place. One try-on, ~$0.04.</p>`
}
<p class="banner warn"><strong>One garment per type.</strong> ${SAME_TYPE_WARNING} Not enforced — this is a warning, not validation.</p>
<p class="sub">One try-on: your AURA portrait plus one outfit, one image out. The portrait is not shown as an input because it is never chosen — a try-on is always against your own profile. The ${garments.length} garments below are pieces of the <em>same</em> outfit, worn together.</p>
<div class="outfit">
  <div class="pieces">${pieces}</div>
  <div class="arrow">→</div>
  <figure class="result">${out}<figcaption>Try-on out</figcaption></figure>
</div>
<h3>Judge the result against these — they are the ticket's criteria</h3>
<ol>
 <li><strong>Likeness drift</strong> — still recognisably the same person after two passes? Face, hair, skin tone, body proportions.</li>
 <li><strong>Bleed-through</strong> — does the original clothing show through, ghost at the edges, or fight the new outfit? The subject's striped polo makes this obvious.</li>
 <li><strong>Garment fidelity</strong> — is each piece recognisably <em>that</em> garment, or just something of the same category and colour? The patterned top is the hard case.</li>
 <li><strong>Completeness</strong> — did every supplied piece actually get worn, on the right part of the body? This is the multi-garment risk.</li>
 <li><strong>Framing stability</strong> — do pose, lighting, and crop hold? This is the entire justification for holding the portrait fixed.</li>
</ol>
<p class="sub">Latency feeds <a href="https://github.com/sushmitakanchan/fashion-app/issues/55">#55</a>. If the one-hop edit does not hold up, that invalidates portrait-as-input on <a href="https://github.com/sushmitakanchan/fashion-app/issues/51">#51</a> — say so plainly rather than papering over it.</p>`;
}

// ---- run ----

const { portrait, garments } = await ensureFixtures();
await mkdir(OUT, { recursive: true });

const fixturesAreReal =
  RASTER.has(extname(portrait)) && garments.every((g) => RASTER.has(extname(g.path)));
const live = Boolean(process.env.OPENAI_API_KEY) && fixturesAreReal;
const why = !process.env.OPENAI_API_KEY
  ? "OPENAI_API_KEY is not set"
  : !fixturesAreReal
    ? "fixtures are not raster images images.edit can accept"
    : "";

console.log(`Outfit: ${garments.map((g) => g.label).join(", ")}`);
console.log(`WARNING: ${SAME_TYPE_WARNING}\n`);
if (!live) console.log(`PLACEHOLDER MODE — ${why}. Wiring runs; the model call is skipped.\n`);

let result: { file: string | null; ms: number; error: string | null } = {
  file: null,
  ms: 0,
  error: "not generated",
};

if (live) {
  try {
    const { b64, ms } = await tryOn(portrait, garments);
    const file = join(OUT, "tryon.jpg");
    await writeFile(file, Buffer.from(b64, "base64"));
    result = { file, ms, error: null };
    console.log(`  ok    ${ms} ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { file: null, ms: 0, error: message };
    console.log(`  FAIL  ${message}`);
  }
}

const sheet = join(OUT, "index.html");
await writeFile(sheet, contactSheet(live, why, garments, result));

console.log(`\nContact sheet: ${sheet}`);
if (result.ms) console.log(`Latency: ${result.ms} ms  → #55\nSpend: ~$0.04`);
