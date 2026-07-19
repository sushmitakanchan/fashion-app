import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { BoxIcon, CameraIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";

const steps = [
  {
    icon: CameraIcon,
    title: "Two AURA reference photos",
    description:
      "A full-body, front-facing photo and a face close-up create your AURA portrait.",
  },
  {
    icon: BoxIcon,
    title: "Optional 3D avatar photos",
    description:
      "Left, right, and back photos are kept for a future 3D avatar. Coming soon.",
  },
  {
    icon: SparklesIcon,
    title: "Your AURA portrait",
    description:
      "Receive a polished, studio-style portrait created from your two reference photos.",
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
              <GoogleAuthButton size="sm" />
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
            <SparklesIcon /> Two photos, your AURA portrait
          </Badge>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Your studio-style portrait starts with AURA
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed text-pretty italic">
            Add a full-body, front-facing photo and a face close-up to create a
            polished, studio-style AURA portrait. Optional left, right, and back
            photos are kept for a future 3D avatar.
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
                Create your AURA portrait
              </Button>
            </Show>
            <Show when="signed-out">
              {/* OAuth account discovery handles sign-in and first-time sign-up
                  through this single Google-only entry point. */}
              <GoogleAuthButton size="lg" />
            </Show>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            Your AURA profile is tied to your verified Google account.
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
            AURA — one profile per account. Update your display name and two
            AURA reference photos to regenerate your studio-style portrait
            anytime.
          </p>
        </div>
      </footer>
    </div>
  );
}
