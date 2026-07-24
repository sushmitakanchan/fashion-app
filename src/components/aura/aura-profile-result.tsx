"use client";

import Image from "next/image";
import Link from "next/link";
import {
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
import { AuraPortraitLoading } from "@/components/aura/aura-portrait-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Two initials for the identity chip when there's no account avatar. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AU";
  return (parts[0][0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * The profile view for a user who already has a saved AURA — the design a
 * returning visitor lands on, and the state the form flips to after a save.
 * A ready portrait sits on the left with its forward actions on the right;
 * every other portrait state (generating, empty, retryable failure) reuses the
 * same shell so the surface never jumps between layouts.
 */
export function AuraProfileResult({
  name,
  avatarUrl,
  portraitUrl,
  referencePhotoUrl,
  request,
  onGenerate,
  onEdit,
}: {
  name: string;
  avatarUrl?: string;
  portraitUrl?: string;
  referencePhotoUrl?: string;
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
  // it, not to remake it. Regeneration moves to the corner control so it stops
  // competing with the forward step. `generate` on a portrait only ever means
  // "you already have one, make another" — the first-time create lives in the
  // primary action below.
  const portraitComplete =
    portraitReady && presentation.primaryAction === "generate";

  // The corner regenerate control shows whenever remaking is the right verb —
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

  const displayName = name.trim() || "Your AURA";
  const eyebrow = portraitReady ? "Your portrait" : "Your AURA profile";
  const heading = portraitReady
    ? "Studio-style, generated from your photos"
    : presentation.title;

  return (
    <div className="grid gap-8">
      {/* Identity header — one AURA profile per account. */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="ring-upload-accent ring-offset-background size-14 shrink-0 overflow-hidden rounded-full ring-2 ring-offset-2">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={56}
              height={56}
              className="size-full object-cover"
            />
          ) : (
            <div className="bg-muted text-muted-foreground grid size-full place-items-center text-sm font-semibold">
              {initials(displayName)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-heading truncate text-2xl tracking-wide uppercase sm:text-3xl">
            {displayName}
          </h1>
          <p className="text-muted-foreground text-sm">
            AURA profile · one per account
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        {/* Left: the portrait itself, or whatever state it's in. */}
        <div className="relative">
          {/* Brand-accent bloom behind the frame. Decorative only. */}
          <div
            aria-hidden="true"
            className="bg-upload-accent/20 pointer-events-none absolute -inset-2 rounded-[1.75rem] blur-2xl"
          />
          <div
            className="bg-muted/30 relative overflow-hidden rounded-2xl border"
            aria-busy={presentation.pending}
          >
            {presentation.image === "portrait" && portraitUrl ? (
              <div className="relative">
                <Image
                  key={portraitUrl}
                  src={portraitUrl}
                  alt={`AURA portrait of ${displayName}`}
                  width={1024}
                  height={1536}
                  sizes="(max-width: 1024px) 100vw, 512px"
                  className={`h-auto w-full object-cover ${presentation.pending ? "opacity-50 grayscale" : "pl-reveal"}`}
                />
                <Badge className="absolute top-3 left-3 tracking-[0.14em] uppercase">
                  Studio V1
                </Badge>
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
                {/* Viewfinder corner marks. */}
                <span
                  aria-hidden="true"
                  className="border-foreground/50 absolute bottom-3 left-3 size-4 border-b-2 border-l-2"
                />
                <span
                  aria-hidden="true"
                  className="border-foreground/50 absolute right-3 bottom-3 size-4 border-r-2 border-b-2"
                />
                {presentation.pending && (
                  <AuraPortraitLoading
                    title={presentation.title}
                    overExistingPortrait
                  />
                )}
              </div>
            ) : presentation.pending ? (
              <AuraPortraitLoading
                title={presentation.title}
                referenceUrl={referencePhotoUrl}
              />
            ) : (
              <div className="grid min-h-80 place-items-center p-6 text-center">
                <div className="grid justify-items-center gap-3">
                  <Badge variant="secondary">Profile saved</Badge>
                  <SparklesIcon className="text-primary size-10" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: what this is, and where to go next. */}
        <div className="flex flex-col gap-5 lg:pt-2">
          {portraitReady && (
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
              <span className="size-2 rounded-full bg-emerald-500" />
              Portrait ready
            </p>
          )}

          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground font-serif text-lg italic">
              {eyebrow}
            </span>
            <h2
              className={
                portraitReady
                  ? "font-heading text-3xl tracking-wide text-balance uppercase sm:text-4xl"
                  : "font-heading text-2xl tracking-wide uppercase"
              }
            >
              {heading}
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {presentation.description}
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-1">
            {portraitComplete ? (
              <Button
                nativeButton={false}
                render={<Link href="/aura/try-on" />}
                className="rounded-full sm:justify-self-start"
              >
                <ShirtIcon />
                Try on clothes
              </Button>
            ) : (
              presentation.primaryAction && (
                <Button
                  onClick={handlePrimaryAction}
                  className="rounded-full sm:justify-self-start"
                >
                  <SparklesIcon />
                  {primaryActionLabel}
                </Button>
              )
            )}

            <Button
              variant="outline"
              onClick={onEdit}
              className="rounded-full sm:justify-self-start"
            >
              <PencilIcon />
              Edit portrait
            </Button>

            {/* Tertiary, always available on a saved profile: the public colour
                analysis complements the portrait ("which garment colours suit
                you"). */}
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
        </div>
      </div>
    </div>
  );
}
