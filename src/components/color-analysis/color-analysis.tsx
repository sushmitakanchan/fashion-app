"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { PencilIcon } from "lucide-react";

import {
  analyzeSkinTone,
  PRESET_SKIN_TONES,
  rgbToHex,
  type Palette,
  type RGB,
} from "@/lib/color-science";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Pick black or white text that stays legible on a given background. */
function readableInk({ r, g, b }: RGB): string {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

function SwatchRow({ palette }: { palette: Palette }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-semibold">{palette.title}</h4>
      </div>
      <p className="text-muted-foreground text-xs text-pretty">{palette.rationale}</p>
      <div className="flex flex-wrap gap-3 pt-1">
        {palette.colors.map((c, i) => (
          <div key={`${palette.key}-${i}`} className="w-20 space-y-1">
            <div
              className="h-16 w-full rounded-md border shadow-sm"
              style={{ backgroundColor: c.hex }}
              aria-hidden
            />
            <p className="text-[11px] leading-tight font-medium">{c.name}</p>
            <p className="text-muted-foreground text-[10px] tabular-nums uppercase">{c.hex}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColorAnalysis() {
  const [rgb, setRgb] = useState<RGB | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const analysis = useMemo(() => (rgb ? analyzeSkinTone(rgb) : null), [rgb]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgSrc(URL.createObjectURL(file));
  }, []);

  const drawToCanvas = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
  }, []);

  // Eyedropper: average an 11x11 patch around the click so a single noisy pixel
  // does not throw off the reading.
  const sampleAt = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!img || !canvas || !ctx) return;

    const rect = img.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = Math.round((e.clientX - rect.left) * scaleX);
    const cy = Math.round((e.clientY - rect.top) * scaleY);

    const radius = 5;
    const x0 = Math.max(0, cx - radius);
    const y0 = Math.max(0, cy - radius);
    const w = Math.min(canvas.width - x0, radius * 2 + 1);
    const h = Math.min(canvas.height - y0, radius * 2 + 1);
    if (w <= 0 || h <= 0) return;

    const { data } = ctx.getImageData(x0, y0, w, h);
    let r = 0;
    let g = 0;
    let b = 0;
    const px = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    setRgb({ r: r / px, g: g / px, b: b / px });
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr]">
      {/* Input column */}
      <div className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">1. Give us your skin tone</h3>

          {!imgSrc ? (
            <label className="border-input hover:bg-accent flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors">
              <span className="text-sm font-medium">Upload a photo</span>
              <span className="text-muted-foreground text-xs">
                then tap your cheek to sample
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onFile}
              />
            </label>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, client-side canvas sampling; next/image can't expose pixels */}
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Your uploaded photo — tap to sample skin tone"
                  onLoad={drawToCanvas}
                  onClick={sampleAt}
                  className="max-h-64 w-full cursor-crosshair rounded-md border object-contain"
                />
                <label
                  className="bg-background/80 hover:bg-accent absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors"
                  title="Choose a different photo"
                >
                  <PencilIcon className="size-4" />
                  <span className="sr-only">Choose a different photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={onFile}
                  />
                </label>
              </div>
              <p className="text-muted-foreground text-xs">Tap your skin to sample it.</p>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">Or start from a preset:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_SKIN_TONES.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setImgSrc(null);
                    setRgb(preset.rgb);
                  }}
                  className="border-input hover:ring-ring flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs transition-shadow hover:ring-2"
                >
                  <span
                    className="h-5 w-5 rounded-full border"
                    style={{ backgroundColor: rgbToHex(preset.rgb) }}
                  />
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {analysis && (
          <div className="space-y-3">
            <Separator />
            <h3 className="text-sm font-semibold">Detected skin tone</h3>
            <div
              className="flex items-end justify-between rounded-lg p-4"
              style={{ backgroundColor: analysis.skin.hex, color: readableInk(analysis.skin.rgb) }}
            >
              <span className="text-sm font-medium">{analysis.season}</span>
              <span className="text-xs tabular-nums uppercase opacity-80">{analysis.skin.hex}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="capitalize">
                {analysis.undertone} undertone
              </Badge>
              <Badge variant="outline" className="capitalize">
                {analysis.depth} depth
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Results column */}
      <div>
        {!analysis ? (
          <div className="text-muted-foreground flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm">
            Pick a preset or sample a photo to see your recommended garment colours.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">2. Colours that flatter you</h3>
              <p className="text-muted-foreground text-sm text-pretty">
                Derived deterministically from your skin&rsquo;s position on the colour
                wheel — no two of these palettes clash with your complexion.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              {analysis.recommendations.map((palette) => (
                <SwatchRow key={palette.key} palette={palette} />
              ))}
            </div>

            <Separator />
            <SwatchRow palette={analysis.neutrals} />

            <Separator />
            <div className={cn("rounded-lg border border-dashed p-4")}>
              <SwatchRow palette={analysis.avoid} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
