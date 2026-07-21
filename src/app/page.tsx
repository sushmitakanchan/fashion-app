import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { BrandMarquee } from "@/components/landing/brand-marquee";

// The v5 placeholder texture: a fine diagonal hatch over a flat fill, standing
// in for photography that doesn't exist yet. Decorative, so every element that
// carries it is hidden from assistive tech rather than given alt text it can't
// honestly provide.
const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(70deg, rgb(0 0 0 / 0.08) 0 2px, transparent 2px 12px)",
} as const;

const GRID = {
  backgroundImage:
    "linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
  backgroundSize: "42px 42px",
} as const;

const steps = [
  {
    n: "01",
    title: "Upload",
    description: "A full-body, front-facing photo and a face close-up.",
  },
  {
    n: "02",
    title: "Generate",
    description:
      "AURA composes a polished, studio-style portrait from your two photos.",
  },
  {
    n: "03",
    title: "Style",
    description: "Build a stylebook of looks around your new AURA portrait.",
  },
];

const galleryItems = [
  { tag: "Studio", tone: "bg-neutral-300" },
  { tag: "AW/25", tone: "bg-neutral-400" },
  { tag: "Mono", tone: "bg-neutral-200" },
  { tag: "Weekend", tone: "bg-neutral-400" },
  { tag: "Event", tone: "bg-neutral-300" },
  { tag: "Studio", tone: "bg-neutral-200" },
];

