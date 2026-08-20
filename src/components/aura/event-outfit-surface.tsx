"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Shirt,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import type { PlannedEventDto } from "@/components/aura/calendar-surface";
import type { PlannedOutfitDto } from "@/lib/aura-outfit-planner";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { shortPlaceLabel } from "@/lib/calendar-place";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EventWeather, TicketField } from "@/components/aura/event-weather";
import { AuraPortraitLoading, PLAN_CAPTIONS } from "@/components/aura/aura-portrait-loading";
import { SmartPlanningDisclosure } from "@/components/aura/smart-planning-disclosure";
import { WardrobeOutfitPicker } from "@/components/aura/wardrobe-outfit-picker";
import {
  OutfitPreview,
  requestPlan,
  requestReplan,
  type OutfitEdit,
} from "@/components/aura/outfit";

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const eyebrowFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function formatEventTime(event: PlannedEventDto): string {
  if (event.allDay) return "All day";
  const start = timeFmt.format(new Date(event.startsAt));
  if (event.endsAt) return `${start} – ${timeFmt.format(new Date(event.endsAt))}`;
  return start;
}

/** The instant an event is over — an all-day event runs to the end of its day, a
 *  timed one to its end (or its start, if open-ended). Drives the "history is
 *  read-only" gate. */
function eventEndMs(event: PlannedEventDto): number {
  const start = new Date(event.startsAt).getTime();
  if (event.allDay) return start + 24 * 60 * 60 * 1000;
  return event.endsAt ? new Date(event.endsAt).getTime() : start;
}

/** How many card slots the ghost/planning rack shows — the locked Rack is a 3-up
 *  grid, so an unplanned event previews three empty places to fill. */
const GHOST_SLOTS = 3;

/** One empty place on the Ghost Rack: a dashed placeholder that reuses the
 *  gap-card visual language. It shimmers while a plan is being generated. */
function GhostCard({ shimmer }: { shimmer: boolean }) {
  return (
    <div
      className={cn(
        "border-border/70 bg-muted/30 flex aspect-[1/1.12] flex-col items-center justify-center gap-2 rounded-xl border border-dashed",
        shimmer && "animate-pulse",
      )}
      aria-hidden="true"
    >
      <Shirt className="text-muted-foreground/40 size-6" />
    </div>
  );
}

/** One planned wardrobe piece on the Rack: a large image tile with a slot pill,
 *  its name and colour, and — when the event is still editable — an AI Swap and a
 *  manual Replace. Fetches its own short-lived signed media URL like the compact
 *  tiles do. */
