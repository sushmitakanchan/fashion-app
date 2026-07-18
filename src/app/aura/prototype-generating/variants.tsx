"use client";

/**
 * PROTOTYPE ONLY — throwaway. Answers issue #23: what should the AURA portrait
 * generating-state anticipation animation look and feel like?
 *
 * Three radically different takes, all obeying the rules fixed by #20:
 * indeterminate, no determinate bar, holds indefinitely, sustains 30s–2min,
 * works overlaid on a dimmed previous portrait, honest copy, both themes,
 * respects prefers-reduced-motion. No new dependencies — CSS keyframes only.
 */

import * as React from "react";

/** Honest copy, fixed by #20. Shared because it isn't the thing being varied. */
const HEADLINE = "Generating your portrait…";
const SUBLINE = "This usually takes under a minute. Keep this tab open.";

export type VariantProps = {
  /** True when regenerating after an edit: previous portrait sits underneath. */
  regenerating: boolean;
};

/**
 * A standing full-body figure in the pose the brief fixes (#20): square to
 * camera, arms relaxed with a visible gap from the torso, feet shoulder-width.
 * Drawn rather than an asset, so it works offline.
 */

/**
 * Half the body, centre-line at x=100: skull, jaw, neck, trapezius, deltoid,
 * ribcage, waist, hip, thigh, knee, calf, ankle, foot — then back up the inner
 * leg to the crotch. Rendered twice, the second mirrored, so it stays
 * symmetrical without hand-maintaining two sets of coordinates.
 */
const BODY_HALF =
  "M100,16 C112,16 120,26 120,42 C120,54 116,61 111,65 L109,73 " +
  "C122,77 133,83 138,93 C142,101 143,110 142,120 L136,122 " +
  "C133,135 130,144 128,155 C132,166 135,177 136,190 " +
  "L133,220 C131,238 129,252 128,266 L126,284 " +
  "C125,296 124,308 123,318 L128,328 L106,328 L105,318 " +
  "C104,304 103,290 102,276 L101,238 L100,186 Z";

/** The arm, hanging with a visible gap from the torso. Mirrored likewise. */
const ARM_HALF =
  "M139,96 C147,106 151,120 152,136 L156,178 " +
  "C158,196 160,210 161,222 C162,231 159,238 153,239 " +
  "C147,240 143,235 142,227 L138,206 L133,164 " +
  "C131,144 130,120 130,104 Z";

/**
 * A standing full-body figure in the pose the brief fixes (#20): square to
 * camera, arms relaxed with a visible gap from the torso, feet shoulder-width.
 * Drawn rather than an asset, so it works offline.
 */
function Figure(props: React.SVGProps<SVGGElement>) {
  return (
    <g {...props}>
      <path d={BODY_HALF} />
      <path d={BODY_HALF} transform="translate(200,0) scale(-1,1)" />
      <path d={ARM_HALF} />
      <path d={ARM_HALF} transform="translate(200,0) scale(-1,1)" />
    </g>
  );
}

/** Horizontal contour rings + vertical seams, clipped to the body. */
function Mesh(props: React.SVGProps<SVGGElement>) {
  const rings = Array.from({ length: 52 }, (_, i) => 16 + i * 6);
  const seams = Array.from({ length: 11 }, (_, i) => 50 + i * 10);
  return (
    <g {...props}>
      {rings.map((y) => (
        <line key={`r${y}`} x1="30" x2="170" y1={y} y2={y} />
      ))}
      {seams.map((x) => (
        <line key={`s${x}`} x1={x} x2={x} y1="10" y2="340" opacity="0.45" />
      ))}
    </g>
  );
}

/** Stand-in for the user's previous portrait. */
function PreviousPortrait() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-neutral-200 dark:bg-neutral-800">
      <svg viewBox="0 0 200 350" className="h-full w-full" aria-hidden="true">
        <rect width="200" height="350" className="fill-neutral-300 dark:fill-neutral-700" />
        <ellipse cx="100" cy="332" rx="46" ry="7" className="fill-neutral-400/70" />
        <Figure className="fill-neutral-900" />
      </svg>
    </div>
  );
}

