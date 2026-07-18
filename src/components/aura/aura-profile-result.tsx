"use client";

import Image from "next/image";
import { LoaderCircleIcon, PencilIcon, SparklesIcon } from "lucide-react";

import type { AuraMode } from "@/lib/aura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The completion state after a local preview or durable profile save. Live
 * portrait generation starts only after the save has completed.
 */
export function AuraProfileResult({
  mode,
  portraitUrl,
  portraitError,
  isGenerating = false,
  onGenerate,
  onEdit,
}: {
  mode: AuraMode;
  portraitUrl?: string;
  portraitError?: string;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onEdit: () => void;
}) {
  const preview = mode === "preview";

  return (
    <div className="grid gap-5">
      <div className="bg-muted/30 overflow-hidden rounded-xl border">
        {portraitUrl ? (
          <Image
            src={portraitUrl}
            alt="Your generated AURA studio portrait"
            width={1024}
            height={1536}
            sizes="(max-width: 768px) 100vw, 640px"
            className="h-auto w-full object-cover"
          />
        ) : (
          <div className="grid min-h-80 place-items-center p-6 text-center">
            <div className="grid max-w-sm justify-items-center gap-3">
              <Badge variant="secondary">
                {preview ? "Local preview" : "Profile saved"}
              </Badge>
              {isGenerating ? (
                <LoaderCircleIcon className="text-primary size-10 animate-spin" />
              ) : (
                <SparklesIcon className="text-primary size-10" />
              )}
              <div className="grid gap-1">
                <h2 className="text-lg font-medium">
                  {preview
                    ? "AURA portrait preview"
                    : isGenerating
                      ? "Creating your AURA portrait"
                      : portraitError
                        ? "Your profile is saved"
                        : "Your AURA profile is saved"}
                </h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  {preview
                    ? "Portraits are not generated in local preview. Your photos and form data stayed in this browser."
                    : isGenerating
                      ? "Using your saved full-body and face references to create a studio-style portrait."
                      : (portraitError ??
                        "Your reference photos and profile details are saved. Portrait generation can begin now.")}
                </p>
              </div>
              {!preview && onGenerate && (
                <Button onClick={onGenerate} disabled={isGenerating}>
                  <SparklesIcon />
                  {portraitError ? "Try generating again" : "Generate portrait"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {portraitUrl && (
        <p className="text-muted-foreground text-sm text-pretty">
          Your AURA portrait was created from your saved full-body and face
          reference photos.
        </p>
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
