"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import {
  ACCEPTED_PHOTO_TYPES,
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
import { Button } from "@/components/ui/button";
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

// v5's upload screen is a full gridded surface rather than a card on the page.
// The hatch is drawn from --upload-grid-line, which flips ink-on-pink in light
// mode to cream-on-ink in dark, so the one style covers both themes. The result
// view (below) deliberately does not use it.
const GRID = {
  backgroundImage:
    "linear-gradient(var(--upload-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--upload-grid-line) 1px, transparent 1px)",
  backgroundSize: "42px 42px",
} as const;

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
  initialProfile = null,
  avatarUrl,
}: {
  initialName?: string;
  // A profile the user has already saved. Present ⇒ the page opens on the
  // result view rather than an empty form, which is what makes a returning
  // visitor land on their created AURA instead of the creation screen again.
  initialProfile?: {
    // Saved reference/avatar photos keyed by angle, as Cloudinary URLs. Seeds
    // the loading reference and pre-fills the upload fields when editing.
    photos: Partial<Record<PhotoAngle, string>>;
    portraitUrl: string | null;
  } | null;
  // The account avatar shown in the profile header (Clerk-hosted).
  avatarUrl?: string;
}) {
  const [isProfileSaved, setIsProfileSaved] = React.useState(
    Boolean(initialProfile),
  );
  const [portraitUrl, setPortraitUrl] = React.useState<string | undefined>(
    initialProfile?.portraitUrl ?? undefined,
  );
  // The full-body reference (already downscaled for the save) doubles as the
  // subject that forms into focus in the loading state — you watch yourself
  // resolve. Captured client-side on a fresh save; a returning visitor seeds it
  // from the persisted reference photo instead.
  const [referencePhotoUrl, setReferencePhotoUrl] = React.useState<
    string | undefined
  >(initialProfile?.photos.front ?? undefined);
  const [portraitRequest, setPortraitRequest] =
    React.useState<PortraitRequest>("idle");

  const {
    register,
    control,
    handleSubmit,
    setValue,
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
    if (photos.front) setReferencePhotoUrl(photos.front);

    toast.success("Your AURA profile is saved", {
      description: "You can now create your studio-style portrait.",
    });
  }

  // A returning visitor's saved photos are Cloudinary URLs, not Files, so
  // editing rebuilds Files from them to pre-fill the upload fields. Seeded once:
  // after the first edit the form holds whatever the visitor last picked, so a
  // second edit never clobbers an in-session change with the stale saved copy.
  // (A fresh save keeps its Files in form state already, so this is a no-op.)
  const photosSeeded = React.useRef(false);
  const [isSeedingPhotos, setIsSeedingPhotos] = React.useState(false);

  async function seedSavedPhotos() {
    if (photosSeeded.current || !initialProfile) return;
    photosSeeded.current = true;

    const saved = initialProfile.photos;
    if (!PHOTO_ANGLES.some((angle) => saved[angle])) return;

    setIsSeedingPhotos(true);
    await Promise.all(
      PHOTO_ANGLES.map(async (angle) => {
        const url = saved[angle];
        if (!url) return;
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) return;
          const blob = await response.blob();
          const type = ACCEPTED_PHOTO_TYPES.includes(blob.type)
            ? blob.type
            : "image/jpeg";
          const ext = type.split("/")[1] ?? "jpg";
          setValue(
            `photos.${angle}`,
            new File([blob], `${angle}.${ext}`, { type }),
            { shouldValidate: false, shouldDirty: false },
          );
        } catch {
          // Non-fatal: leave the slot empty for the visitor to re-upload.
        }
      }),
    );
    setIsSeedingPhotos(false);
  }

  function handleEdit() {
    setIsProfileSaved(false);
    setPortraitUrl(undefined);
    setReferencePhotoUrl(undefined);
    setPortraitRequest("idle");
    void seedSavedPhotos();
  }

  if (isProfileSaved) {
    // The result view owns its own surface — no gridded upload hatch — so the
    // two states never share a background.
    return (
      <div className="px-6 py-12 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          <AuraProfileResult
            name={name || initialName}
            avatarUrl={avatarUrl}
            portraitUrl={portraitUrl}
            referencePhotoUrl={referencePhotoUrl}
            request={portraitRequest}
            onGenerate={requestPortrait}
            onEdit={handleEdit}
          />
        </div>
      </div>
    );
  }

  // A returning visitor who taps "Edit portrait" is updating an existing
  // profile, not creating one — the heading says so.
  const isEditing = Boolean(initialProfile);

  return (
    <div className="px-6 py-16" style={GRID}>
      <div className="mx-auto w-full max-w-3xl">
        <span className="text-upload-label text-xs tracking-[0.14em] uppercase">
          Your AURA profile
        </span>
        <h1 className="font-heading mt-2 text-3xl tracking-wide text-balance uppercase sm:text-4xl">
          {isEditing ? "Update your AURA profile" : "Create your AURA profile"}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl text-sm text-pretty">
          Save your AURA display name and the two reference photos used to
          create your portrait. Optional 3D avatar photos are clearly marked and
          can be updated later.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-10 grid gap-10"
          noValidate
        >
          <AuraProgress steps={steps} />

          {isSeedingPhotos && (
            <p className="text-muted-foreground text-sm" role="status">
              Loading your saved photos…
            </p>
          )}

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
              The name shown on your AURA portrait profile. Editing it here does
              not change your Google account.
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
                Required to create your AURA portrait: a full-body front photo
                and a face close-up. Wear fitted clothing and use a plain
                background.
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
                Optional left, right, and back photos are retained for a future
                3D avatar. They are not used to create your AURA portrait.
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

            <Button
              type="submit"
              size="lg"
              disabled={!consent || isSubmitting || isSeedingPhotos}
              className="bg-upload-accent text-upload-accent-foreground hover:bg-upload-accent/90 w-full rounded-full sm:w-auto sm:justify-self-start"
            >
              <SparklesIcon />
              {isSubmitting ? "Saving…" : "Save AURA profile"}
            </Button>
          </section>
        </form>
      </div>
    </div>
  );
}
