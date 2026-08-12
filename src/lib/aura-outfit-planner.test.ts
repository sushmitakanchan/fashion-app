import { describe, expect, it } from "bun:test";

import { MAX_TRY_ON_GARMENTS } from "@/lib/validations";
import {
  buildAdjustmentDirective,
  buildPlannerPrompt,
  buildWeatherSummary,
  droppedItemsGap,
  extractPlannerJson,
  formatPlannerWhen,
  parsePlannerOutput,
  plannerOutputSchema,
  reconcileItemIds,
  type PlannerWardrobeItem,
} from "./aura-outfit-planner";

const WARDROBE: PlannerWardrobeItem[] = [
  { id: "a", category: "top", name: "White tee", color: "white" },
  { id: "b", category: "bottom", name: "Black jeans", color: "black", brand: "Levi's" },
  { id: "c", category: "shoes", name: "Sneakers", color: "grey", occasion: "casual" },
];

describe("plannerOutputSchema", () => {
  it("accepts a well-formed plan and defaults gaps to []", () => {
    const parsed = plannerOutputSchema.safeParse({
      itemIds: ["a", "b"],
      occasion: "casual",
      rationale: "A relaxed everyday pick in a clean neutral palette.",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.gaps).toEqual([]);
  });

  it("rejects an empty pick with no gap", () => {
    const parsed = plannerOutputSchema.safeParse({
      itemIds: [],
      occasion: "formal",
      rationale: "Nothing in the wardrobe fits.",
      gaps: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("allows an empty pick when accompanied by a gap", () => {
    const parsed = plannerOutputSchema.safeParse({
      itemIds: [],
      occasion: "formal",
      rationale: "No formalwear is available.",
      gaps: [{ slot: "formal suit", note: "No formal outfit in the wardrobe." }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects more than the previewable cap of item ids", () => {
    const parsed = plannerOutputSchema.safeParse({
      itemIds: Array.from({ length: MAX_TRY_ON_GARMENTS + 1 }, (_, i) => `id${i}`),
      occasion: "casual",
      rationale: "Too many items.",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("extractPlannerJson / parsePlannerOutput", () => {
  it("strips a ```json fence and surrounding prose", () => {
    const reply =
      'Here is your plan:\n```json\n{"itemIds":["a"],"occasion":"casual","rationale":"Clean and simple."}\n```';
    expect(extractPlannerJson(reply).startsWith("{")).toBe(true);
    const parsed = parsePlannerOutput(reply);
    expect(parsed?.itemIds).toEqual(["a"]);
  });

  it("returns null on unparseable text", () => {
    expect(parsePlannerOutput("no json here")).toBeNull();
  });

  it("returns null on valid JSON that violates the schema", () => {
    expect(parsePlannerOutput('{"itemIds":[],"occasion":"x","rationale":"y","gaps":[]}')).toBeNull();
  });
});

describe("reconcileItemIds", () => {
  const allowed = ["a", "b", "c"];

  it("keeps only ids in the fed set and flags the rest as invalid", () => {
    const { itemIds, invalidIds } = reconcileItemIds(["a", "z", "b"], allowed);
    expect(itemIds).toEqual(["a", "b"]);
    expect(invalidIds).toEqual(["z"]);
  });

  it("dedupes while preserving reply order", () => {
    const { itemIds } = reconcileItemIds(["b", "a", "b"], allowed);
    expect(itemIds).toEqual(["b", "a"]);
  });

  it("caps the valid set at the previewable maximum", () => {
    const many = Array.from({ length: MAX_TRY_ON_GARMENTS + 3 }, (_, i) => `k${i}`);
    const { itemIds } = reconcileItemIds(many, many);
    expect(itemIds).toHaveLength(MAX_TRY_ON_GARMENTS);
  });

  it("accepts a Set as the allowed collection", () => {
    const { itemIds, invalidIds } = reconcileItemIds(["a", "q"], new Set(allowed));
    expect(itemIds).toEqual(["a"]);
    expect(invalidIds).toEqual(["q"]);
  });
});

describe("droppedItemsGap", () => {
  it("is a schema-valid gap", () => {
    const gap = droppedItemsGap();
    const parsed = plannerOutputSchema.safeParse({
      itemIds: [],
      occasion: "casual",
      rationale: "One pick was dropped.",
      gaps: [gap],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("buildWeatherSummary", () => {
  it("summarises a forecast with rounded temps and precipitation", () => {
    const summary = buildWeatherSummary({
      label: "Light rain",
      temperatureMax: 30.6,
      temperatureMin: 25.4,
      precipitationProbabilityMax: 80,
    });
    expect(summary).toContain("Light rain");
    expect(summary).toContain("25–31°C");
    expect(summary).toContain("80%");
  });

  it("degrades with a note when no forecast is available", () => {
    const summary = buildWeatherSummary(null);
    expect(summary.toLowerCase()).toContain("no forecast");
    expect(summary.toLowerCase()).toContain("occasion");
  });

  it("omits precipitation when unavailable", () => {
    const summary = buildWeatherSummary({
      label: "Clear sky",
      temperatureMax: 20,
      temperatureMin: 12,
      precipitationProbabilityMax: null,
    });
    expect(summary).not.toContain("%");
  });
});

describe("formatPlannerWhen", () => {
  it("formats an all-day event as a bare date", () => {
    const when = formatPlannerWhen({
      startsAt: new Date("2026-08-12T00:00:00.000Z"),
      endsAt: null,
      allDay: true,
      timezone: "UTC",
    });
    expect(when).toContain("all day");
    expect(when).toContain("August");
  });

  it("formats a timed event with a start and end time in its timezone", () => {
    const when = formatPlannerWhen({
      startsAt: new Date("2026-08-12T13:30:00.000Z"),
      endsAt: new Date("2026-08-12T15:00:00.000Z"),
      allDay: false,
      timezone: "UTC",
    });
    expect(when).toContain("1:30");
    expect(when).toContain("3:00");
  });
});

describe("buildPlannerPrompt", () => {
  const base = {
    occasion: "dinner date",
    when: "Wednesday, August 12, 2026, 7:00 PM",
    place: "Bandra, Maharashtra",
    weather: {
      label: "Light rain",
      temperatureMax: 31,
      temperatureMin: 26,
      precipitationProbabilityMax: 80,
    },
    stylePreference: "minimal, dark tones",
    wardrobe: WARDROBE,
  };

  it("includes occasion, place, weather, style, and every wardrobe id", () => {
    const prompt = buildPlannerPrompt(base);
    expect(prompt).toContain("dinner date");
    expect(prompt).toContain("Bandra");
    expect(prompt).toContain("Light rain");
    expect(prompt).toContain("minimal, dark tones");
    for (const item of WARDROBE) expect(prompt).toContain(item.id);
  });

  it("omits the style-preference line entirely when absent", () => {
    const prompt = buildPlannerPrompt({ ...base, stylePreference: null });
    expect(prompt).not.toContain("Style preference:");
  });

  it("degrades the weather line when no forecast is given", () => {
    const prompt = buildPlannerPrompt({ ...base, weather: null });
    expect(prompt.toLowerCase()).toContain("no forecast");
  });

  it("never leaks a secret event title — there is no title input", () => {
    // The type has no `title` field; even if one is smuggled in, it is ignored.
    const prompt = buildPlannerPrompt({
      ...base,
      // @ts-expect-error — title is intentionally not part of the input contract.
      title: "Oncology follow-up — CONFIDENTIAL",
    });
    expect(prompt.toLowerCase()).not.toContain("oncology");
    expect(prompt.toLowerCase()).not.toContain("confidential");
  });

  it("adds no adjustment directive for a fresh plan", () => {
    const prompt = buildPlannerPrompt(base);
    expect(prompt).not.toContain("Adjustment");
    expect(prompt).not.toContain("Do NOT reuse");
    expect(prompt).not.toContain("Keep these");
  });

  it("Regenerate: excludes the current pick softly, no keep list", () => {
    const prompt = buildPlannerPrompt({ ...base, exclude: ["a", "b"] });
    expect(prompt).toContain("Do NOT reuse");
    expect(prompt).toContain("a (White tee)");
    expect(prompt).toContain("b (Black jeans)");
    expect(prompt).toContain("a genuinely different outfit");
    // Soft — never fabricate a gap when nothing else fits.
    expect(prompt).toContain("do NOT invent a gap");
    expect(prompt).not.toContain("Keep these");
  });

  it("Swap: keeps the untouched pieces and excludes only the swapped one", () => {
    const prompt = buildPlannerPrompt({ ...base, exclude: ["c"], keep: ["a", "b"] });
    expect(prompt).toContain("Keep these already-chosen pieces");
    expect(prompt).toContain("a (White tee)");
    expect(prompt).toContain("b (Black jeans)");
    expect(prompt).toContain("Do NOT reuse this piece: c (Sneakers)");
    expect(prompt).toContain("a different piece to complete the outfit");
  });
});

describe("buildAdjustmentDirective", () => {
  it("returns null when there is nothing to adjust", () => {
    expect(buildAdjustmentDirective({ wardrobe: WARDROBE })).toBeNull();
    expect(
      buildAdjustmentDirective({ exclude: [], keep: [], wardrobe: WARDROBE }),
    ).toBeNull();
  });

  it("falls back to the bare id when it isn't in the fed wardrobe", () => {
    const directive = buildAdjustmentDirective({ exclude: ["zzz"], wardrobe: WARDROBE });
    expect(directive).toContain("zzz");
    expect(directive).not.toContain("zzz (");
  });
});
