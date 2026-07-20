import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { BoxIcon, CameraIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <main className="flex-1">
        {/* v5's hero sits on a pink radial that fades to the page. It is
            decorative and sits behind text that already clears 17:1 on the
            palest stop, so it needs no contrast allowance of its own. */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center bg-[radial-gradient(ellipse_80%_65%_at_50%_0%,var(--color-accent)_0%,transparent_70%)] px-6 py-24 text-center">
          <Badge variant="secondary" className="mb-6">
            <SparklesIcon /> Two photos, your AURA portrait
          </Badge>
          <h1 className="font-heading max-w-3xl text-4xl tracking-wide text-balance uppercase sm:text-6xl">
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
