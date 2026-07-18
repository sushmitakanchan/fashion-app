import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { CameraIcon, RulerIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";

const steps = [
  {
    icon: RulerIcon,
    title: "Your measurements",
    description:
      "Height, weight, age, and body type — in metric or imperial. AURA stores the metric values.",
  },
  {
    icon: CameraIcon,
    title: "Five reference photos",
    description:
      "Front, left, right, close-up, and back, so your twin reflects your real proportions.",
  },
  {
    icon: SparklesIcon,
    title: "Your 3D twin",
    description:
      "AURA builds a twin from your profile, ready for clothes to be fitted to you.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <SparklesIcon className="size-5" />
            AURA
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

        <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 pb-24 md:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.title}>
              <CardHeader>
                <step.icon className="text-muted-foreground size-6" />
                <CardTitle className="mt-2">{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto w-full max-w-6xl px-6 text-center">
          <p className="text-muted-foreground text-sm">
            AURA — one profile per account. You can regenerate your twin at any
            time.
          </p>
        </div>
      </footer>
    </div>
  );
}
