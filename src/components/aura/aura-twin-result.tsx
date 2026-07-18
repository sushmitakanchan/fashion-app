"use client";

import { PencilIcon } from "lucide-react";

import { cmToFtIn, kgToLb, type AuraMode, type BodyMeasurements } from "@/lib/aura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuraTwin } from "./aura-twin";
import { BODY_TYPE_LABELS } from "./body-type-figure";

export function AuraTwinResult({
  measurements,
  mode = "live",
  onEdit,
}: {
  measurements: BodyMeasurements;
  mode?: AuraMode;
  onEdit: () => void;
}) {
  const { feet, inches } = cmToFtIn(measurements.heightCm);
  const preview = mode === "preview";

  return (
    <div className="grid gap-5">
      <div className="bg-muted/30 relative overflow-hidden rounded-xl border">
        {preview && (
          <Badge
            variant="secondary"
            className="absolute top-3 left-3 z-10 backdrop-blur"
          >
            Local preview
          </Badge>
        )}
        <AuraTwin measurements={measurements} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {measurements.heightCm} cm · {feet}′{inches}″
        </Badge>
        <Badge variant="secondary">
          {measurements.weightKg} kg · {kgToLb(measurements.weightKg)} lb
        </Badge>
        <Badge variant="secondary">
          {BODY_TYPE_LABELS[measurements.bodyType].label}
        </Badge>
      </div>

      <p className="text-muted-foreground text-sm text-pretty">
        Drag to rotate. Your twin is built from the measurements you entered, so
        its proportions are yours — it isn&apos;t a likeness of your photos.{" "}
        {preview
          ? "This is a local preview: your photos never left your browser and nothing was saved."
          : "Your photos are saved to your profile as reference."}
      </p>

      <Button
        variant="outline"
        onClick={onEdit}
        className="sm:justify-self-start"
      >
        <PencilIcon />
        Edit details
      </Button>
    </div>
  );
}
