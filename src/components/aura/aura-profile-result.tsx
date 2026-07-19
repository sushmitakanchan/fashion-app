"use client";

import Image from "next/image";
import { LoaderCircleIcon, PencilIcon, SparklesIcon } from "lucide-react";

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
        : portraitUrl
          ? "Create a new AURA portrait"
          : "Create my AURA portrait";

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
            {presentation.pending && (
              <div
                role="status"
                aria-live="polite"
                className="bg-background/80 absolute inset-0 grid place-items-center p-6 text-center backdrop-blur-sm"
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

      {presentation.image === "portrait" && presentation.primaryAction && (
        <Button onClick={handlePrimaryAction} className="sm:justify-self-start">
          <SparklesIcon />
          {primaryActionLabel}
        </Button>
      )}

      <Button
        variant="outline"
        onClick={onEdit}
        className="sm:justify-self-start"
      >
        <PencilIcon />
        Edit profile
      </Button>
    </div>
  );
}