function GarmentCard({
  item,
  canSwap,
  swapping,
  disabled,
  canEdit,
  onSwap,
  onReplace,
}: {
  item: PlannedOutfitDto["items"][number];
  canSwap: boolean;
  swapping: boolean;
  disabled: boolean;
  canEdit: boolean;
  onSwap: () => void;
  onReplace: () => void;
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/wardrobe/${item.id}/media?variant=normalized`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { url?: string } | null;
        if (!controller.signal.aborted && response.ok && body?.url) setImageUrl(body.url);
      } catch {
        // A missing tile image is non-fatal — the label still identifies the piece.
      }
    }
    void load();
    return () => controller.abort();
  }, [item.id]);

  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-xl border transition hover:border-brand-magenta/40 hover:shadow-sm">
      <div className="bg-muted relative aspect-[1/1.12] w-full overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a durable asset
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        ) : (
          <div className="size-full animate-pulse" aria-hidden="true" />
        )}
        <span className="bg-background/80 text-muted-foreground absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.15em] uppercase backdrop-blur-sm">
          {item.category}
        </span>
        {swapping ? (
          <div className="bg-brand-ink/55 absolute inset-0 grid place-items-center text-white">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <span className="truncate text-sm font-semibold">{item.name}</span>
        <span className="text-muted-foreground truncate text-xs">{item.color}</span>
        {canEdit ? (
          <div className="mt-3 flex gap-1.5">
            {canSwap ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSwap}
                disabled={disabled}
                className="flex-1 rounded-full text-xs"
              >
                <RefreshCw className="size-3.5" />
                Swap
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReplace}
              disabled={disabled}
              className="text-muted-foreground hover:text-brand-magenta flex-1 rounded-full text-xs"
            >
              Replace
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A dashed gap card: the honest "nothing in your wardrobe fits" hole the planner
 *  flagged, kept visible rather than silently dropped. When the event is still
 *  editable it offers to fill the hole by hand. */
function GapCard({
  gap,
  canEdit,
  disabled,
  onAdd,
}: {
  gap: PlannedOutfitDto["gaps"][number];
  canEdit: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex aspect-[1/1.12] flex-col rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <TriangleAlert className="size-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="text-[10px] font-medium tracking-[0.15em] text-amber-700 uppercase dark:text-amber-400">
          Gap · {gap.slot}
        </span>
        {gap.note ? (
          <span className="text-muted-foreground text-[11px] text-pretty">{gap.note}</span>
        ) : null}
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
          className="text-amber-700 hover:text-amber-800 dark:text-amber-400 mt-2 w-full rounded-full text-xs"
        >
          Add one anyway
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The Rack — an event's outfit-detail page. It renders one planned event as a
 * tear-off ticket header (title, occasion, time/place/weather, AURA rationale)
 * over a 3-up grid of garment cards beside a sticky try-on preview, and holds the
 * event's whole outfit lifecycle: the initial AI Plan (an unplanned event shows a
 * Ghost Rack), Swap and Regenerate (the existing `replan` route), Generate
 * preview, and a by-hand "Build it myself" pick (the manual `PUT /outfit`
 * endpoint, which needs no consent because it makes no external call). AI paths
 * stay behind the Smart Planning consent gate — clicking Plan without it raises
 * the disclosure and resumes on agreement.
 */
export function EventOutfitSurface({ event }: { event: PlannedEventDto }) {
  // "Now", resolved once after mount — never during render, since Date.now()
  // differs between the server render and the client and would mismatch on
  // hydration. `null` until resolved; everything time-dependent (the formatted
  // header, the history gate) reads a stable placeholder until then.
  const [now, setNow] = React.useState<number | null>(null);
  const [outfit, setOutfit] = React.useState<PlannedOutfitDto | null>(event.outfit);

  const [consentActive, setConsentActive] = React.useState<boolean | null>(null);
  const [showDisclosure, setShowDisclosure] = React.useState(false);

  const [planning, setPlanning] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [swapItemId, setSwapItemId] = React.useState<string | null>(null);
  // What to resume once consent is granted: the initial plan or a specific edit.
  const pendingRef = React.useRef<{ type: "plan" } | { type: "replan"; edit: OutfitEdit } | null>(
    null,
  );

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [savingManual, setSavingManual] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time resolve of the client-only clock on mount
    setNow(Date.now());
  }, []);
  const mounted = now !== null;
  const isPast = now !== null && now > eventEndMs(event);
  const canEdit = mounted && !isPast;

  // Resolve current Smart Planning consent once after mount — an internal read of
  // our own DB, no third-party contact.
  React.useEffect(() => {
    const controller = new AbortController();
    async function loadConsent() {
      try {
        const response = await fetch("/api/aura/calendar/consent", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as { active?: boolean } | null;
        if (!controller.signal.aborted) setConsentActive(Boolean(response.ok && body?.active));
      } catch {
        if (!controller.signal.aborted) setConsentActive(false);
      }
    }
    void loadConsent();
    return () => controller.abort();
  }, []);

  async function plan() {
    setPlanning(true);
    try {
      const result = await requestPlan(event.id, []);
      if ("consentRequired" in result) {
        pendingRef.current = { type: "plan" };
        setShowDisclosure(true);
        return;
      }
      if ("error" in result) {
        toast.error("We couldn't plan this outfit", { description: result.error });
        return;
      }
      setOutfit(result.outfit);
      toast.success("Outfit planned", {
        description:
          result.outfit.items.length > 0
            ? `${result.outfit.items.length} ${result.outfit.items.length === 1 ? "piece" : "pieces"} from your wardrobe`
            : "AURA flagged a wardrobe gap.",
      });
    } catch {
      toast.error("We couldn't plan this outfit", { description: "Please try again." });
    } finally {
      setPlanning(false);
    }
  }

  async function replan(edit: OutfitEdit) {
    if (!outfit) return;
    setEditing(true);
    if (edit.mode === "swap") setSwapItemId(edit.itemId);
    try {
      const result = await requestReplan(event.id, edit);
      if ("consentRequired" in result) {
        pendingRef.current = { type: "replan", edit };
        setShowDisclosure(true);
        return;
      }
      if ("error" in result) {
        toast.error(
          edit.mode === "swap" ? "We couldn't swap that piece" : "We couldn't regenerate this outfit",
          { description: result.error },
        );
        return;
      }
      setOutfit(result.outfit);
      toast.success(edit.mode === "swap" ? "Piece swapped" : "Outfit regenerated");
    } catch {
      toast.error(
        edit.mode === "swap" ? "We couldn't swap that piece" : "We couldn't regenerate this outfit",
        { description: "Please try again." },
      );
    } finally {
      setEditing(false);
      setSwapItemId(null);
    }
  }

  async function enableSmartPlanning() {
    try {
      const response = await fetch("/api/aura/calendar/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION }),
      });
      const body = (await response.json().catch(() => null)) as
        | { active?: boolean; error?: string }
        | null;
      if (!response.ok || !body?.active) {
        toast.error("We couldn't turn on Smart Planning", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }
      setShowDisclosure(false);
      setConsentActive(true);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending?.type === "plan") void plan();
      else if (pending?.type === "replan") void replan(pending.edit);
    } catch {
      toast.error("We couldn't turn on Smart Planning", { description: "Please try again." });
    }
  }

  async function saveManual(itemIds: string[]) {
    setSavingManual(true);
    try {
      const response = await fetch(`/api/aura/calendar/events/${event.id}/outfit`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      const body = (await response.json().catch(() => null)) as
        | { outfit?: PlannedOutfitDto; error?: string }
        | null;
      if (!response.ok || !body?.outfit) {
        toast.error("We couldn't save this outfit", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }
      setOutfit(body.outfit);
      setPickerOpen(false);
      toast.success("Outfit saved", { description: "Your hand-picked look is set." });
    } catch {
      toast.error("We couldn't save this outfit", { description: "Please try again." });
    } finally {
      setSavingManual(false);
    }
  }

  const weatherEnabled = mounted && consentActive === true && Boolean(event.placeText);
  const hasPieces = Boolean(outfit && outfit.items.length > 0);
  const currentItemIds = outfit ? outfit.items.map((item) => item.id) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
      <Link
        href="/aura/calendar"
        className="text-muted-foreground hover:text-brand-magenta mt-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to calendar
      </Link>

      {/* Tear-off ticket header */}
      <header className="border-border bg-card relative mt-4 rounded-xl border p-6 shadow-sm sm:p-8">
        <p className="text-brand-magenta font-mono text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
          {mounted ? eyebrowFmt.format(new Date(event.startsAt)) : " "}
        </p>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-heading text-3xl tracking-wide uppercase sm:text-4xl">
            {event.title}
          </h1>
          {event.source === "google" ? (
            <span className="border-border text-muted-foreground mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
              Google
            </span>
          ) : null}
        </div>

        {event.occasion ? (
          <span className="bg-brand-lime text-brand-lime-foreground mt-3 inline-block rounded font-mono text-[0.62rem] tracking-[0.16em] uppercase px-2 py-1">
            {event.occasion}
          </span>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          <TicketField label="When">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">{mounted ? formatEventTime(event) : "—"}</span>
          </TicketField>
          {event.placeText ? (
            <TicketField label="Place">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate" title={event.placeText}>
                {shortPlaceLabel(event.placeText)}
              </span>
            </TicketField>
          ) : null}
          {event.placeText ? <EventWeather eventId={event.id} enabled={weatherEnabled} /> : null}
        </div>

        {/* Provenance reads off the rationale: AURA's reasoning present → it planned
            this; absent on a planned look → the pieces were hand-picked. */}
        {outfit?.rationale ? (
          <div className="border-border mt-6 flex gap-3 border-t border-dashed pt-5">
            <span className="text-brand-magenta font-heading text-3xl leading-none">&ldquo;</span>
            <p className="text-muted-foreground max-w-prose text-pretty italic">
              {outfit.rationale}
            </p>
          </div>
        ) : outfit ? (
          <div className="border-border text-muted-foreground mt-6 flex items-center gap-2 border-t border-dashed pt-5 text-sm">
            <Pencil className="size-3.5" aria-hidden="true" />
            Hand-picked by you.
          </div>
        ) : null}
      </header>

      {/* Look heading */}
      <div className="mt-10 mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-xl tracking-wide uppercase">Your look</h2>
        <span className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.14em] uppercase">
          {outfit
            ? hasPieces
              ? `${outfit.items.length} ${outfit.items.length === 1 ? "piece" : "pieces"} · ${
                  outfit.provenance === "user_edited" ? "your pick" : "AURA-selected"
                }`
              : "Wardrobe gap"
            : planning
              ? "Planning…"
              : "Not planned yet"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* The rack */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {outfit ? (
            <>
              {outfit.items.map((item) => (
                <GarmentCard
                  key={item.id}
                  item={item}
                  canSwap={canEdit && outfit.items.length > 1}
                  swapping={swapItemId === item.id}
                  disabled={editing || planning}
                  canEdit={canEdit}
                  onSwap={() => replan({ mode: "swap", itemId: item.id })}
                  onReplace={() => setPickerOpen(true)}
                />
              ))}
              {outfit.gaps.map((gap, index) => (
                <GapCard
                  key={`${gap.slot}-${index}`}
                  gap={gap}
                  canEdit={canEdit}
                  disabled={editing || planning}
                  onAdd={() => setPickerOpen(true)}
                />
              ))}
            </>
          ) : (
            Array.from({ length: GHOST_SLOTS }).map((_, index) => (
              <GhostCard key={index} shimmer={planning} />
            ))
          )}
        </div>

        {/* Sticky action / preview column */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
          {hasPieces && outfit ? (
            <>
              <OutfitPreview
                key={`${outfit.updatedAt}-${outfit.previewImageUrl ?? "none"}`}
                eventId={event.id}
                cachedPreviewUrl={outfit.previewImageUrl}
              />
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => replan({ mode: "regenerate" })}
                    disabled={editing}
                    className="w-full rounded-full"
                  >
                    {editing && swapItemId === null ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Regenerating…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-4" />
                        Regenerate whole look
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPickerOpen(true)}
                    className="text-muted-foreground hover:text-foreground w-full rounded-full"
                  >
                    Build it myself
                  </Button>
                </>
              ) : null}
              <p className="text-muted-foreground text-center text-xs text-pretty">
                Renders this look on your saved portrait. Regenerating is free.
              </p>
            </>
          ) : outfit ? (
            // Planned, but every slot was a gap — nothing to try on yet.
            <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5 text-center">
              <p className="text-sm font-medium">Nothing to try on yet</p>
              <p className="text-muted-foreground text-xs text-pretty">
                AURA couldn&apos;t fill this look from your wardrobe. Add the missing pieces, or
                build the look by hand.
              </p>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-full"
                >
                  Build it myself
                </Button>
              ) : null}
            </div>
          ) : isPast ? (
            <div className="border-border bg-card text-muted-foreground rounded-xl border p-5 text-center text-sm text-pretty">
              This event has passed — its outfit is history now.
            </div>
          ) : planning ? (
            // Planning-in-progress: the panel that held the CTA becomes the
            // darkroom loader while AURA assembles the look (#209), so the ~minute
            // wait gets the same treatment as preview generation rather than a bare
            // button spinner. The ghost cards shimmer alongside it.
            <AuraPortraitLoading title="Planning your outfit" captions={PLAN_CAPTIONS} />
          ) : (
            // Ghost Rack action panel: the single action an unplanned event offers.
            <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5 text-center">
              <p className="text-sm font-medium">No outfit planned yet</p>
              <p className="text-muted-foreground text-xs text-pretty">
                Let AURA pick a look from your wardrobe for this event, or build one by hand.
              </p>
              <Button type="button" onClick={() => void plan()} className="rounded-full">
                <Sparkles className="size-4" />
                Plan this outfit
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPickerOpen(true)}
                className="text-muted-foreground hover:text-foreground rounded-full"
              >
                Build it myself
              </Button>
            </div>
          )}
        </aside>
      </div>

      {showDisclosure ? (
        <SmartPlanningDisclosure
          onAgree={() => void enableSmartPlanning()}
          onCancel={() => {
            pendingRef.current = null;
            setShowDisclosure(false);
          }}
        />
      ) : null}

      {pickerOpen ? (
        <WardrobeOutfitPicker
          initialItemIds={currentItemIds}
          saving={savingManual}
          onCancel={() => setPickerOpen(false)}
          onSave={(itemIds) => void saveManual(itemIds)}
        />
      ) : null}
    </div>
  );
}
