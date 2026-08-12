"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shirt } from "lucide-react";
import { toast } from "sonner";

import {
  STYLE_PREFERENCE_MAX_LENGTH,
  stylePreferenceSchema,
  type StylePreferenceInput,
} from "@/lib/validations";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Owner-confirmed microcopy (spec §8) — kept verbatim so the capture affordance
// speaks in the same voice everywhere the preference is written.
const HELPER =
  "Tell AURA how you like to dress — colours & tones, vibe, formality lean, fabrics you love, and anything you avoid. A sentence or two is plenty.";
const PLACEHOLDER =
  "e.g. Minimal, dark neutral tones — tailored over flowy, rarely wear dresses or heels.";

type PreferenceResponse = { text?: string | null; error?: string };

/**
 * The style-preference capture affordance on the calendar. One short, optional
 * free-text note the planner later leans on — written, edited, and re-read here;
 * one row per user, replaced on each save. It never gates planning: leaving it
 * blank (or clearing it) is a first-class choice the planner simply omits.
 *
 * Placement is the calendar UX's call (spec §9); this component owns only the
 * write/edit/read affordance the style-preference ticket guarantees exists.
 */
export function StylePreferenceCard() {
  const [loading, setLoading] = React.useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<StylePreferenceInput>({
    resolver: zodResolver(stylePreferenceSchema),
    defaultValues: { text: "" },
  });

  // Load the stored preference once after mount, then make it the form's
  // baseline via `reset` so `isDirty` measures change against the saved value.
  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/aura/calendar/style-preference", {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | PreferenceResponse
          | null;
        if (!controller.signal.aborted && response.ok) {
          reset({ text: body?.text ?? "" });
        }
      } catch {
        // A failed read leaves the empty baseline; the participant can still write.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reset]);

  async function onSubmit(values: StylePreferenceInput) {
    let response: Response;
    try {
      response = await fetch("/api/aura/calendar/style-preference", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: values.text }),
      });
    } catch {
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      return;
    }

    const body = (await response.json().catch(() => null)) as
      | PreferenceResponse
      | null;
    if (!response.ok) {
      toast.error("We couldn't save your style preference", {
        description: body?.error ?? "Please try again.",
      });
      return;
    }

    // Re-baseline to the server's stored value (a cleared preference comes back
    // as null → empty), so the form is no longer dirty and the counter is right.
    const saved = body?.text ?? "";
    reset({ text: saved });
    toast.success(
      saved.length > 0 ? "Style preference saved" : "Style preference cleared",
    );
  }

  const text = useWatch({ control, name: "text" }) ?? "";
  const remaining = STYLE_PREFERENCE_MAX_LENGTH - text.length;

  return (
    <section className="border-border bg-card mt-8 rounded-2xl border p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <Shirt className="text-brand-magenta mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-heading text-lg tracking-wide uppercase">Your style</h2>
          <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
            An optional note AURA leans on when planning. Plans work fine without it.
          </p>
        </div>
      </div>

      <form className="mt-4 grid gap-2" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Label htmlFor="style-preference" className="sr-only">
          Style preference
        </Label>
        <p id="style-preference-helper" className="text-muted-foreground text-sm text-pretty">
          {HELPER}
        </p>
        <textarea
          id="style-preference"
          rows={3}
          placeholder={PLACEHOLDER}
          aria-invalid={!!errors.text}
          aria-describedby="style-preference-helper style-preference-count"
          disabled={loading}
          className={cn(
            "border-input placeholder:text-muted-foreground focus-visible:border-brand-magenta focus-visible:ring-brand-magenta/30 w-full resize-y rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3",
          )}
          {...register("text")}
        />
        <div className="flex items-center justify-between gap-3">
          {errors.text?.message ? (
            <p className="text-destructive text-sm">{errors.text.message}</p>
          ) : (
            <span aria-hidden="true" />
          )}
          <span
            id="style-preference-count"
            className={cn(
              "text-muted-foreground text-xs tabular-nums",
              remaining < 0 && "text-destructive",
            )}
          >
            {text.length}/{STYLE_PREFERENCE_MAX_LENGTH}
          </span>
        </div>
        <div className="mt-1">
          <Button
            type="submit"
            variant="cta-flat"
            disabled={loading || isSubmitting || !isDirty}
            className="rounded-full"
          >
            {isSubmitting ? "Saving…" : "Save preference"}
          </Button>
        </div>
      </form>
    </section>
  );
}
