"use client";

/**
 * PROTOTYPE ONLY — throwaway route for issue #23.
 *
 * The selected portrait generating state, mounted inside the real `/aura` card
 * shell so it is judged at real density.
 * `?regenerating=1` shows the second mode: overlaid on the dimmed previous
 * portrait. Not linked from anywhere; delete with the rest of the prototype.
 */

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher";

import { VARIANTS } from "./variants";

function Stage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const key = params.get("variant") ?? "C";
  const regenerating = params.get("regenerating") === "1";
  const variant = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
  const { Component } = variant;

  function toggleRegenerating() {
    const q = new URLSearchParams(params.toString());
    if (regenerating) q.delete("regenerating");
    else q.set("regenerating", "1");
    router.replace(`${pathname}?${q.toString()}`);
  }

  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Generate your AURA</CardTitle>
            <CardDescription className="text-pretty">
              Your AURA portrait is created from a full-body photo and a face
              close-up. You can update either reference later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Component regenerating={regenerating} />
          </CardContent>
        </Card>
      </main>

      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant.key}
        extras={
          <button
            type="button"
            onClick={toggleRegenerating}
            className="rounded-full px-3 py-1.5 font-mono text-xs hover:bg-white/10"
          >
            {regenerating ? "◉ regenerating" : "○ first run"}
          </button>
        }
      />
    </>
  );
}

export default function PrototypeGeneratingPage() {
  return (
    <React.Suspense>
      <Stage />
      <style>{PROTOTYPE_KEYFRAMES}</style>
    </React.Suspense>
  );
}

