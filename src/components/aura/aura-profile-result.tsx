"use client";

import Image from "next/image";
import Link from "next/link";
import {
  LoaderCircleIcon,
  PaletteIcon,
  PencilIcon,
  RefreshCwIcon,
  ShirtIcon,
  SparklesIcon,
} from "lucide-react";

import {
  portraitPresentation,
  type PortraitRequest,
} from "@/lib/aura-portrait-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The completion state after a durable profile save. Portrait generation starts
 * only after the save has completed.
 */
export function AuraProfileResult({
  portraitUrl,
  request,
  onGenerate,
  onEdit,
}: {
  portraitUrl?: string;
  request: PortraitRequest;
  onGenerate?: () => void;
  onEdit: () => void;
}) {
  const presentation = portraitPresentation({ portraitUrl, request });
  const primaryActionLabel =
    presentation.primaryAction === "retry"
      ? "Try again"
      : presentation.primaryAction === "edit-references"
        ? "Use different photos"
        : "Create my AURA portrait";

  // A finished portrait is on screen and not mid-regeneration.
  const portraitReady =
    presentation.image === "portrait" &&
    !presentation.pending &&
    Boolean(portraitUrl);

  // The happy path: a portrait is ready and the natural next action is to wear
  // it, not to remake it. Regeneration moves to a discreet corner control so it
  // stops competing with the forward step. `generate` on a portrait only ever
  // means "you already have one, make another" — the first-time create lives in
  // the empty state below.
  const portraitComplete =
    portraitReady && presentation.primaryAction === "generate";

  // Show the corner regenerate control whenever remaking is the right verb —
  // the finished portrait, or a retryable failure that left the old one intact.
  // Not for `edit-references`/`unavailable`, where regenerating is the wrong move.
  const showRegenerate =
    portraitReady &&
    Boolean(onGenerate) &&
    (presentation.primaryAction === "generate" ||
      presentation.primaryAction === "retry");
  const regenerateLabel =
    presentation.primaryAction === "retry"
      ? "Try generating again"
      : "Regenerate portrait";

  function handlePrimaryAction() {
    if (presentation.primaryAction === "edit-references") {
      onEdit();
      return;
    }
    onGenerate?.();
  }

  return (
    <div className="grid gap-5">
      <div
        className="bg-muted/30 overflow-hidden rounded-xl border"
        aria-busy={presentation.pending}
      >
        {presentation.image === "portrait" && portraitUrl ? (
          <div className="relative">
            <Image
              src={portraitUrl}
              alt="Your full-body AURA portrait"
              width={1024}
              height={1536}
              sizes="(max-width: 768px) 100vw, 640px"
              className={`h-auto w-full object-cover ${presentation.pending ? "grayscale opacity-50" : ""}`}
            />
            {showRegenerate && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={onGenerate}
                aria-label={regenerateLabel}
                title={regenerateLabel}
                className="bg-background/80 hover:bg-background absolute top-3 right-3 rounded-full shadow-sm backdrop-blur-sm"
              >
                <RefreshCwIcon />
              </Button>
            )}
            {presentation.pending && (
              <div
                role="status"
                aria-live="polite"
                className="bg-background/80 absolute inset-0 grid place-items-center rounded-xl p-6 text-center backdrop-blur-sm"
              >
                <div className="grid justify-items-center gap-3">
                  <LoaderCircleIcon className="text-primary size-10 animate-spin motion-reduce:animate-none" />
                  <p className="font-medium">Preparing a replacement portrait</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center p-6 text-center">
            <div className="grid max-w-sm justify-items-center gap-3">
              <Badge variant="secondary">Profile saved</Badge>
              {presentation.pending ? (
                <LoaderCircleIcon className="text-primary size-10 animate-spin motion-reduce:animate-none" />
              ) : (
                <SparklesIcon className="text-primary size-10" />
              )}
              <div className="grid gap-1">
                <h2 className="text-lg font-medium">{presentation.title}</h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  {presentation.description}
                </p>
              </div>
              {presentation.primaryAction && (
                <Button onClick={handlePrimaryAction}>
                  <SparklesIcon />
                  {primaryActionLabel}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {presentation.image === "portrait" && (
        <p className="text-muted-foreground text-sm text-pretty">
          {presentation.description}
        </p>
      )}

      {/* Ready portrait → move forward into try-on. Any other portrait state
          keeps its own recovery action (retry / use different photos). */}
      {portraitComplete ? (
        <Button
          nativeButton={false}
          render={<Link href="/aura/try-on" />}
          className="sm:justify-self-start"
        >
          <ShirtIcon />
          Try on clothes
        </Button>
      ) : (
        presentation.image === "portrait" &&
        presentation.primaryAction && (
          <Button
            onClick={handlePrimaryAction}
            className="sm:justify-self-start"
          >
            <SparklesIcon />
            {primaryActionLabel}
          </Button>
        )
      )}

      <Button
        variant="outline"
        onClick={onEdit}
        className="sm:justify-self-start"
      >
        <PencilIcon />
        Edit profile
      </Button>

      {/* Tertiary, always available on a saved profile: the public colour
          analysis complements the portrait ("which garment colours suit you"). */}
      <Button
        variant="link"
        nativeButton={false}
        render={<Link href="/colors" />}
        className="text-muted-foreground h-auto justify-self-start p-0"
      >
        <PaletteIcon />
        Find your colours
      </Button>
    </div>
  );
}
