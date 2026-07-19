"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  ImageIcon,
  LinkIcon,
  SparklesIcon,
} from "lucide-react";

import { isLinkSource, type SavedLookSource } from "@/lib/aura-style-book";
import { cloudinaryThumbUrl } from "@/lib/cloudinary-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Where the Style Book links back to the try-on surface. */
const TRY_ON_HREF = "/aura/try-on";

/**
 * One Saved Look, serialised for the client grid. `createdAt` crosses as an ISO
 * string (a `Date` isn't serialisable across the Server → Client boundary), and
 * the sources array is the stored {@link SavedLookSource} shape — provenance is
 * inferred from `url`/`site`, never a stored discriminator.
 */
export type StyleBookLook = {
  id: string;
  caption: string;
  lookImageUrl: string;
  createdAt: string;
  sources: SavedLookSource[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sourceCount(n: number): string {
  return `${n} source${n === 1 ? "" : "s"}`;
}

/**
 * The Style Book browse surface: a private, newest-first gallery of Saved Looks.
 * Purely presentational — the ownership-scoped `findMany` happens in the Server
 * Component page, which hands the already-loaded rows here. Because the whole
 * book is loaded up front, opening a look is a client-side selection swap (grid
 * ↔ detail), needing no second fetch. A persistent "Try on a look" action keeps
 * a non-empty book from being a dead end; an empty book gets the same action as
 * its primary CTA.
 */
export function StyleBookGallery({ looks }: { looks: StyleBookLook[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const open = looks.find((look) => look.id === openId) ?? null;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-medium tracking-tight text-balance">
            Your Style Book
          </h1>
          <p className="text-muted-foreground text-pretty">
            Every look you&rsquo;ve saved, newest first — kept privately, only
            you can see it.
          </p>
        </div>
        {/* Persistent onward path, so a non-empty book is never a dead end. */}
        <Button variant="outline" nativeButton={false} render={<Link href={TRY_ON_HREF} />}>
          <SparklesIcon />
          Try on a look
        </Button>
      </header>

      {looks.length === 0 ? (
        <EmptyState />
      ) : open ? (
        <Detail look={open} onBack={() => setOpenId(null)} />
      ) : (
        <Grid looks={looks} onOpen={setOpenId} />
      )}
    </main>
  );
}

/* -------------------------------------------------------------------- grid */

function Grid({
  looks,
  onOpen,
}: {
  looks: StyleBookLook[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-6">
      {looks.map((look) => (
        <button
          key={look.id}
          type="button"
          onClick={() => onOpen(look.id)}
          className="group focus-visible:ring-ring relative overflow-hidden rounded-2xl border text-left transition-all hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none"
        >
          {/* Grid thumbnail derived on-read via a Cloudinary transform — no
              separate thumbnail asset is stored. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cloudinaryThumbUrl(look.lookImageUrl, { width: 600, height: 800 })}
            alt={look.caption}
            className="aspect-[3/4] w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
            <p className="line-clamp-1 font-medium text-white">{look.caption}</p>
            <p className="text-xs text-white/70">
              {formatDate(look.createdAt)} · {sourceCount(look.sources.length)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ detail */

function Detail({
  look,
  onBack,
}: {
  look: StyleBookLook;
  onBack: () => void;
}) {
  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="justify-self-start"
      >
        <ArrowLeftIcon />
        Back to Style Book
      </Button>
      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
        {/* Full-bleed generated look on the left. */}
        <figure className="bg-muted/30 grid place-items-center self-start overflow-hidden rounded-2xl border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={look.lookImageUrl}
            alt={look.caption}
            className="max-h-[70vh] w-auto rounded-xl object-contain"
          />
        </figure>
        {/* Sources as a tall rail on the right. */}
        <div className="grid content-start gap-5">
          <div className="grid gap-1">
            <h2 className="text-xl font-medium text-balance">{look.caption}</h2>
            <p className="text-muted-foreground text-sm">
              Saved {formatDate(look.createdAt)}
            </p>
          </div>
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {sourceCount(look.sources.length)}
            </p>
            {look.sources.map((source, index) => (
              <SourceRow key={index} source={source} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: SavedLookSource }) {
  const link = isLinkSource(source);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cloudinaryThumbUrl(source.imageUrl, { width: 128, height: 128 })}
        alt={source.name}
        className="size-16 shrink-0 rounded-lg object-cover"
      />
      <div className="grid min-w-0 gap-1">
        <p className="truncate text-sm font-medium">{source.name}</p>
        {link ? (
          // A dead original link simply 404s on click — no liveness checking.
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
          >
            <LinkIcon className="size-3" /> from {source.site}
          </a>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <ImageIcon className="size-3" /> uploaded image
          </span>
        )}
      </div>
      <Badge variant={link ? "secondary" : "outline"} className="mr-1 ml-auto">
        {link ? "link" : "upload"}
      </Badge>
    </div>
  );
}

/* ------------------------------------------------------------------- empty */

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed py-24 text-center">
      <div className="grid max-w-sm justify-items-center gap-3 px-6">
        <BookmarkIcon className="text-muted-foreground size-8" />
        <h2 className="text-lg font-medium">Your Style Book is empty</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          Try on a garment on your AURA portrait, then save the look — it lands
          here for you to come back to.
        </p>
        <Button nativeButton={false} render={<Link href={TRY_ON_HREF} />}>
          <SparklesIcon />
          Try on a look
        </Button>
      </div>
    </div>
  );
}
