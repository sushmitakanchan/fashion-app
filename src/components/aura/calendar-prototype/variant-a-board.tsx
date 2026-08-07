"use client";

/**
 * Variant A — "Week board".
 *
 * The classic calendar: seven day-columns across, events stack as cards inside
 * each column. Primary affordance = scan the whole week spatially at once.
 * Outfit renders as a compact horizontal swatch strip inside the narrow card.
 * On small screens the columns become a horizontal scroll rail.
 */
import * as React from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Shuffle, Eye, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MOCK_WEEK,
  ItemChip,
  WeatherChip,
  OccasionBadge,
  SourceBadge,
  GapChip,
  type PlannedEvent,
} from "./data";

const stub = (msg: string) => () => toast(msg, { description: "Prototype — no real action runs." });

function EventCard({ event }: { event: PlannedEvent }) {
  const outfit = event.outfit;
  const hasGaps = outfit ? outfit.gaps.length > 0 : false;

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-2.5 text-left shadow-sm",
        hasGaps ? "border-amber-400/60" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">{event.time}</p>
          <h4 className="truncate text-sm font-semibold text-foreground">{event.title}</h4>
        </div>
        <button
          type="button"
          onClick={stub("Card menu: Regenerate · Swap a piece · Preview")}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          aria-label="Event actions"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <OccasionBadge occasion={event.occasion} />
        <SourceBadge source={event.source} />
      </div>
      {event.weather && <WeatherChip weather={event.weather} className="mt-1.5" />}

      {/* Outfit strip / empty / gaps */}
      <div className="mt-2.5 border-t border-dashed border-border pt-2.5">
        {!outfit ? (
          <button
            type="button"
            onClick={stub(`Plan outfit for "${event.title}"`)}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border py-3 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <Plus className="size-4" /> Plan outfit
          </button>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {outfit.items.map((item) => (
                <ItemChip key={item.id} item={item} size="sm" showLabel={false} />
              ))}
            </div>
            {hasGaps && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {outfit.gaps.map((gap) => (
                  <GapChip key={gap.slot} gap={gap} />
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-0.5">
              <Button size="icon-xs" variant="ghost" aria-label="Regenerate" onClick={stub("Regenerate outfit")}>
                <RefreshCw />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label="Swap a piece" onClick={stub("Swap a piece")}>
                <Shuffle />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto"
                onClick={stub("Generate try-on preview")}
              >
                <Eye /> Preview
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export function VariantBoard() {
  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-heading text-2xl tracking-wide">This week</h2>
          <p className="text-sm text-muted-foreground">Aug 10 – 16, 2026</p>
        </div>
        <Button variant="outline" size="sm" onClick={stub("Connect Google Calendar")}>
          Connect Google Calendar
        </Button>
        <Button variant="outline" size="sm" onClick={stub("Add event")}>
          <Plus /> Add event
        </Button>
        <Button variant="cta-flat" size="sm" onClick={stub("Plan my week — fans out one AI call per event")}>
          Plan my week
        </Button>
      </div>

      {/* 7-column board; horizontal scroll below xl */}
      <div className="-mx-2 overflow-x-auto px-2 pb-2">
        <div className="grid min-w-[64rem] grid-cols-7 gap-2 xl:min-w-0">
          {MOCK_WEEK.map((day) => (
            <section key={day.key} className="flex flex-col">
              <header className="mb-2 flex items-baseline justify-between px-0.5">
                <div>
                  <p className="text-xs font-bold tracking-wider text-foreground uppercase">
                    {day.weekday}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{day.date}</p>
                </div>
                <p className="text-[10px] text-muted-foreground">{day.highLow}</p>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {day.events.length === 0 ? (
                  <button
                    type="button"
                    onClick={stub(`Add event on ${day.weekday}`)}
                    className="flex min-h-24 flex-1 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground/70 hover:border-primary hover:text-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                ) : (
                  day.events.map((event) => <EventCard key={event.id} event={event} />)
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
