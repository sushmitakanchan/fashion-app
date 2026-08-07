"use client";

/**
 * Variant C — "Focus" (master-detail).
 *
 * A slim week rail navigates; the main pane foregrounds ONE day's outfit with
 * the try-on preview as the hero. Primary affordance = deep interaction with a
 * single look (generate/see the preview, swap pieces) rather than scanning the
 * whole week. The rail keeps the week glanceable as navigation, with dots for
 * event count and an amber mark for "needs attention" (unplanned or gaps).
 */
import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";

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
  type PlannedDay,
  type PlannedEvent,
} from "./data";

const stub = (msg: string) => () => toast(msg, { description: "Prototype — no real action runs." });

function needsAttention(day: PlannedDay): boolean {
  return day.events.some((e) => !e.outfit || e.outfit.gaps.length > 0);
}

function EventDetail({ event }: { event: PlannedEvent }) {
  const outfit = event.outfit;
  const hasGaps = outfit ? outfit.gaps.length > 0 : false;

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h3 className="text-xl font-semibold text-foreground">{event.title}</h3>
          <p className="text-sm text-muted-foreground">{event.time}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <OccasionBadge occasion={event.occasion} />
          <SourceBadge source={event.source} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <PlaceLine place={event.place} />
        {event.weather && <WeatherChip weather={event.weather} />}
      </div>

      {/* Hero: preview + items */}
      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,15rem)_1fr]">
        {/* Preview panel — the try-on reuse, foregrounded */}
        <div className="aspect-[3/4] w-full overflow-hidden rounded-xl border border-border bg-gradient-to-b from-muted to-muted/40">
          {!outfit ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
              <Sparkles className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No outfit yet.</p>
              <Button variant="cta-flat" size="sm" onClick={stub(`Plan outfit for "${event.title}"`)}>
                Plan this outfit
              </Button>
            </div>
          ) : outfit.previewReady ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.03)_10px,rgba(0,0,0,0.03)_20px)] p-4 text-center">
              <ImageIcon className="size-8 text-foreground/40" />
              <p className="text-xs text-muted-foreground">Try-on preview on your portrait</p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
              <ImageIcon className="size-7 text-muted-foreground" />
              <Button variant="outline" size="sm" onClick={stub("Generate try-on preview")}>
                Generate preview
              </Button>
              <p className="text-[11px] text-muted-foreground">Renders this set on your AURA portrait.</p>
            </div>
          )}
        </div>

        {/* Items + rationale + actions */}
        <div>
          {outfit ? (
            <>
              <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                The look · {outfit.items.length} pieces
              </p>
              <div className="flex flex-wrap gap-3">
                {outfit.items.map((item) => (
                  <ItemChip key={item.id} item={item} size="lg" />
                ))}
              </div>

              <p className="mt-4 flex items-start gap-1.5 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{outfit.rationale}</span>
              </p>

              {hasGaps && (
                <div className="mt-3 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" /> Your wardrobe can&apos;t fully cover this
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {outfit.gaps.map((gap) => (
                      <GapChip key={gap.slot} gap={gap} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={stub("Regenerate outfit")}>
                  <RefreshCw /> Regenerate
                </Button>
                <Button size="sm" variant="outline" onClick={stub("Swap a piece")}>
                  <Shuffle /> Swap a piece
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This event has no outfit yet. Plan it from the preview panel, or run
              “Plan my week”.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function VariantFocus() {
  const firstActive = MOCK_WEEK.find((d) => d.events.length > 0)?.key ?? MOCK_WEEK[0].key;
  const [selectedKey, setSelectedKey] = React.useState(firstActive);
  const selected = MOCK_WEEK.find((d) => d.key === selectedKey) ?? MOCK_WEEK[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
      {/* Week rail */}
      <aside className="lg:sticky lg:top-16 lg:self-start">
        <div className="mb-3">
          <h2 className="font-heading text-xl tracking-wide">This week</h2>
          <p className="text-xs text-muted-foreground">Aug 10 – 16, 2026</p>
        </div>
        <Button
          variant="cta-flat"
          size="sm"
          className="mb-3 w-full"
          onClick={stub("Plan my week — fans out one AI call per event")}
        >
          <Sparkles /> Plan my week
        </Button>
        <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1.5 lg:overflow-visible">
          {MOCK_WEEK.map((day) => {
            const active = day.key === selectedKey;
            const attention = needsAttention(day) && day.events.length > 0;
            return (
              <li key={day.key} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setSelectedKey(day.key)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-28 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors lg:w-full",
                    active
                      ? "border-foreground bg-accent"
                      : "border-border hover:bg-accent/60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-wider text-foreground uppercase">
                      {day.weekday}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{day.date}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    {attention && (
                      <span className="size-1.5 rounded-full bg-amber-500" title="Needs attention" />
                    )}
                    {day.events.length > 0 ? (
                      <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                        {day.events.length}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/50">—</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start text-muted-foreground"
          onClick={stub("Connect Google Calendar")}
        >
          <Plus /> Connect Google Calendar
        </Button>
      </aside>

      {/* Detail */}
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">
            {selected.weekday}, {selected.date}
          </h3>
          <span className="text-sm text-muted-foreground">· {selected.highLow}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={stub("Add event")}>
            <Plus /> Add event
          </Button>
        </div>
        {selected.events.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-center">
            <p className="text-sm text-muted-foreground">Nothing planned for this day.</p>
            <Button variant="outline" size="sm" onClick={stub(`Add event on ${selected.weekday}`)}>
              <Plus /> Add an event
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {selected.events.map((event) => (
              <EventDetail key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
