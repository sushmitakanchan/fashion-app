"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import {
  auraFormSchema,
  AURA_REFERENCE_PHOTO_ANGLES,
  AVATAR_PHOTO_ANGLES,
  BODY_TYPES,
  GENDERS,
  PHOTO_ANGLES,
  PHOTO_MAX_EDGE,
  type AuraFormInput,
  type Gender,
  type PhotoAngle,
} from "@/lib/validations";
import {
  cmToFtIn,
  downscalePhoto,
  ftInToCm,
  kgToLb,
  lbToKg,
} from "@/lib/aura";
import type { PortraitRequest } from "@/lib/aura-portrait-state";
import { cn } from "@/lib/utils";
import {
  BODY_TYPE_LABELS,
  BodyTypeFigure,
} from "@/components/aura/body-type-figure";
import { AuraProfileResult } from "@/components/aura/aura-profile-result";
import { PhotoUploadField } from "@/components/aura/photo-upload-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  UNDISCLOSED: "Prefer not to say",
};

const PHOTO_LABELS: Record<PhotoAngle, { label: string; hint: string }> = {
  front: { label: "Full body", hint: "Facing the camera" },
  left: { label: "Left", hint: "Full body, left side on" },
  right: { label: "Right", hint: "Full body, right side on" },
  closeup: { label: "Face close-up", hint: "Head and shoulders, facing forward" },
  back: { label: "Back", hint: "Full body, facing away" },
};

type UnitSystem = "metric" | "imperial";

/** Imperial inputs are display-only; `heightCm`/`weightKg` stay canonical. */
type ImperialDraft = { feet: string; inches: string; pounds: string };
type PortraitResponse = {
  portraitUrl?: string;
  code?: string;
  error?: string;
  retryable?: boolean;
};

