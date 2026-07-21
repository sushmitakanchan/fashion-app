"use client";

import * as React from "react";
import { ImagePlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ACCEPTED_PHOTO_TYPES } from "@/lib/validations";
import { Label } from "@/components/ui/label";

export function PhotoUploadField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  value: File | undefined;
  onChange: (file: File | undefined) => void;
  error?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  /**
   * Bind the preview URL to the <img> node's own lifetime (a React 19 ref
   * cleanup), rather than creating it in render and revoking it in an effect.
   *
   * Those two lifecycles don't line up: on remount StrictMode runs effects
   * mount → cleanup → mount, so the cleanup revokes the URL while a
   * render-time `useMemo` won't re-run to replace it — leaving the <img>
   * pointed at a dead blob. Creating it here means every re-attach mints a
   * fresh URL and every detach revokes exactly the one it made, so nothing
   * dangles and nothing leaks.
   */
  const showPreview = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (!node || !value) return;
      const url = URL.createObjectURL(value);
      node.src = url;
      // Object URLs pin the whole file in memory until revoked.
      return () => URL.revokeObjectURL(url);
    },
    [value],
  );

  const errorId = `${id}-error`;

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {value && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            onClick={() => {
              onChange(undefined);
              // Without this, re-picking the same file fires no change event.
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        className="sr-only"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex aspect-3/4 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-card transition-colors outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/70",
          error
            ? "border-destructive"
            : "border-upload-accent hover:border-upload-accent/70 focus-visible:border-upload-accent",
        )}
      >
        {value ? (
          // `src` is set by the ref above. A local object URL, never optimised
          // or remote-fetched — next/image has nothing to add here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={showPreview}
            alt={`${label} preview`}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground flex flex-col items-center gap-1.5 px-2 text-center">
            <ImagePlusIcon className="size-5" />
            <span className="font-mono text-xs leading-snug text-pretty">
              {hint}
            </span>
          </span>
        )}
      </button>

      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