function PrimaryCta({ className }: { className?: string }) {
  return (
    <>
      {/* v5 draws "Continue with Google" unconditionally — it has no auth
          state. Branching here keeps a signed-in visitor from being asked to
          sign in again. */}
      <Show when="signed-in">
        <Button
          size="lg"
          nativeButton={false}
          className={className}
          render={<Link href="/aura" />}
        >
          <SparklesIcon />
          Create your AURA portrait
        </Button>
      </Show>
      <Show when="signed-out">
        <GoogleAuthButton size="lg" className={className} />
      </Show>
    </>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1">
        {/* ---------------------------------------------------------- HERO */}
        <section className="bg-[radial-gradient(ellipse_80%_65%_at_50%_0%,var(--color-accent)_0%,transparent_70%)] px-6 pt-16 pb-20 sm:pt-24">
          <p className="text-muted-foreground text-center text-[11px] tracking-[0.14em] uppercase">
            Your all-in-one style partner
          </p>
          <div className="mx-auto mt-10 grid max-w-6xl items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h1 className="font-heading text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.96] tracking-wide text-balance uppercase">
                A magnetic{" "}
                <em className="font-serif text-[1.05em] normal-case italic">
                  portrait
                </em>{" "}
                that becomes your aura.
              </h1>
              <p className="text-muted-foreground mt-5 max-w-md text-[15px] leading-relaxed text-pretty">
                Upload a full-body photo and a face close-up — AURA composes a
                polished studio portrait and builds a stylebook to match.
              </p>
              <PrimaryCta className="mt-7" />
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <div
                aria-hidden="true"
                className="aspect-square w-full rounded-full bg-neutral-300 shadow-[0_0_45px_6px] shadow-brand-lime/50"
                style={HATCH}
              />
              <p className="bg-brand-ink text-brand-ink-foreground absolute bottom-2 left-2 rounded-full px-4 py-2 text-[11px] font-bold tracking-wider uppercase">
                Two photos
              </p>
            </div>
          </div>
        </section>

        <BrandMarquee />

        {/* -------------------------------------------------- HOW IT WORKS */}
        <section className="bg-brand-ink text-brand-ink-foreground px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-heading text-4xl tracking-wide text-balance uppercase">
              How it works
            </h2>
            <p className="text-brand-lime font-serif mt-2 text-[22px] italic">
              three easy steps
            </p>
            <ol className="mt-11 grid gap-6 md:grid-cols-3">
              {steps.map((step) => (
                <li
                  key={step.n}
                  className="bg-brand-lime text-brand-lime-foreground rounded-3xl p-7"
                >
                  <span className="font-heading text-4xl leading-none">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-xl font-bold tracking-wide text-balance uppercase">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-pretty">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------- FEATURE SPLIT */}
        <section className="px-6 py-20 sm:py-24">
          <h2 className="sr-only">What AURA gives you</h2>
          <div className="mx-auto grid max-w-6xl gap-7 md:grid-cols-2">
            <div className="bg-muted rounded-3xl p-11">
              <h3 className="font-heading text-3xl tracking-wide text-balance uppercase">
                Portrait Generator
              </h3>
              <p className="text-muted-foreground mt-3 max-w-sm text-sm leading-relaxed text-pretty">
                Two reference photos become one polished, studio-lit AURA
                portrait — consistent lighting, consistent you.
              </p>
              <Link
                href="/aura"
                className="focus-visible:ring-ring mt-5 inline-block rounded-sm text-[13px] font-bold underline underline-offset-4 touch-manipulation transition-opacity hover:opacity-70 focus-visible:ring-3 focus-visible:outline-none"
              >
                See sample portraits →
              </Link>
            </div>

            <div className="bg-brand-magenta text-brand-magenta-foreground rounded-3xl p-11">
              <h3 className="font-heading text-3xl tracking-wide text-balance uppercase">
                Stylebook
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-pretty">
                Curate looks on top of your AURA portrait and keep a running
                record of your style.
              </p>
              <Link
                href="/aura/style-book"
                className="focus-visible:ring-brand-magenta-foreground mt-5 inline-block rounded-sm text-[13px] font-bold underline underline-offset-4 touch-manipulation transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:outline-none"
              >
                Open stylebook →
              </Link>
            </div>
          </div>
        </section>

        {/* --------------------------------------- LET YOUR STYLE SPEAK */}
        <section
          className="bg-brand-ink text-brand-ink-foreground px-6 py-24 sm:py-28"
          style={GRID}
        >
          <div className="mx-auto max-w-6xl">
            {/* The asterisk is a glyph swap, not a word. Naming the heading
                outright keeps "SP*AK" from being announced letter by letter. */}
            <h2
              aria-label="Let your style speak"
              className="font-heading text-center text-[clamp(3.5rem,9vw,8.75rem)] leading-[0.92] tracking-wide uppercase"
            >
              <span aria-hidden="true">
                Let your
                <br />
                <span className="text-brand-lime">Style</span> sp
                <span className="text-brand-lime">*</span>ak
              </span>
            </h2>

            <ul className="mt-16 grid grid-cols-2 gap-5 md:grid-cols-3">
              {galleryItems.map((item, i) => (
                <li
                  key={`${item.tag}-${i}`}
                  className={`relative aspect-4/5 overflow-hidden rounded-2xl ${item.tone}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={HATCH}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-2.5 left-2.5 size-4 border-t-2 border-l-2 border-neutral-900"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute right-2.5 bottom-2.5 size-4 border-r-2 border-b-2 border-neutral-900"
                  />
                  {/* 11px, not v5's 9.5px: uppercase + letterspacing strips
                      word-shape cues, and below ~11px that legibility cost
                      lands hardest. The tighter tracking keeps the pill the
                      same visual weight. */}
                  <span className="bg-brand-ink text-brand-ink-foreground absolute top-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase">
                    {item.tag}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------- CTA FOOTER */}
        <section className="bg-brand-ink text-brand-ink-foreground relative overflow-hidden px-6 py-24 text-center sm:py-28">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 size-[560px] max-w-none -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,var(--color-brand-lime)_0%,transparent_70%)] opacity-30"
          />
          <div className="relative">
            <h2 className="font-heading text-[clamp(2.5rem,6vw,4.75rem)] leading-tight tracking-wide text-balance uppercase">
              Ready for{" "}
              <em className="text-brand-lime font-serif text-[1.05em] normal-case italic">
                your
              </em>{" "}
              aura?
            </h2>
            <PrimaryCta className="mt-7" />
          </div>
        </section>
      </main>

      {/* Not in the v5 file, kept because it is the only place the one-profile
          rule is stated on the landing page. */}
      <footer className="border-border border-t py-8">
        <p className="text-muted-foreground mx-auto max-w-6xl px-6 text-center text-sm text-pretty">
          AURA — one profile per account. Update your display name and two AURA
          reference photos to regenerate your studio-style portrait anytime.
        </p>
      </footer>
    </div>
  );
}