const EMPTY_IMPERIAL: ImperialDraft = { feet: "", inches: "", pounds: "" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

export function AuraForm() {
  const [unitSystem, setUnitSystem] = React.useState<UnitSystem>("metric");
  const [imperial, setImperial] = React.useState<ImperialDraft>(EMPTY_IMPERIAL);
  const [isProfileSaved, setIsProfileSaved] = React.useState(false);
  const [portraitUrl, setPortraitUrl] = React.useState<string>();
  const [portraitRequest, setPortraitRequest] =
    React.useState<PortraitRequest>("idle");

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<AuraFormInput>({
    resolver: zodResolver(auraFormSchema),
    defaultValues: { name: "", consent: false },
  });

  // `useWatch` rather than `watch()`: it scopes the re-render to this one field
  // instead of the whole form, and it doesn't opt the component out of React
  // Compiler memoization the way `watch()` does.
  const consent = useWatch({ control, name: "consent" });

  // Mirror React Hook Form's own behaviour: don't surface errors on a field the
  // user hasn't finished with, but do keep them live once they've submitted.
  const revalidate = { shouldValidate: isSubmitted };

  function toggleUnits(next: UnitSystem) {
    if (next === unitSystem) return;

    if (next === "imperial") {
      // Seed the imperial inputs from whatever metric values exist so switching
      // back and forth doesn't wipe what the user typed.
      const cm = getValues("heightCm");
      const kg = getValues("weightKg");
      const height = Number.isFinite(cm) ? cmToFtIn(cm) : undefined;
      setImperial({
        feet: height ? String(height.feet) : "",
        inches: height ? String(height.inches) : "",
        pounds: Number.isFinite(kg) ? String(kgToLb(kg)) : "",
      });
    }

    setUnitSystem(next);
  }

  function updateImperialHeight(next: Pick<ImperialDraft, "feet" | "inches">) {
    setImperial((draft) => ({ ...draft, ...next }));

    const feet = Number(next.feet);
    // Inches are optional — 6 ft on its own should be a valid height.
    const inches = next.inches === "" ? 0 : Number(next.inches);
    const valid =
      next.feet !== "" && Number.isFinite(feet) && Number.isFinite(inches);

    setValue("heightCm", valid ? ftInToCm(feet, inches) : NaN, revalidate);
  }

  function updateImperialWeight(pounds: string) {
    setImperial((draft) => ({ ...draft, pounds }));

    const lb = Number(pounds);
    const valid = pounds !== "" && Number.isFinite(lb);

    setValue("weightKg", valid ? lbToKg(lb) : NaN, revalidate);
  }

  async function requestPortrait() {
    setPortraitRequest("generating");

    try {
      const response = await fetch("/api/aura/portrait", { method: "POST" });
      const body = (await response.json().catch(() => null)) as PortraitResponse | null;
      if (!response.ok || !body?.portraitUrl) {
        const error = body?.error ?? "We couldn't create your portrait. Please try again.";
        setPortraitRequest(
          body?.code === "portrait-refused"
            ? "refused"
            : body?.retryable === false
              ? "unavailable"
              : "retryable-failure",
        );
        toast.error("AURA portrait generation failed", { description: error });
        return;
      }

      setPortraitUrl(body.portraitUrl);
      setPortraitRequest("idle");
      toast.success("Your AURA portrait is ready");
    } catch {
      const error = "Check your connection and try again.";
      setPortraitRequest("retryable-failure");
      toast.error("Couldn't reach the server", { description: error });
    }
  }

  async function onSubmit(values: AuraFormInput) {
    let photos: Partial<Record<PhotoAngle, string>>;
    try {
      const photoFiles = PHOTO_ANGLES.flatMap((angle) => {
        const photo = values.photos[angle];
        return photo ? [{ angle, photo }] : [];
      });
      const encoded = await Promise.all(
        photoFiles.map(({ photo }) => downscalePhoto(photo, PHOTO_MAX_EDGE)),
      );
      photos = Object.fromEntries(
        photoFiles.map(({ angle }, i) => [angle, encoded[i]]),
      ) as Partial<Record<PhotoAngle, string>>;
    } catch {
      toast.error("We couldn't read one of your photos", {
        description: "Try re-taking or re-exporting it, then upload again.",
      });
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/aura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, photos }),
      });
    } catch {
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(
        response.status === 401
          ? "Sign in to save your AURA profile"
          : "Couldn't save your AURA",
        {
          description:
            response.status === 401
              ? "Your profile is tied to your account."
              : (body?.error ?? "Something went wrong. Please try again."),
        },
      );
      return;
    }

    setIsProfileSaved(true);

    toast.success("Your AURA profile is saved", {
      description: "You can now create your studio-style portrait.",
    });
  }

  if (isProfileSaved) {
    return (
      <AuraProfileResult
        portraitUrl={portraitUrl}
        request={portraitRequest}
        onGenerate={requestPortrait}
        onEdit={() => {
          setIsProfileSaved(false);
          setPortraitUrl(undefined);
          setPortraitRequest("idle");
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8" noValidate>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Ada Lovelace"
            autoComplete="name"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            type="number"
            inputMode="numeric"
            placeholder="28"
            aria-invalid={!!errors.age}
            {...register("age", { valueAsNumber: true })}
          />
          <FieldError message={errors.age?.message} />
        </div>
      </section>

      <section className="grid gap-3">
        <Label>Gender</Label>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? null}
              onValueChange={field.onChange}
              aria-invalid={!!errors.gender}
              className="grid gap-2 sm:grid-cols-3"
            >
              {GENDERS.map((gender) => (
                <Label
                  key={gender}
                  className="hover:bg-accent/50 has-data-checked:border-primary has-data-checked:bg-primary/5 flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 font-normal transition-colors"
                >
                  <RadioGroupItem value={gender} />
                  {GENDER_LABELS[gender]}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError message={errors.gender?.message} />
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Height &amp; weight</Label>
          <div
            role="group"
            aria-label="Units"
            className="bg-muted inline-flex rounded-lg p-0.5"
          >
            {(["metric", "imperial"] as const).map((system) => (
              <button
                key={system}
                type="button"
                aria-pressed={unitSystem === system}
                onClick={() => toggleUnits(system)}
                className={cn(
                  "rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors",
                  unitSystem === system
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {system === "metric" ? "cm / kg" : "ft / lb"}
              </button>
            ))}
          </div>
        </div>

        {unitSystem === "metric" ? (
          // Keyed so switching units remounts the inputs. Without it React
          // reconciles the metric and imperial weight fields into one instance
          // and the DOM node flips from uncontrolled (`register`) to controlled.
          <div key="metric" className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="heightCm" className="text-muted-foreground text-xs">
                Height (cm)
              </Label>
              <Input
                id="heightCm"
                type="number"
                inputMode="decimal"
                placeholder="170"
                aria-invalid={!!errors.heightCm}
                {...register("heightCm", { valueAsNumber: true })}
              />
              <FieldError message={errors.heightCm?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weightKg" className="text-muted-foreground text-xs">
                Weight (kg)
              </Label>
              <Input
                id="weightKg"
                type="number"
                inputMode="decimal"
                placeholder="65"
                aria-invalid={!!errors.weightKg}
                {...register("weightKg", { valueAsNumber: true })}
              />
              <FieldError message={errors.weightKg?.message} />
            </div>
          </div>
        ) : (
          <div key="imperial" className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="heightFt" className="text-muted-foreground text-xs">
                Height (ft / in)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="heightFt"
                  type="number"
                  inputMode="numeric"
                  placeholder="5"
                  aria-label="Height in feet"
                  aria-invalid={!!errors.heightCm}
                  value={imperial.feet}
                  onChange={(e) =>
                    updateImperialHeight({
                      feet: e.target.value,
                      inches: imperial.inches,
                    })
                  }
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="7"
                  aria-label="Height in inches"
                  aria-invalid={!!errors.heightCm}
                  value={imperial.inches}
                  onChange={(e) =>
                    updateImperialHeight({
                      feet: imperial.feet,
                      inches: e.target.value,
                    })
                  }
                />
              </div>
              <FieldError message={errors.heightCm?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weightLb" className="text-muted-foreground text-xs">
                Weight (lb)
              </Label>
              <Input
                id="weightLb"
                type="number"
                inputMode="decimal"
                placeholder="145"
                aria-invalid={!!errors.weightKg}
                value={imperial.pounds}
                onChange={(e) => updateImperialWeight(e.target.value)}
              />
              <FieldError message={errors.weightKg?.message} />
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <Label>Body type</Label>
          <p className="text-muted-foreground text-sm">
            Pick the silhouette closest to yours — it only needs to be a rough
            match.
          </p>
        </div>
        <Controller
          control={control}
          name="bodyType"
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? null}
              onValueChange={field.onChange}
              aria-invalid={!!errors.bodyType}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
            >
              {BODY_TYPES.map((bodyType) => (
                // The card *is* the radio (Base UI's `render` prop), so the whole
                // tile is the hit target and `data-checked` lands directly on it.
                <RadioPrimitive.Root
                  key={bodyType}
                  value={bodyType}
                  className={cn(
                    "group flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors outline-none",
                    "hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
                    "data-checked:border-primary data-checked:bg-primary/5",
                  )}
                >
                  <BodyTypeFigure
                    bodyType={bodyType}
                    className="text-muted-foreground group-data-checked:text-primary transition-colors"
                  />
                  <span className="text-sm leading-none font-medium">
                    {BODY_TYPE_LABELS[bodyType].label}
                  </span>
                  <span className="text-muted-foreground text-xs text-pretty">
                    {BODY_TYPE_LABELS[bodyType].description}
                  </span>
                </RadioPrimitive.Root>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError message={errors.bodyType?.message} />
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <Label>AURA reference photos</Label>
          <p className="text-muted-foreground text-sm">
            Required to create your AURA portrait: a full-body front photo and a
            face close-up. Wear fitted clothing and use a plain background.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {AURA_REFERENCE_PHOTO_ANGLES.map((angle) => (
            <Controller
              key={angle}
              control={control}
              name={`photos.${angle}`}
              render={({ field }) => (
                <PhotoUploadField
                  id={`photo-${angle}`}
                  label={PHOTO_LABELS[angle].label}
                  hint={PHOTO_LABELS[angle].hint}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.photos?.[angle]?.message}
                />
              )}
            />
          ))}
        </div>
        {/* `photos` itself errors when the object is missing entirely. */}
        <FieldError message={errors.photos?.root?.message} />
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Label>3D avatar reference photos</Label>
            <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Optional left, right, and back photos are retained for a future 3D
            avatar. They are not used to create your AURA portrait.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {AVATAR_PHOTO_ANGLES.map((angle) => (
            <Controller
              key={angle}
              control={control}
              name={`photos.${angle}`}
              render={({ field }) => (
                <PhotoUploadField
                  id={`photo-${angle}`}
                  label={PHOTO_LABELS[angle].label}
                  hint={PHOTO_LABELS[angle].hint}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.photos?.[angle]?.message}
                />
              )}
            />
          ))}
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="consent"
            render={({ field }) => (
              <Checkbox
                id="consent"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-invalid={!!errors.consent}
                className="mt-0.5"
              />
            )}
          />
          <Label
            htmlFor="consent"
            className="text-sm leading-snug font-normal text-pretty"
          >
            I agree to OpenAI, our third-party AI provider, processing my
            photos to generate my AURA portrait.
          </Label>
        </div>
        <FieldError message={errors.consent?.message} />

        <Button
          type="submit"
          size="lg"
          disabled={!consent || isSubmitting}
          className="w-full sm:w-auto sm:justify-self-start"
        >
          <SparklesIcon />
          {isSubmitting ? "Saving…" : "Save AURA profile"}
        </Button>
      </section>
    </form>
  );
}
