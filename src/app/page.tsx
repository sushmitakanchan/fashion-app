import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { PaletteIcon, ShoppingBagIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Marquee } from "@/components/ui/marquee";
import { ModeToggle } from "@/components/mode-toggle";
import { NewsletterForm } from "@/components/forms/newsletter-form";

const techStack = [
  "Next.js 16",
  "React 19",
  "Tailwind v4",
  "shadcn/ui",
  "Magic UI",
  "Motion",
  "Zustand",
  "TanStack Query",
  "React Hook Form",
  "Zod",
  "Prisma",
  "Neon",
  "Clerk",
  "OpenAI",
  "Cloudinary",
];

const brands = [
  "ATELIER",
  "NORD",
  "MAISON",
  "VELVET",
  "LUMEN",
  "AURA",
  "ÉCLAT",
  "STUDIO",
];

const features = [
  {
    icon: SparklesIcon,
    title: "AI stylist",
    description:
      "Outfit recommendations powered by OpenAI, wired through a Clerk-protected API route.",
  },
  {
    icon: ShoppingBagIcon,
    title: "Persistent cart",
    description:
      "A Zustand store with localStorage persistence keeps the bag in sync across sessions.",
  },
  {
    icon: PaletteIcon,
    title: "Media pipeline",
    description:
      "Cloudinary handles uploads and on-the-fly transforms for every product image.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <ShoppingBagIcon className="size-5" />
            Fashion App
          </span>
          <nav className="flex items-center gap-2">
            <ModeToggle />
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm">Sign up</Button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-24 text-center">
          <Badge variant="secondary" className="mb-6">
            <SparklesIcon /> Your digital twin, fitted to you
          </Badge>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Meet AURA — the digital twin behind your perfect fit
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed text-pretty italic">
            Share your measurements and a few reference photos, and AURA builds a
            3D twin with your proportions — so clothes are fitted to your body,
            not a generic size chart.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            {/* /aura is protected, so signed-out visitors get the sign-up modal
                here rather than bouncing off the page's redirect — they sign in
                before any profile is created. */}
            <Show when="signed-in">
              {/* Renders an <a>, so tell Base UI this isn't a native button —
                  otherwise it warns and drops correct link semantics. */}
              <Button size="lg" nativeButton={false} render={<Link href="/aura" />}>
                <SparklesIcon />
                Generate your AURA
              </Button>
            </Show>
            <Show when="signed-out">
              {/* Sign up, then land straight on the protected AURA page rather
                  than back here — the CTA leads into profile creation. */}
              <SignUpButton mode="modal" forceRedirectUrl="/aura">
                <Button size="lg">
                  <SparklesIcon />
                  Sign up to create your AURA
                </Button>
              </SignUpButton>
            </Show>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            Your AURA profile is tied to your account, so you&apos;ll sign in
            first.
          </p>
        </section>

        <section className="border-y bg-muted/30 py-6">
          <Marquee pauseOnHover className="[--duration:30s]">
            {brands.map((brand) => (
              <span
                key={brand}
                className="text-muted-foreground mx-8 text-xl font-medium tracking-[0.3em]"
              >
                {brand}
              </span>
            ))}
          </Marquee>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="text-muted-foreground size-6" />
                <CardTitle className="mt-2">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>Join the waitlist</CardTitle>
              <CardDescription>
                A React Hook Form + Zod form with a Sonner toast on submit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NewsletterForm />
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6">
          <div className="flex flex-wrap justify-center gap-2">
            {techStack.map((tech) => (
              <Badge key={tech} variant="outline">
                {tech}
              </Badge>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            Edit{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              src/app/page.tsx
            </code>{" "}
            to get started.
          </p>
        </div>
      </footer>
    </div>
  );
}