/** Kept here, not in globals.css, so deleting the route deletes the prototype. */
const PROTOTYPE_KEYFRAMES = `
.proto-grain {
  background-image:
    radial-gradient(currentColor 0.5px, transparent 0.5px),
    radial-gradient(currentColor 0.5px, transparent 0.5px);
  background-size: 4px 4px, 7px 7px;
  background-position: 0 0, 2px 3px;
  color: color-mix(in oklab, currentColor 35%, transparent);
  animation: proto-grain-drift 3.5s steps(4, end) infinite;
}
@keyframes proto-grain-drift {
  0%   { background-position: 0 0, 2px 3px; }
  25%  { background-position: 2px 1px, 0 2px; }
  50%  { background-position: 1px 3px, 3px 0; }
  75%  { background-position: 3px 2px, 1px 1px; }
  100% { background-position: 0 0, 2px 3px; }
}

.proto-develop { animation: proto-develop 9s ease-in-out infinite; }
@keyframes proto-develop {
  0%, 100% { opacity: 0.04; filter: blur(6px); }
  45%      { opacity: 0.34; filter: blur(1.5px); }
  60%      { opacity: 0.26; filter: blur(2.5px); }
}

.proto-sweep {
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in oklab, currentColor 12%, transparent),
    transparent
  );
  animation: proto-sweep 6s ease-in-out infinite;
}
@keyframes proto-sweep {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(400%); }
}

.proto-breathe { animation: proto-breathe 2.4s ease-in-out infinite; }
@keyframes proto-breathe {
  0%, 100% { opacity: 0.35; transform: scale(0.94); }
  50%      { opacity: 1;    transform: scale(1.06); }
}

.proto-key  { animation: proto-lamp 7s ease-in-out infinite; }
.proto-fill { animation: proto-lamp 7s ease-in-out infinite 1.2s; }
@keyframes proto-lamp {
  0%, 100% { opacity: 0.25; }
  40%      { opacity: 1; }
}

.proto-aurora {
  background:
    radial-gradient(40% 60% at 25% 40%, var(--primary), transparent 70%),
    radial-gradient(45% 55% at 75% 60%, var(--chart-2, var(--primary)), transparent 70%),
    radial-gradient(35% 45% at 50% 80%, var(--chart-4, var(--primary)), transparent 70%);
  animation: proto-aurora 14s ease-in-out infinite alternate;
}
@keyframes proto-aurora {
  0%   { transform: translate3d(-4%, 2%, 0) scale(1.05); }
  50%  { transform: translate3d(3%, -3%, 0) scale(1.15); }
  100% { transform: translate3d(-2%, 4%, 0) scale(1.08); }
}

.proto-shimmer { animation: proto-shimmer 2.6s ease-in-out infinite; }
@keyframes proto-shimmer {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
}

/* --- selected C: a soft, photographic face-study scan --- */

.proto-portrait-bloom {
  background:
    radial-gradient(56% 74% at 21% 23%, rgb(255 105 124 / 0.72), transparent 70%),
    radial-gradient(62% 78% at 80% 66%, rgb(113 121 255 / 0.66), transparent 74%),
    radial-gradient(45% 58% at 53% 96%, rgb(238 104 195 / 0.52), transparent 72%),
    linear-gradient(135deg, rgb(255 246 249 / 0.92), rgb(243 246 255 / 0.92));
  animation: proto-portrait-bloom 15s ease-in-out infinite alternate;
}
.dark .proto-portrait-bloom {
  background:
    radial-gradient(56% 74% at 21% 23%, rgb(239 72 104 / 0.52), transparent 70%),
    radial-gradient(62% 78% at 80% 66%, rgb(86 82 255 / 0.5), transparent 74%),
    radial-gradient(45% 58% at 53% 96%, rgb(204 70 188 / 0.4), transparent 72%),
    linear-gradient(135deg, rgb(29 12 29 / 0.92), rgb(12 14 42 / 0.92));
}
@keyframes proto-portrait-bloom {
  0%   { transform: translate3d(-2%, 1%, 0) scale(1.05); }
  50%  { transform: translate3d(3%, -2%, 0) scale(1.15); }
  100% { transform: translate3d(-1%, 2%, 0) scale(1.08); }
}

.proto-focus-mark {
  animation: proto-focus-mark 2.8s ease-in-out infinite;
}

@keyframes proto-focus-mark {
  0%, 100% { transform: translateX(-2.25rem); opacity: 0.35; }
  50% { transform: translateX(7.25rem); opacity: 1; }
}

/* --- variant D: cyberpunk scan --- */

.proto-bloom {
  background:
    radial-gradient(45% 55% at 30% 25%, #22d3ee, transparent 70%),
    radial-gradient(45% 55% at 70% 65%, #a855f7, transparent 70%),
    radial-gradient(40% 40% at 45% 95%, #f0abfc, transparent 70%);
  animation: proto-aurora 14s ease-in-out infinite alternate;
}

.proto-figure { animation: proto-figure-pulse 3.4s ease-in-out infinite; }
@keyframes proto-figure-pulse {
  0%, 100% { opacity: 0.32; }
  50%      { opacity: 0.95; }
}

.proto-scan {
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(34, 211, 238, 0.05) 55%,
    rgba(34, 211, 238, 0.22) 88%,
    rgba(165, 243, 252, 0.95) 97%,
    rgba(240, 171, 252, 0.9) 100%
  );
  box-shadow: 0 2px 24px 2px rgba(34, 211, 238, 0.55);
  animation: proto-scan 3.6s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}
@keyframes proto-scan {
  0%   { transform: translateY(-100%); opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { transform: translateY(480%); opacity: 0; }
}

.proto-scanlines {
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.55) 0px,
    rgba(0, 0, 0, 0.55) 1px,
    transparent 1px,
    transparent 3px
  );
}

/* Perspective floor: horizontal rules compress toward a horizon, verticals
   fan out from the centre, the whole thing scrolling toward the viewer. */
.proto-floor {
  background:
    repeating-linear-gradient(to bottom, rgba(34,211,238,0.55) 0 1px, transparent 1px 26px),
    repeating-linear-gradient(to right, rgba(168,85,247,0.35) 0 1px, transparent 1px 52px);
  mask-image: linear-gradient(to bottom, transparent, black 55%, black);
  transform: perspective(320px) rotateX(62deg);
  transform-origin: bottom center;
  animation: proto-floor 5s linear infinite;
}
@keyframes proto-floor {
  0%   { background-position: 0 0, 0 0; }
  100% { background-position: 0 26px, 0 0; }
}

/* The scan band travelling through the clipped body interior. */
.proto-band { animation: proto-band 3.6s cubic-bezier(0.5, 0, 0.5, 1) infinite; }
@keyframes proto-band {
  0%   { transform: translateY(0); }
  100% { transform: translateY(420px); }
}

.proto-outline {
  filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.9));
  animation: proto-outline 3.4s ease-in-out infinite;
}
@keyframes proto-outline {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}

/* --- variant E: materialization chamber --- */

.proto-twinkle { animation: proto-twinkle 3.2s ease-in-out infinite; }
@keyframes proto-twinkle {
  0%, 100% { opacity: 0.12; }
  50%      { opacity: 0.85; }
}

.proto-ringpulse { animation: proto-ringpulse 4.2s ease-in-out infinite; }
@keyframes proto-ringpulse {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1; }
}

/* Dashes crawling around the ellipse — the platform's rotating ticks. */
.proto-ringticks { animation: proto-ringticks 9s linear infinite; }
@keyframes proto-ringticks {
  to { stroke-dashoffset: -220; }
}

/* Comet arcs orbiting: offset animates by exactly dash+gap, so the loop
   is seamless. Rear orbit drifts one way, front orbit the other. */
.proto-orbit-a { animation: proto-orbit-a 8.5s linear infinite; }
@keyframes proto-orbit-a { to { stroke-dashoffset: -442; } }
.proto-orbit-b { animation: proto-orbit-b 6.5s linear infinite; }
@keyframes proto-orbit-b { to { stroke-dashoffset: 555; } }

.proto-mesh { animation: proto-mesh 5.2s ease-in-out infinite; }
@keyframes proto-mesh {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 0.95; }
}

/* Energy crawling through the conduits. */
.proto-flow { animation: proto-flow 2.8s linear infinite; }
@keyframes proto-flow { to { stroke-dashoffset: -22; } }

.proto-node { animation: proto-node 2.6s ease-in-out infinite; }
@keyframes proto-node {
  0%, 100% { opacity: 0.25; }
  50%      { opacity: 1; }
}

.proto-halo { animation: proto-halo 4.6s ease-in-out infinite; }
@keyframes proto-halo {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 0.95; }
}

@media (prefers-reduced-motion: reduce) {
  .proto-grain, .proto-develop, .proto-sweep, .proto-breathe,
  .proto-key, .proto-fill, .proto-aurora, .proto-shimmer,
  .proto-portrait-bloom, .proto-focus-mark,
  .proto-bloom, .proto-figure, .proto-scan, .proto-floor,
  .proto-band, .proto-outline, .proto-twinkle, .proto-ringpulse,
  .proto-ringticks, .proto-orbit-a, .proto-orbit-b, .proto-mesh,
  .proto-flow, .proto-node, .proto-halo {
    animation: none !important;
  }
  .proto-figure, .proto-outline { opacity: 0.85; }
  .proto-mesh { opacity: 0.6; }
  .proto-node { opacity: 0.8; }
}
`;
