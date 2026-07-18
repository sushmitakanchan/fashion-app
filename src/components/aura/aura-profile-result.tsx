"use client";

import { PencilIcon, SparklesIcon } from "lucide-react";

import type { AuraMode } from "@/lib/aura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The completion state after a local preview or durable profile save. It never
 * invents a portrait: image generation is a separate operation that can begin
 * only after the save has completed.
 */
export function AuraProfileResult({
  mode,
  onEdit,
}: {
  mode: AuraMode;
  onEdit: () => void;
}) {
  const preview = mode === "preview";

  return (
    <div className="grid gap-5">
      <div className="bg-muted/30 grid min-h-80 place-items-center rounded-xl border p-6 text-center">
        <div className="grid max-w-sm justify-items-center gap-3">
          <Badge variant="secondary">
            {preview ? "Local preview" : "Profile saved"}
          </Badge>
          <SparklesIcon className="text-primary size-10" />
          <div className="grid gap-1">
            <h2 className="text-lg font-medium">
              {preview ? "AURA portrait preview" : "Your AURA profile is saved"}
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {preview
                ? "Portraits are not generated in local preview. Your photos and form data stayed in this browser."
                : "Your reference photos and profile details are saved. Portrait generation can begin only after this save succeeds."}
            </p>
          </div>
        </div>
      </div>

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
