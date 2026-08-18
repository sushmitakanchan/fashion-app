"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The style capture affordance shown once at profile creation. The participant
 * taps word-chips describing how they like to dress; the picker composes them
 * into a single sentence (the `value`) and reads it back live under "AURA hears".
 *
 * Controlled: it owns no persisted state. The composed sentence is the value —
 * stored on `StylePreference.text`, which the plan/replan routes read verbatim
 * when generating an outfit, so AURA leans on the note without the participant
 * ever managing it again. A blank value is a first-class "no preference".
 *
 * Round-trip: chip selection is reconstructed from the value by matching the
 * fixed vocabulary, so re-opening a saved profile re-lights the same chips.
 */

const VIBE = ["Minimal", "Tailored", "Effortless", "Statement", "Sharp", "Bold colour"];
const FORMALITY = ["Casual", "Smart-casual", "Polished"];
const COLOUR = ["Dark tones", "Warm nudes", "Cool greys", "Jewel tones", "Brights"];
const AVOID = ["dresses", "heels", "loud prints", "logos"];

const ALL = [...VIBE, ...FORMALITY, ...COLOUR, ...AVOID];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-token match so "Casual" doesn't light up inside "Smart-casual": the term
// may not be flanked by a word char or a hyphen. Case-insensitive.
function mentions(value: string, term: string): boolean {
  return new RegExp(`(?<![\\w-])${escapeRegExp(term)}(?![\\w-])`, "i").test(value);
}

function selectionFromValue(value: string): Set<string> {
  return new Set(ALL.filter((term) => mentions(value, term)));
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

function joinNodes(items: string[]) {
  return items.map((w, i) => (
    <React.Fragment key={w}>
      {i > 0 && (i === items.length - 1 ? " & " : ", ")}
      <span className="text-brand-magenta font-medium">{w}</span>
    </React.Fragment>
  ));
}

type Parts = { positives: string[]; formality: string[]; avoid: string[] };

function partsOf(selected: Set<string>): Parts {
  const pick = (group: string[]) => group.filter((w) => selected.has(w));
  return {
    positives: [...pick(VIBE), ...pick(COLOUR)],
    formality: pick(FORMALITY),
    avoid: pick(AVOID),
  };
}

/** The stored/read-back sentence. Deterministic, so parsing it back re-selects the
 *  same chips. Empty when nothing is picked. */
function compose({ positives, formality, avoid }: Parts): string {
  if (!positives.length && !formality.length && !avoid.length) return "";
  let s = "";
  if (positives.length) s += `You lean ${joinWords(positives)}`;
  if (formality.length) {
    s += `${positives.length ? "; " : "You lean "}${joinWords(formality)} in formality`;
  }
  if (avoid.length) {
    s +=
      positives.length || formality.length
        ? ` — and rarely wear ${joinWords(avoid)}`
        : `Rarely wears ${joinWords(avoid)}`;
  }
  return `${s}.`;
}

function Chip({
  label,
  selected,
  disabled,
  onToggle,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-50",
        selected
          ? "bg-brand-magenta border-brand-magenta text-white"
          : "border-input text-foreground hover:border-brand-magenta hover:text-brand-magenta",
      )}
    >
      {label}
    </button>
  );
}

export function StylePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (sentence: string) => void;
  disabled?: boolean;
}) {
  // Seed chip state from the incoming value once; thereafter the chips are the
  // source of truth and the value is derived from them.
  const [selected, setSelected] = React.useState<Set<string>>(() =>
    selectionFromValue(value),
  );

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      onChange(compose(partsOf(next)));
      return next;
    });
  }

  const parts = partsOf(selected);
  const empty =
    parts.positives.length === 0 &&
    parts.formality.length === 0 &&
    parts.avoid.length === 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {[...VIBE, ...FORMALITY, ...COLOUR].map((w) => (
          <Chip
            key={w}
            label={w}
            selected={selected.has(w)}
            disabled={disabled}
            onToggle={() => toggle(w)}
          />
        ))}
      </div>

      <div className="grid gap-2">
        <p className="text-muted-foreground text-[11px] tracking-[0.14em] uppercase">
          Rarely wear
        </p>
        <div className="flex flex-wrap gap-2">
          {AVOID.map((w) => (
            <Chip
              key={w}
              label={w}
              selected={selected.has(w)}
              disabled={disabled}
              onToggle={() => toggle(w)}
            />
          ))}
        </div>
      </div>

      <div className="border-border mt-1 border-t pt-4">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
          AURA hears
        </p>
        <p className="text-foreground mt-2 text-sm text-pretty" aria-live="polite">
          {empty ? (
            <span className="text-muted-foreground">
              Optional — tap a few words and AURA reads them back here. Plans work
              fine without it.
            </span>
          ) : (
            <>
              {parts.positives.length > 0 && <>You lean {joinNodes(parts.positives)}</>}
              {parts.formality.length > 0 && (
                <>
                  {parts.positives.length > 0 ? "; " : "You lean "}
                  {joinNodes(parts.formality)} in formality
                </>
              )}
              {parts.avoid.length > 0 && (
                <>
                  {parts.positives.length || parts.formality.length
                    ? " — and rarely wear "
                    : "Rarely wears "}
                  {joinNodes(parts.avoid)}
                </>
              )}
              .
            </>
          )}
        </p>
      </div>
    </div>
  );
}
