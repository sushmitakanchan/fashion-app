"use client";

/**
 * Variant B — "Agenda".
 *
 * A single scrolling column grouped by day. Each event is a spacious full-width
 * row: when/occasion/place/weather on the left, the outfit as a proper row of
 * larger tiles + AURA rationale + gap flags + a visible action row on the right.
 * Primary affordance = read your week top-to-bottom and act inline. Mobile-first.
 */
import * as React from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Shuffle, Eye, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MOCK_WEEK,
  ItemChip,
  WeatherChip,
  OccasionBadge,
  SourceBadge,
  GapChip,
  PlaceLine,
  type PlannedEvent,
} from "./data";

const stub = (msg: string) => () => toast(msg, { description: "Prototype — no real action runs." });

function EventRow({ event }: { event: PlannedEvent }) {
  const outfit = event.outfit;
  const hasGaps = outfit ? outfit.gaps.length > 0 : false;

  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[13rem_1fr]">
      {/* When / where */}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{event.time}</p>
        <h4 className="text-base font-semibold text-foreground">{event.title}</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <OccasionBadge occasion={event.occasion} />
          <SourceBadge source={event.source} />
        </div>
        <div className="flex flex-col gap-1 pt-0.5">
          <PlaceLine place={event.place} />
          {event.weather && <WeatherChip weather={event.weather} className="w-fit" />}
        </div>
      </div>

      {/* Outfit */}
      <div className="sm:border-l sm:border-border sm:pl-4">
        {!outfit ? (
          <div className="flex h-full flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">No outfit planned yet.</p>
            <Button variant="cta-flat" size="sm" onClick={stub(`Plan outfit for "${event.title}"`)}>
              <Sparkles /> Plan this outfit
            </Button>
          </div>
        ) : (
          <div className={cn("rounded-xl p-0.5", hasGaps && "ring-1 ring-amber-400/50")}>
            <div className="flex flex-wrap gap-2">
              {outfit.items.map((item) => (
                <ItemChip key={item.id} item={item} size="md" />
              ))}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>{outfit.rationale}</span>
            </p>

            {hasGaps && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {outfit.gaps.map((gap) => (
                  <GapChip key={gap.slot} gap={gap} />
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={stub("Regenerate outfit")}>
                <RefreshCw /> Regenerate
              </Button>
              <Button size="sm" variant="outline" onClick={stub("Swap a piece")}>
                <Shuffle /> Swap a piece
              </Button>
              <Button size="sm" variant="ghost" onClick={stub("Generate try-on preview")}>
                <Eye /> {outfit.previewReady ? "See preview" : "Generate preview"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export function VariantAgenda() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Sticky header */}
      <div className="sticky top-14 z-10 -mx-2 mb-4 flex flex-wrap items-center gap-2 bg-background/90 px-2 py-3 backdrop-blur">
        <div className="mr-auto">
          <h2 className="font-heading text-2xl tracking-wide">Your week</h2>
          <p className="text-sm text-muted-foreground">Aug 10 – 16, 2026</p>
        </div>
        <Button variant="outline" size="sm" onClick={stub("Add event")}>
          <Plus /> Add event
        </Button>
        <Button variant="cta-flat" size="sm" onClick={stub("Plan my week — fans out one AI call per event")}>
          <Sparkles /> Plan my week
        </Button>
      </div>

      {/* Google connect nudge */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
        <p className="mr-auto text-sm text-muted-foreground">
          Import events automatically from Google Calendar (read-only).
        </p>
        <Button variant="outline" size="sm" onClick={stub("Connect Google Calendar")}>
          Connect Google Calendar
        </Button>
      </div>

      <div className="space-y-6">
        {MOCK_WEEK.map((day) => (
          <section key={day.key}>
            <header className="mb-2 flex items-baseline gap-2 px-1">
              <h3 className="text-sm font-bold tracking-wider text-foreground uppercase">
                {day.weekday}
              </h3>
              <span className="text-sm text-muted-foreground">{day.date}</span>
              <span className="ml-auto text-xs text-muted-foreground">{day.highLow}</span>
            </header>
            {day.events.length === 0 ? (
              <button
                type="button"
                onClick={stub(`Add event on ${day.weekday}`)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground/70 hover:border-primary hover:text-foreground"
              >
                <Plus className="size-3.5" /> Nothing planned — add an event
              </button>
            ) : (
              <div className="space-y-3">
                {day.events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