/** The dimmed/desaturated held-under layer, per #20's regeneration state. */
function RegenBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 scale-105 opacity-30 grayscale blur-[2px]">
        <PreviousPortrait />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Shell({
  regenerating,
  children,
}: VariantProps & { children: React.ReactNode }) {
  const body = (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-8 py-14"
    >
      {children}
    </div>
  );
  return regenerating ? <RegenBackdrop>{body}</RegenBackdrop> : body;
}

/* ------------------------------------------------------------------ */
/* A — Darkroom: the empty frame is the hero                           */
/* ------------------------------------------------------------------ */

export function VariantA({ regenerating }: VariantProps) {
  return (
    <Shell regenerating={regenerating}>
      {/* Portrait-aspect frame, the literal shape of what's coming. Grain
          drifts, a silhouette surfaces and dissolves — a print developing. */}
      <div className="border-border/60 bg-muted/40 relative aspect-[2/3] w-56 overflow-hidden rounded-lg border shadow-inner">
        <div className="proto-grain absolute inset-0 opacity-70 motion-reduce:animate-none" />
        <svg
          viewBox="0 0 200 350"
          aria-hidden="true"
          className="proto-develop absolute inset-0 h-full w-full motion-reduce:animate-none motion-reduce:opacity-25"
        >
          <Figure className="fill-foreground" />
        </svg>
        <div className="proto-sweep absolute inset-x-0 h-24 motion-reduce:hidden" />
      </div>

      <div className="grid gap-2 text-center">
        <p className="text-lg font-medium">{HEADLINE}</p>
        <p className="text-muted-foreground text-sm">{SUBLINE}</p>
      </div>
    </Shell>
  );
}
VariantA.displayName = "Darkroom develop";

/* ------------------------------------------------------------------ */
/* B — Call sheet: the studio set assembles itself, backstage feel      */
/* ------------------------------------------------------------------ */

const CREW = [
  "Lighting the cyclorama",
  "Setting the key and fill",
  "Dressing the wardrobe",
  "Finding your pose",
  "Taking the shot",
];

