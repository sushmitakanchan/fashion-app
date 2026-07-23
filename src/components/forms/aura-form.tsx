"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import {
  auraFormSchema,
  AURA_REFERENCE_PHOTO_ANGLES,
  AVATAR_PHOTO_ANGLES,
  PHOTO_ANGLES,
  PHOTO_MAX_EDGE,
  type AuraFormInput,
  type PhotoAngle,
} from "@/lib/validations";
import { downscalePhoto } from "@/lib/aura";
import { deriveAuraSteps } from "@/lib/aura-form-progress";
import type { PortraitRequest } from "@/lib/aura-portrait-state";
import { AuraProfileResult } from "@/components/aura/aura-profile-result";
import { AuraProgress } from "@/components/aura/aura-progress";
import { PhotoUploadField } from "@/components/aura/photo-upload-field";
import { CtaButton } from "@/components/ui/cta-button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const PHOTO_LABELS: Record<PhotoAngle, { label: string; hint: string }> = {
  front: { label: "Full body", hint: "Facing the camera" },
  left: { label: "Left", hint: "Full body, left side on" },
  right: { label: "Right", hint: "Full body, right side on" },
  closeup: { label: "Face close-up", hint: "Head and shoulders, facing forward" },
  back: { label: "Back", hint: "Full body, facing away" },
};

type PortraitResponse = {
  portraitUrl?: string;
  code?: string;
  error?: string;
  retryable?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

export function AuraForm({
  initialName = "",
}: {
  initialName?: string;
}) {
  const [isProfileSaved, setIsProfileSaved] = React.useState(false);
  const [portraitUrl, setPortraitUrl] = React.useState<string>();
  const [portraitRequest, setPortraitRequest] =
    React.useState<PortraitRequest>("idle");

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuraFormInput>({
    resolver: zodResolver(auraFormSchema),
    defaultValues: { name: initialName, consent: false },
  });

  // `useWatch` rather than `watch()`: it scopes the re-render to these fields
  // instead of the whole form, and it doesn't opt the component out of React
  // Compiler memoization the way `watch()` does.
  const consent = useWatch({ control, name: "consent" });
  const name = useWatch({ control, name: "name" });
  const front = useWatch({ control, name: "photos.front" });
  const closeup = useWatch({ control, name: "photos.closeup" });

  // Presentation only — the authoritative gate stays the Zod resolver on
  // submit. This just drives the completion markers.
  const steps = deriveAuraSteps({
    name,
    hasFront: Boolean(front),
    hasCloseup: Boolean(closeup),
  });

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
    // Kept in its own card so the reskin's gridded upload panel doesn't bleed
    // into the result view — this branch is unchanged from before.
    return (
      <Card className="mt-8">
        <CardContent>
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
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-10 grid gap-10"
      noValidate
    >
      <AuraProgress steps={steps} />

      <section className="grid gap-2">
        <span className="text-upload-label text-[11px] tracking-[0.14em] uppercase">
          Step one
        </span>
        <h2 className="font-heading text-2xl tracking-wide uppercase">
          Display name
        </h2>
        <Label htmlFor="name" className="sr-only">
          AURA display name
        </Label>
        <Input
          id="name"
          placeholder="Ada Lovelace"
          autoComplete="name"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        <p className="text-muted-foreground text-sm">
          The name shown on your AURA portrait profile. Editing it here does not
          change your Google account.
        </p>
        <FieldError message={errors.name?.message} />
      </section>

      <section className="grid gap-4">
        <div className="grid gap-1">
          <span className="text-upload-label text-[11px] tracking-[0.14em] uppercase">
            Step two
          </span>
          <h2 className="font-heading text-2xl tracking-wide uppercase">
            Reference photos
          </h2>
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

      <section className="grid gap-4">
        <div className="grid gap-1">
          <span className="text-upload-label text-[11px] tracking-[0.14em] uppercase">
            Step three
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-2xl tracking-wide uppercase">
              3D avatar photos
            </h2>
            <span className="text-upload-label border-upload-accent rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
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
                className="mt-0.5 data-checked:bg-upload-accent data-checked:border-upload-accent data-checked:text-upload-accent-foreground"
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

        <CtaButton
          type="submit"
          disabled={!consent || isSubmitting}
          className="w-full sm:w-auto sm:justify-self-start"
        >
          <SparklesIcon />
          {isSubmitting ? "Saving…" : "Save AURA profile"}
        </CtaButton>
      </section>
    </form>
  );
}
