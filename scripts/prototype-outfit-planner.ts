/**
 * PROTOTYPE — throwaway. Answers wayfinder ticket #161: what prompt shape +
 * output schema turns (wardrobe + style + place + weather) into an outfit pick?
 *
 * Run: `bun run scripts/prototype-outfit-planner.ts`  (needs OPENAI_API_KEY)
 *
 * Deliberately NOT wired to `@/lib/ai` (that imports "server-only", which throws
 * outside Next). It replicates the boundary's exact shape — `openai(MODEL)` +
 * `generateText({ instructions, prompt })`, non-streaming, no JSON-mode — and
 * the review route's fence-strip + Zod safeParse. gpt-4o-mini is what prod runs.
 *
 * What it exercises (hard to reason about on paper):
 *   1. formality — does it match the occasion's dress code from item metadata?
 *   2. weather   — cold/rain vs hot → layers, fabrics, footwear?
 *   3. gaps      — a sparse wardrobe that CAN'T cover the event: flag, not fake?
 *
 * Scope guard (per the map): #161 fixes the CONTRACT. Planning-quality *policy*
 * (repeat-avoidance, gap thresholds) is #164; style-pref *storage* is #163. The
 * schema reserves a `gaps` slot; when to fire it is #164's call.
 */
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ── Candidate output contract ────────────────────────────────────────────────
// Strict, UI-ready, and (like the review schema) generous on string caps so a
// valid-but-slightly-long reply still parses instead of 502-ing.
const WARDROBE_CATEGORIES = [
  "tops",
  "bottoms",
  "dresses",
  "activewear",
  "outerwear",
  "bags",
  "shoes",
  "accessories",
] as const;

const plannedOutfitSchema = z
  .object({
    // The pick: WardrobeItem ids the planner chose. Validated against the fed
    // set by the caller (the model must not invent ids) — see checkPick().
    // min(0): a pure-gap outcome ("I can't dress this from your wardrobe") is a
    // LEGAL answer — [] alongside a gap, not a forced bad pick. (Finding #3.)
    itemIds: z.array(z.string().trim().min(1)).max(8),
    // AI-suggested occasion label — same free-text vocabulary as the event/item.
    occasion: z.string().trim().min(1).max(60),
    // Short "why this works" — weather + formality + colour, one or two lines.
    rationale: z.string().trim().min(1).max(320),
    // Gap flags: the wardrobe couldn't fill a slot the event needs. The CONTRACT
    // lives here; the POLICY of when to flag is #164.
    gaps: z
      .array(
        z.object({
          slot: z.string().trim().min(1).max(40), // "rain layer", "formal shoes"
          note: z.string().trim().min(1).max(160),
        }),
      )
      .max(6)
      .default([]),
  })
  // An empty pick is only coherent if the planner said WHY it's empty.
  .refine((o) => o.itemIds.length > 0 || o.gaps.length > 0, {
    message: "An empty pick must be accompanied by at least one gap.",
    path: ["itemIds"],
  });
type PlannedOutfit = z.infer<typeof plannedOutfitSchema>;