export function VariantB({ regenerating }: VariantProps) {
  // Cycles forever; the last line holds and breathes rather than completing.
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, CREW.length - 1)),
      6000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <Shell regenerating={regenerating}>
      <div className="flex w-full max-w-xl flex-col items-center gap-10 px-4 sm:flex-row sm:items-center">
        {/* Left: a line-drawn studio set, lights coming up. */}
        <svg
          viewBox="0 0 160 160"
          aria-hidden="true"
          className="text-muted-foreground/70 size-40 shrink-0"
        >
          <path
            d="M20 120 Q20 40 80 40 Q140 40 140 120 Z"
            className="fill-muted/50 stroke-current"
            strokeWidth="1.5"
          />
          <ellipse
            cx="80"
            cy="122"
            rx="34"
            ry="6"
            className="proto-breathe fill-current opacity-20 motion-reduce:animate-none"
          />
          <g className="proto-key motion-reduce:animate-none">
            <circle cx="30" cy="34" r="7" className="fill-current" />
            <path d="M36 38 L70 76" className="stroke-current" strokeWidth="1.5" />
          </g>
          <g className="proto-fill motion-reduce:animate-none">
            <circle cx="130" cy="44" r="5" className="fill-current" />
            <path d="M125 48 L92 78" className="stroke-current" strokeWidth="1.5" />
          </g>
        </svg>

        {/* Right: the crew list. Information-dense, deliberately un-centred. */}
        <div className="w-full">
          <p className="mb-4 text-lg font-medium">{HEADLINE}</p>
          <ul className="grid gap-2.5">
            {CREW.map((line, i) => (
              <li
                key={line}
                className={
                  "flex items-center gap-3 text-sm transition-opacity duration-700 " +
                  (i <= step ? "opacity-100" : "opacity-25")
                }
              >
                <span
                  className={
                    "size-1.5 shrink-0 rounded-full " +
                    (i === step
                      ? "bg-primary proto-breathe motion-reduce:animate-none"
                      : i < step
                        ? "bg-muted-foreground/50"
                        : "bg-muted-foreground/20")
                  }
                />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-5 text-sm">{SUBLINE}</p>
        </div>
      </div>
    </Shell>
  );
}
VariantB.displayName = "Studio call sheet";

/* ------------------------------------------------------------------ */
/* C — Portrait signal: type-led, quiet, with a head-only scan         */
/* ------------------------------------------------------------------ */

export function VariantC({ regenerating }: VariantProps) {
  return (
    <Shell regenerating={regenerating}>
      <div className="grid w-full justify-items-center gap-7 py-8 text-center">
        {/* A small, abstract head study borrows the reference's single moving
            scan without turning the whole result screen into a sci-fi scene. */}
        <div className="bg-muted/40 border-border/70 relative grid size-36 place-items-center overflow-hidden rounded-full border shadow-inner">
          <div className="proto-grain pointer-events-none absolute inset-0 opacity-35 motion-reduce:animate-none" />
          <svg
            viewBox="0 0 160 160"
            aria-hidden="true"
            className="text-foreground/75 relative size-[7.75rem]"
          >
            <defs>
              <clipPath id="proto-head-study">
                <path d="M80 25C57 25 44 42 44 64c0 17 7 28 17 35v17h38V99c10-7 17-18 17-35 0-22-13-39-36-39Z" />
              </clipPath>
            </defs>
            <circle
              cx="80"
              cy="80"
              r="55"
              fill="none"
              className="stroke-current opacity-15"
            />
            <path
              d="M80 25C57 25 44 42 44 64c0 17 7 28 17 35v17h38V99c10-7 17-18 17-35 0-22-13-39-36-39Z"
              className="fill-current opacity-[0.07]"
            />
            <g clipPath="url(#proto-head-study)" className="stroke-current">
              <path d="M37 53h86M35 65h90M37 77h86M42 89h76M49 101h62" opacity="0.28" />
              <path d="M59 29v88M70 25v93M80 24v94M90 25v93M101 29v88" opacity="0.12" />
              <rect
                x="36"
                y="-18"
                width="88"
                height="24"
                className="proto-head-scan fill-current stroke-none motion-reduce:hidden"
                opacity="0.12"
              />
              <path
                d="M42 0h76"
                className="proto-head-line fill-none stroke-current motion-reduce:hidden"
                strokeWidth="1.25"
              />
            </g>
            <circle cx="61" cy="68" r="1.5" className="proto-head-pulse fill-current motion-reduce:animate-none" />
            <circle cx="99" cy="68" r="1.5" className="proto-head-pulse fill-current motion-reduce:animate-none" style={{ animationDelay: "1.2s" }} />
          </svg>
        </div>
        <div className="grid gap-4 px-6">
          <p className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {HEADLINE}
          </p>
          <p className="text-muted-foreground mx-auto max-w-sm text-pretty">
            {SUBLINE}
          </p>
          <div className="bg-border/70 mx-auto mt-1 h-px w-24 overflow-hidden rounded-full">
            <div className="proto-focus-mark bg-foreground/45 h-full w-5 motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </Shell>
  );
}
VariantC.displayName = "Portrait signal";

/* ------------------------------------------------------------------ */
/* D — Cyberpunk scan: A's frame + scanline, C's gradient bloom         */
/* ------------------------------------------------------------------ */

export function VariantD({ regenerating }: VariantProps) {
  return (
    // Full-bleed: breaks the card's padding and owns the viewport height. The
    // generating state is the only thing on screen, so it takes the screen.
    <div
      role="status"
      aria-live="polite"
      className="relative -mx-6 -mb-6 flex min-h-[78vh] flex-col items-center justify-center overflow-hidden rounded-b-xl bg-[#05070f] sm:-mx-8"
    >
      {/* The previous portrait, held dimmed underneath during a regeneration. */}
      {regenerating && (
        <div className="absolute inset-0 opacity-25 grayscale">
          <PreviousPortrait />
        </div>
      )}

      {/* C's gradient, blown up to fill the scene rather than sit in a box. */}
      <div className="proto-bloom absolute inset-0 opacity-45 blur-3xl motion-reduce:animate-none" />

      {/* Horizon: a perspective floor the figure stands on. */}
      <div className="proto-floor absolute inset-x-0 bottom-0 h-2/5 motion-reduce:animate-none" />

      {/* The scan plane, sweeping the full width of the scene. */}
      <div className="proto-scan absolute inset-x-0 h-40 motion-reduce:hidden" />

      <svg
        viewBox="0 0 200 350"
        aria-hidden="true"
        className="relative h-[58vh] w-auto"
      >
        <defs>
          <linearGradient id="proto-neon" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
          <linearGradient id="proto-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="70%" stopColor="#67e8f9" stopOpacity="0.5" />
            <stop offset="97%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f0abfc" stopOpacity="0.8" />
          </linearGradient>
          {/* clipPath children must be shapes, not a <g>. */}
          <clipPath id="proto-body">
            <path d={BODY_HALF} />
            <path d={BODY_HALF} transform="translate(200,0) scale(-1,1)" />
            <path d={ARM_HALF} />
            <path d={ARM_HALF} transform="translate(200,0) scale(-1,1)" />
          </clipPath>
        </defs>

        {/* Chromatic-aberration ghosts, offset either side of the core. */}
        <g className="mix-blend-screen">
          <Figure
            className="proto-figure fill-cyan-400/25 motion-reduce:animate-none"
            transform="translate(-3 0)"
          />
          <Figure
            className="proto-figure fill-fuchsia-500/25 motion-reduce:animate-none"
            transform="translate(3 0)"
          />
        </g>

        {/* Volumetric interior: a faint gradient body, wrapped in a contour
            mesh, with the scan band travelling through it. */}
        <g clipPath="url(#proto-body)">
          <rect
            width="200"
            height="350"
            fill="url(#proto-neon)"
            className="proto-figure motion-reduce:animate-none"
            opacity="0.22"
          />
          <Mesh
            className="stroke-cyan-300/45"
            strokeWidth="0.7"
            fill="none"
          />
          <rect
            width="200"
            height="60"
            y="-60"
            fill="url(#proto-band)"
            className="proto-band motion-reduce:hidden"
          />
        </g>

        {/* Glowing outline, so the silhouette reads even between scans. */}
        <Figure
          className="proto-outline stroke-cyan-200/80 motion-reduce:animate-none"
          fill="none"
          strokeWidth="1.1"
        />

        <ellipse
          cx="100"
          cy="334"
          rx="52"
          ry="6"
          className="proto-breathe fill-cyan-300/40 motion-reduce:animate-none"
        />
      </svg>

      {/* CRT scanlines over everything. */}
      <div className="proto-scanlines pointer-events-none absolute inset-0 opacity-30" />

      {/* HUD brackets on the scene corners, not a little box. */}
      <span className="absolute top-5 left-5 size-8 border-t border-l border-cyan-300/50" />
      <span className="absolute top-5 right-5 size-8 border-t border-r border-cyan-300/50" />
      <span className="absolute bottom-5 left-5 size-8 border-b border-l border-cyan-300/50" />
      <span className="absolute right-5 bottom-5 size-8 border-r border-b border-cyan-300/50" />

      <div className="relative mt-8 grid gap-2 px-6 text-center">
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            {HEADLINE}
          </span>
        </p>
        <p className="text-sm text-cyan-100/50">{SUBLINE}</p>
      </div>
    </div>
  );
}
VariantD.displayName = "Cyberpunk scan";

/* ------------------------------------------------------------------ */
/* E — Materialization chamber: the reference synthesis                 */
/*                                                                      */
/* Refs (issue #23 thread): wireframe-head mesh + fresnel rim glow;     */
/* Exedre activation ring + internal energy lines; buffering-orb        */
/* comet ribbons; particle materialization. Combined: a mesh figure     */
/* on an activation ring in a star-dusted void, orbited by light        */
/* ribbons, materialized by a scan plane crossing the whole chamber.    */
/* ------------------------------------------------------------------ */

/** Deterministic PRNG so star positions match between server and client. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(7);
const STARS = Array.from({ length: 42 }, () => ({
  x: -55 + rand() * 310,
  y: 6 + rand() * 310,
  r: 0.35 + rand() * 0.55,
  delay: rand() * 4,
}));
const RING_DUST = Array.from({ length: 14 }, () => {
  const angle = rand() * Math.PI * 2;
  const spread = 0.25 + rand() * 0.7;
  return {
    x: 100 + Math.cos(angle) * 62 * spread,
    y: 331 + Math.sin(angle) * 9 * spread,
    r: 0.5 + rand() * 0.5,
    delay: rand() * 3,
  };
});

/** Energy conduits: spine, arms, legs — the Exedre internal structure. */
const VEINS = [
  "M100,44 L100,170",
  "M100,80 C120,84 138,96 146,120 L154,180 L152,225",
  "M100,80 C80,84 62,96 54,120 L46,180 L48,225",
  "M100,170 C108,200 112,230 114,262 L116,310",
  "M100,170 C92,200 88,230 86,262 L84,310",
];
const NODES = [
  { x: 100, y: 72 },
  { x: 100, y: 108 },
  { x: 100, y: 145 },
  { x: 100, y: 170 },
  { x: 147, y: 152 },
  { x: 53, y: 152 },
  { x: 114, y: 244 },
  { x: 86, y: 244 },
];

export function VariantE({ regenerating }: VariantProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative -mx-6 -mb-6 flex min-h-[80vh] flex-col items-center justify-center overflow-hidden rounded-b-xl bg-[#020308] sm:-mx-8"
    >
      {/* Deep-indigo chamber: a floor-lit void, vignetted at the edges. When
          regenerating, the chamber thins so the held portrait ghosts through
          like a projection on the back wall. */}
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_78%,#0b1030_0%,#05070f_55%,#020308_100%)]" />
      {regenerating && (
        <div className="absolute inset-0 opacity-35 grayscale [mask-image:radial-gradient(70%_60%_at_50%_45%,black,transparent)]">
          <PreviousPortrait />
        </div>
      )}
      <div className="proto-bloom absolute inset-0 opacity-30 blur-3xl motion-reduce:animate-none" />

      <svg
        viewBox="-60 0 320 352"
        aria-hidden="true"
        className="relative h-[62vh] w-auto max-w-full"
      >
        <defs>
          <linearGradient id="proto-neon-e" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="55%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
          <linearGradient id="proto-band-e" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="72%" stopColor="#67e8f9" stopOpacity="0.45" />
            <stop offset="97%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f0abfc" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="proto-plane-e" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="18%" stopColor="#67e8f9" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#e0f2fe" stopOpacity="0.9" />
            <stop offset="82%" stopColor="#a855f7" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f0abfc" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="proto-ringlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#a855f7" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
          {/* clipPath children must be shapes, not a <g> — inline the four
              paths rather than reusing <Figure/>. */}
          <clipPath id="proto-body-e">
            <path d={BODY_HALF} />
            <path d={BODY_HALF} transform="translate(200,0) scale(-1,1)" />
            <path d={ARM_HALF} />
            <path d={ARM_HALF} transform="translate(200,0) scale(-1,1)" />
          </clipPath>
        </defs>

        {/* Star dust drifting in the void. */}
        <g className="fill-cyan-100">
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              className="proto-twinkle motion-reduce:animate-none"
              style={{ animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>

        {/* Activation ring platform, floor glow first. */}
        <ellipse cx="100" cy="332" rx="105" ry="26" fill="url(#proto-ringlow)" />
        <ellipse
          cx="100"
          cy="332"
          rx="68"
          ry="10.5"
          fill="none"
          className="proto-ringpulse stroke-cyan-300/80 motion-reduce:animate-none"
          strokeWidth="0.9"
          style={{ filter: "drop-shadow(0 0 4px rgba(34,211,238,0.9))" }}
        />
        <ellipse
          cx="100"
          cy="332"
          rx="55"
          ry="8"
          fill="none"
          className="proto-ringticks stroke-fuchsia-300/70 motion-reduce:animate-none"
          strokeWidth="1.6"
          strokeDasharray="3 8"
        />
        {RING_DUST.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            className="proto-twinkle fill-cyan-200/80 motion-reduce:animate-none"
            style={{ animationDelay: `${p.delay}s` }}
          />
        ))}

        {/* Rear orbit ribbon: a comet arc circling behind the figure. */}
        <ellipse
          cx="100"
          cy="168"
          rx="95"
          ry="40"
          fill="none"
          stroke="url(#proto-neon-e)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="60 382"
          transform="rotate(-12 100 168)"
          className="proto-orbit-a motion-reduce:hidden"
          opacity="0.65"
        />

        {/* The figure: fresnel halo, mesh interior, energy conduits. */}
        <Figure
          className="proto-halo stroke-cyan-400/60 motion-reduce:animate-none"
          fill="rgba(8,20,40,0.55)"
          strokeWidth="4"
          style={{ filter: "blur(3px)" }}
        />
        <g clipPath="url(#proto-body-e)">
          <rect x="-60" width="320" height="352" fill="url(#proto-neon-e)" opacity="0.16" />
          <Mesh className="proto-mesh stroke-cyan-300/70 motion-reduce:animate-none" strokeWidth="0.7" fill="none" />
          {/* energy conduits + joint nodes */}
          <g
            fill="none"
            stroke="url(#proto-neon-e)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="4 7"
            className="proto-flow motion-reduce:animate-none"
            opacity="0.7"
            style={{ filter: "drop-shadow(0 0 2.5px rgba(168,85,247,0.9))" }}
          >
            {VEINS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          {/* materialization band travelling down the body */}
          <rect
            x="-60"
            width="320"
            height="80"
            y="-80"
            fill="url(#proto-band-e)"
            className="proto-band motion-reduce:hidden"
          />
        </g>
        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r="1.8"
            className="proto-node fill-cyan-200 motion-reduce:animate-none"
            style={{
              animationDelay: `${i * 0.42}s`,
              filter: "drop-shadow(0 0 3px rgba(103,232,249,0.95))",
            }}
          />
        ))}

        {/* Sharp fresnel outline above the mesh. */}
        <Figure
          className="proto-outline stroke-cyan-200/90 motion-reduce:animate-none"
          fill="none"
          strokeWidth="0.9"
        />

        {/* The scan plane crossing the whole chamber, synced with the band:
            same translate animation, so the line and the in-body band arrive
            together. */}
        <g className="proto-band motion-reduce:hidden">
          <rect x="-60" y="-2.2" width="320" height="1.6" fill="url(#proto-plane-e)" opacity="0.8" />
          <rect
            x="-60"
            y="-2.5"
            width="320"
            height="2.2"
            fill="url(#proto-plane-e)"
            opacity="0.35"
            style={{ filter: "blur(2px)" }}
          />
        </g>

        {/* Front orbit ribbon, crossing the figure at the waist. */}
        <ellipse
          cx="100"
          cy="176"
          rx="122"
          ry="46"
          fill="none"
          stroke="url(#proto-neon-e)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="80 475"
          transform="rotate(14 100 176)"
          className="proto-orbit-b motion-reduce:hidden"
          opacity="0.9"
          style={{ filter: "drop-shadow(0 0 4px rgba(168,85,247,0.9))" }}
        />
      </svg>

      {/* CRT scanlines + corner HUD, carried over from D. */}
      <div className="proto-scanlines pointer-events-none absolute inset-0 opacity-25" />
      <span className="absolute top-5 left-5 size-8 border-t border-l border-cyan-300/40" />
      <span className="absolute top-5 right-5 size-8 border-t border-r border-cyan-300/40" />
      <span className="absolute bottom-5 left-5 size-8 border-b border-l border-cyan-300/40" />
      <span className="absolute right-5 bottom-5 size-8 border-r border-b border-cyan-300/40" />

      <div className="relative mt-6 grid gap-2 px-6 pb-4 text-center">
        <p className="font-mono text-[11px] tracking-[0.35em] text-cyan-300/60 uppercase">
          AURA · portrait study
        </p>
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            {HEADLINE}
          </span>
        </p>
        <p className="text-sm text-cyan-100/45">{SUBLINE}</p>
      </div>
    </div>
  );
}
VariantE.displayName = "Materialization chamber";

export const VARIANTS = [
  { key: "C", name: VariantC.displayName, Component: VariantC },
] as const;
