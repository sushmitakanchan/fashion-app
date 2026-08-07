"use client";

import { useRef } from "react";

// A board tile that tilts toward the cursor in 3D. Kept as a thin client wrapper
// so the board itself stays a Server Component: the photo/quote content is passed
// in as children (rendered on the server), and only the pointer tracking lives
// here. The paired image zoom rides `group-hover` on the child <Image>, so this
// component owns just the tilt transform.
//
// The tile keeps `overflow-hidden` to crop photos to the rounded frame, which
// forces `transform-style: flat` — so there's no translateZ layering to float
// the pill/corners; the whole tile leans as one plane. That's the effect that
// reads, and it degrades to a plain tile when the pointer is coarse or the
// visitor prefers reduced motion.

// Peak rotation, in degrees, at the tile's corners.
const MAX_TILT = 9;

export function BoardTile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);

  function handleMove(e: React.PointerEvent<HTMLLIElement>) {
    // Coarse pointers (touch) don't hover, and reduced-motion opts out entirely.
    if (
      e.pointerType !== "mouse" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    // Pointermove is already coalesced to a frame by the browser, so set the
    // transform straight away — an rAF hop here only adds a frame of lag.
    el.dataset.tilting = "true";
    el.style.transform = `perspective(700px) rotateY(${px * MAX_TILT}deg) rotateX(${-py * MAX_TILT}deg) translateY(-4px)`;
  }

  function handleLeave() {
    const el = ref.current;
    if (!el) return;
    delete el.dataset.tilting;
    el.style.transform = "";
  }

  return (
    <li
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      // `data-[tilting]` shortens the transition while the cursor is driving so
      // the tile tracks the pointer, then eases back on leave. `transform-gpu`
      // and preserve-3d set up the 3D context; reduced motion drops the lot.
      className={`transform-gpu transition-[transform,box-shadow] duration-500 ease-out [transform-style:preserve-3d] hover:shadow-[0_26px_46px_-20px_rgb(20_17_15_/_0.6)] data-[tilting]:duration-150 motion-reduce:transition-none motion-reduce:hover:shadow-none ${className ?? ""}`}
    >
      {children}
    </li>
  );
}