// ── Fence-strip + parse, copied verbatim in spirit from the review route ──────
function extractJson(text: string): string {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (unfenced.startsWith("{")) return unfenced;
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}
function parseOutfit(text: string):
  | { ok: true; value: PlannedOutfit }
  | { ok: false; error: string } {
  try {
    const parsed = plannedOutfitSchema.safeParse(JSON.parse(extractJson(text)));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, error: JSON.stringify(parsed.error.issues, null, 2) };
  } catch (e) {
    return { ok: false, error: `not JSON: ${(e as Error).message}` };
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────────
const INSTRUCTIONS = `
You are AURA, a precise personal stylist. You plan ONE outfit for ONE event by
choosing items from the owner's existing wardrobe. You never shop, invent, or
imagine items.

Hard rules:
- Choose ONLY from the wardrobe items given. Every id you return MUST be an "id"
  from that list, copied exactly. Never invent an id or a garment.
- Build a complete, wearable outfit: cover the body appropriately for the
  occasion (typically a top+bottom or a dress, plus footwear; add outerwear when
  the weather calls for it). Do not add more than one item per role without a
  styling reason.
- If the wardrobe genuinely cannot cover something the event needs — no
  occasion-appropriate option, no warm layer for cold/rain, no suitable
  footwear — DO NOT substitute something inappropriate. Return your best partial
  outfit and record the shortfall in "gaps". An honest gap beats a bad pick.

How to weigh the inputs, in priority order:
1. Occasion / formality FIRST — the outfit must be appropriate for the event.
   Read the event's occasion and title; match it against each item's category
   and its own "occasion" hint.
2. Weather SECOND — use the forecast to pick fabric weight, layers, and
   footwear. Cold or rain → add outerwear / closed shoes; hot → lighter pieces.
3. Style preferences THIRD — lean toward the owner's stated preferences.
4. Colour harmony LAST — prefer a coherent palette among the chosen items.

Return ONLY valid JSON, optionally in a \`\`\`json fence, matching exactly:
{
  "itemIds": ["<wardrobe id>", ...],   // the chosen items, ids copied exactly
  "occasion": "<short occasion label>",
  "rationale": "<one or two sentences: how the pick suits the occasion, the
                 weather, and the palette>",
  "gaps": [ { "slot": "<what's missing>", "note": "<why it matters>" } ]  // [] if none
}
`.trim();

type WardrobeItem = {
  id: string;
  category: (typeof WARDROBE_CATEGORIES)[number];
  name: string;
  color: string;
  brand?: string;
  occasion?: string;
};
type EventCtx = {
  title: string;
  occasion: string;
  when: string; // human date/time (all-day or a window)
  place: string;
  weather: string; // compact forecast summary for the event window
};

function buildPrompt(
  event: EventCtx,
  wardrobe: WardrobeItem[],
  stylePrefs: string,
): string {
  const items = wardrobe.map((i) => ({
    id: i.id,
    category: i.category,
    name: i.name,
    color: i.color,
    ...(i.brand ? { brand: i.brand } : {}),
    ...(i.occasion ? { occasion: i.occasion } : {}),
  }));
  return [
    `Event: ${event.title}`,
    `Occasion: ${event.occasion}`,
    `When: ${event.when}`,
    `Place: ${event.place}`,
    `Weather for the event window: ${event.weather}`,
    `Owner style preferences: ${stylePrefs}`,
    ``,
    `Wardrobe (choose only from these ids):`,
    JSON.stringify(items, null, 2),
  ].join("\n");
}

// Caller-side guard: ids must all be real. This is the "model must not invent
// ids" check the schema alone can't express — it belongs in the route handler.
function checkPick(outfit: PlannedOutfit, wardrobe: WardrobeItem[]) {
  const known = new Set(wardrobe.map((i) => i.id));
  const invented = outfit.itemIds.filter((id) => !known.has(id));
  const byId = new Map(wardrobe.map((i) => [i.id, i]));
  const picked = outfit.itemIds
    .map((id) => byId.get(id))
    .filter((i): i is WardrobeItem => Boolean(i));
  return { invented, picked };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
// A well-stocked wardrobe (covers formal + casual + weather), and a sparse one
// that can't dress an office event (the gap case).
const FULL_WARDROBE: WardrobeItem[] = [
  { id: "w_navy_blazer", category: "outerwear", name: "Navy wool blazer", color: "navy", occasion: "office" },
  { id: "w_charcoal_trousers", category: "bottoms", name: "Charcoal wool trousers", color: "charcoal", occasion: "office" },
  { id: "w_white_shirt", category: "tops", name: "White cotton dress shirt", color: "white", occasion: "office" },
  { id: "w_black_dress", category: "dresses", name: "Black midi dress", color: "black", occasion: "dinner" },
  { id: "w_white_tee", category: "tops", name: "White crew tee", color: "white", occasion: "casual" },
  { id: "w_blue_jeans", category: "bottoms", name: "Blue slim jeans", color: "blue", occasion: "casual" },
  { id: "w_linen_shorts", category: "bottoms", name: "Beige linen shorts", color: "beige", occasion: "casual" },
  { id: "w_floral_sundress", category: "dresses", name: "Floral sundress", color: "coral", occasion: "brunch" },
  { id: "w_trench", category: "outerwear", name: "Khaki trench coat", color: "khaki", occasion: "everyday" },
  { id: "w_white_sneakers", category: "shoes", name: "White leather sneakers", color: "white", occasion: "casual" },
  { id: "w_black_heels", category: "shoes", name: "Black pointed heels", color: "black", occasion: "dinner" },
  { id: "w_brown_derby", category: "shoes", name: "Brown leather derby shoes", color: "brown", occasion: "office" },
  { id: "w_tan_sandals", category: "shoes", name: "Tan flat sandals", color: "tan", occasion: "casual" },
  { id: "w_gold_hoops", category: "accessories", name: "Gold hoop earrings", color: "gold" },
  { id: "w_leather_tote", category: "bags", name: "Cognac leather tote", color: "cognac", occasion: "office" },
  { id: "w_straw_bag", category: "bags", name: "Straw crossbody bag", color: "natural", occasion: "casual" },
];

const SPARSE_WARDROBE: WardrobeItem[] = [
  { id: "s_run_tee", category: "activewear", name: "Grey running tee", color: "grey", occasion: "gym" },
  { id: "s_leggings", category: "activewear", name: "Black leggings", color: "black", occasion: "gym" },
  { id: "s_trainers", category: "shoes", name: "Neon running trainers", color: "neon", occasion: "gym" },
  { id: "s_sundress", category: "dresses", name: "Yellow beach sundress", color: "yellow", occasion: "beach" },
];

const STYLE_PREFS =
  "Prefers minimal, tailored looks in a neutral palette; comfortable in heels; avoids very bright colours.";

type Scenario = {
  name: string;
  event: EventCtx;
  wardrobe: WardrobeItem[];
  expect: string;
};

const SCENARIOS: Scenario[] = [
  {
    name: "1) Formal dinner · cold + rain · full wardrobe",
    event: {
      title: "Anniversary dinner at Le Bernardin",
      occasion: "formal dinner",
      when: "Fri 14 Nov, 8:00–10:30 pm",
      place: "Manhattan, New York",
      weather: "9°C, heavy rain, 18 km/h wind (evening)",
    },
    wardrobe: FULL_WARDROBE,
    expect: "black dress + heels, plus a coat/layer for the cold rain; NOT sneakers/shorts",
  },
  {
    name: "2) Casual brunch · hot + sunny · full wardrobe",
    event: {
      title: "Sunday brunch with friends",
      occasion: "casual brunch",
      when: "Sun 6 Jul, 11:00 am–1:00 pm",
      place: "Austin, Texas",
      weather: "33°C, sunny, no rain",
    },
    wardrobe: FULL_WARDROBE,
    expect: "sundress or tee+shorts, sandals/sneakers; NO blazer/coat",
  },
  {
    name: "3) Office presentation · mild · SPARSE wardrobe (gap case)",
    event: {
      title: "Q3 board presentation",
      occasion: "business formal",
      when: "Tue 9 Sep, 9:00–11:00 am",
      place: "Chicago, Illinois",
      weather: "17°C, overcast, light breeze",
    },
    wardrobe: SPARSE_WARDROBE,
    expect: "should FLAG a gap — only gymwear + a beach dress, nothing business-appropriate",
  },
];

// ── Run ────────────────────────────────────────────────────────────────────────
async function generateOutfit(prompt: string, corrective?: string) {
  const { text } = await generateText({
    model: openai(MODEL),
    system: corrective ? `${INSTRUCTIONS}\n\n${corrective}` : INSTRUCTIONS,
    prompt,
  });
  return text;
}

async function runScenario(s: Scenario) {
  const prompt = buildPrompt(s.event, s.wardrobe, STYLE_PREFS);
  let retried = false;
  let text = await generateOutfit(prompt);
  let parsed = parseOutfit(text);

  // One-shot recovery for invented ids (Finding #2). If the first reply picked
  // ids that aren't in the wardrobe, re-ask with the exact allowed id list.
  if (parsed.ok) {
    const invented = parsed.value.itemIds.filter(
      (id) => !new Set(s.wardrobe.map((i) => i.id)).has(id),
    );
    if (invented.length) {
      retried = true;
      const allowed = s.wardrobe.map((i) => i.id).join(", ");
      text = await generateOutfit(
        prompt,
        `Your previous answer used ids that are NOT in the wardrobe: ${invented.join(
          ", ",
        )}. Choose ONLY from these exact ids: ${allowed}. Copy them character-for-character.`,
      );
      parsed = parseOutfit(text);
    }
  }

  const lines: string[] = [];
  lines.push(`\n${"═".repeat(78)}`);
  lines.push(s.name);
  lines.push(`expect: ${s.expect}`);
  if (retried) lines.push(`(retried once — first reply invented an id)`);
  lines.push("─".repeat(78));
  if (!parsed.ok) {
    lines.push(`❌ SCHEMA REJECTED`);
    lines.push(parsed.error);
    lines.push(`raw:\n${text}`);
    console.log(lines.join("\n"));
    return { scenario: s.name, valid: false } as const;
  }
  const outfit = parsed.value;
  const { invented, picked } = checkPick(outfit, s.wardrobe);
  lines.push(`occasion: ${outfit.occasion}`);
  lines.push(`pick:`);
  for (const it of picked) lines.push(`   • [${it.category}] ${it.name} (${it.color})`);
  if (invented.length)
    lines.push(`⚠️  INVENTED ids (not in wardrobe): ${invented.join(", ")}`);
  lines.push(`rationale: ${outfit.rationale}`);
  if (outfit.gaps.length) {
    lines.push(`gaps:`);
    for (const g of outfit.gaps) lines.push(`   ⚑ ${g.slot} — ${g.note}`);
  } else {
    lines.push(`gaps: (none)`);
  }
  console.log(lines.join("\n"));
  return {
    scenario: s.name,
    valid: true,
    invented: invented.length,
    gaps: outfit.gaps.length,
    retried,
  } as const;
}

async function main() {
  console.log(`Model: ${MODEL}  ·  one call per event (batching fork below)`);
  // Batching prototype: per-event calls, fired in parallel. The whole-week
  // alternative (one call, cross-event repeat-avoidance) is a fork for #161.
  const results = await Promise.all(SCENARIOS.map(runScenario));
  console.log(`\n${"═".repeat(78)}\nSUMMARY`);
  for (const r of results) {
    console.log(
      `  ${r.valid ? "✓ valid" : "✗ INVALID"}  ${r.scenario}` +
        (r.valid ? `  (invented=${r.invented}, gaps=${r.gaps})` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
