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
  planWeekSequentially,
  plannerOutputSchema,
  reconcileItemIds,
  shouldSuggestReplan,
  WEATHER_FORECAST_HORIZON_DAYS,
  type PlannedOutfitDto,
  type PlannerWardrobeItem,
  type WeekPlanEvent,
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

  it("adds the week repeat-avoidance line only when prior ids are given", () => {
    expect(buildPlannerPrompt(base)).not.toMatch(/already worn/i);
    expect(buildPlannerPrompt({ ...base, priorItemIds: [] })).not.toMatch(/already worn/i);

    const prompt = buildPlannerPrompt({ ...base, priorItemIds: ["a", "b"] });
    expect(prompt).toMatch(/already worn earlier this week/i);
    expect(prompt).toContain(JSON.stringify(["a", "b"]));
    // Frames the soft basics-may-repeat / distinctive-avoid rule.
    expect(prompt.toLowerCase()).toContain("basics");
    expect(prompt.toLowerCase()).toContain("distinctive");
  });
});

/* -------------------------------------------------------------------------- */
/*                          planWeekSequentially                              */
/* -------------------------------------------------------------------------- */

function outfit(items: string[], updatedAt = "2026-08-10T00:00:00.000Z"): PlannedOutfitDto {
  return {
    id: `outfit_${items.join("-")}`,
    provenance: "ai_planned",
    rationale: "A coherent pick.",
    gaps: [],
    items: items.map((id, index) => ({
      id,
      category: "top",
      name: `Item ${id}`,
      color: "black",
      position: index,
    })),
    updatedAt,
  };
}

function event(id: string, startsAt: string, planned = false): WeekPlanEvent {
  return { id, startsAt, outfit: planned ? outfit(["x"]) : null };
}

describe("planWeekSequentially", () => {
  it("plans only unplanned events, in date order, feeding prior committed ids", async () => {
    // Deliberately out of date order, with one already-planned event mixed in.
    const events: WeekPlanEvent[] = [
      event("wed", "2026-08-12T18:00:00.000Z"),
      event("mon", "2026-08-10T09:00:00.000Z"),
      event("tue-planned", "2026-08-11T09:00:00.000Z", true),
      event("tue", "2026-08-11T12:00:00.000Z"),
    ];

    const calls: { id: string; prior: string[] }[] = [];
    const outcomes = await planWeekSequentially(events, async (evt, priorItemIds) => {
      calls.push({ id: evt.id, prior: [...priorItemIds] });
      // Each event commits one distinct piece.
      return outfit([evt.id === "mon" ? "a" : evt.id === "tue" ? "b" : "c"]);
    });

    // Ran in date order and skipped the already-planned event (non-destructive).
    expect(calls.map((call) => call.id)).toEqual(["mon", "tue", "wed"]);
    // Each call received the ids committed to the earlier events this week.
    expect(calls.map((call) => call.prior)).toEqual([[], ["a"], ["a", "b"]]);
    // Only the three unplanned events produced outcomes.
    expect(outcomes.map((outcome) => outcome.event.id)).toEqual(["mon", "tue", "wed"]);
  });

  it("continues on error — one failing day never sinks the week", async () => {
    const events = [
      event("mon", "2026-08-10T09:00:00.000Z"),
      event("tue", "2026-08-11T09:00:00.000Z"),
      event("wed", "2026-08-12T09:00:00.000Z"),
    ];

    const revealed: { id: string; ok: boolean }[] = [];
    const outcomes = await planWeekSequentially(
      events,
      async (evt, priorItemIds) => {
        if (evt.id === "tue") throw new Error("planner boom");
        // The failed day contributed nothing, so its id is absent downstream.
        expect([...priorItemIds]).not.toContain("b");
        return outfit([evt.id === "mon" ? "a" : "c"]);
      },
      (outcome) => revealed.push({ id: outcome.event.id, ok: outcome.outfit !== null }),
    );

    // All three resolved; only the middle one failed.
    expect(outcomes.map((outcome) => Boolean(outcome.outfit))).toEqual([true, false, true]);
    // Progressive reveal fired once per event, in order.
    expect(revealed).toEqual([
      { id: "mon", ok: true },
      { id: "tue", ok: false },
      { id: "wed", ok: true },
    ]);
  });

  it("passes a snapshot of prior ids, immune to later mutation", async () => {
    const events = [
      event("mon", "2026-08-10T09:00:00.000Z"),
      event("tue", "2026-08-11T09:00:00.000Z"),
    ];
    const captured: readonly string[][] = [];
    await planWeekSequentially(events, async (_evt, priorItemIds) => {
      (captured as string[][]).push(priorItemIds as string[]);
      return outfit(["a"]);
    });
    // The first call's snapshot stays empty even after the second call commits "a".
    expect(captured[0]).toEqual([]);
    expect(captured[1]).toEqual(["a"]);
  });

  it("does nothing when every event is already planned", async () => {
    const events = [event("mon", "2026-08-10T09:00:00.000Z", true)];
    let called = false;
    const outcomes = await planWeekSequentially(events, async () => {
      called = true;
      return outfit(["a"]);
    });
    expect(called).toBe(false);
    expect(outcomes).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*                          shouldSuggestReplan                               */
/* -------------------------------------------------------------------------- */

describe("shouldSuggestReplan", () => {
  const today = "2026-08-12";
  // An event now 3 days out (well inside the horizon) that was planned back when
  // it was still 40 days out (beyond the horizon → weather-less).
  const inWindow = {
    placed: true,
    eventDate: "2026-08-15",
    outfitUpdatedDate: "2026-07-06",
    today,
  };

  it("nudges a placed, in-window event that was planned weather-less", () => {
    expect(shouldSuggestReplan(inWindow)).toBe(true);
  });

  it("does not nudge an unplaced event", () => {
    expect(shouldSuggestReplan({ ...inWindow, placed: false })).toBe(false);
  });

  it("does not nudge an event still beyond the forecast horizon", () => {
    const eventDate = "2026-09-30"; // ~49 days out — outside the window now
    expect(
      shouldSuggestReplan({ ...inWindow, eventDate }),
    ).toBe(false);
  });

  it("does not nudge a past event", () => {
    expect(
      shouldSuggestReplan({ ...inWindow, eventDate: "2026-08-01" }),
    ).toBe(false);
  });

  it("does not nudge when the outfit was already planned inside the window", () => {
    // Planned yesterday, when the event was already in the forecast window.
    expect(
      shouldSuggestReplan({ ...inWindow, outfitUpdatedDate: "2026-08-11" }),
    ).toBe(false);
  });

  it("keys off the forecast horizon boundary", () => {
    // Event exactly at the horizon is in-window; one day past it is not.
    const atHorizon = "2026-08-27"; // today + 15
    const pastHorizon = "2026-08-28"; // today + 16
    expect(
      shouldSuggestReplan({ ...inWindow, eventDate: atHorizon }),
    ).toBe(true);
    expect(
      shouldSuggestReplan({ ...inWindow, eventDate: pastHorizon }),
    ).toBe(false);
    expect(WEATHER_FORECAST_HORIZON_DAYS).toBe(15);
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
