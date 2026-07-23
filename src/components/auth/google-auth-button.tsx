import * as React from "react";
import { SignInButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";

/**
 * Starts Clerk's sign-in-or-up flow. The pilot's Clerk Dashboard configuration
 * exposes Google as its only factor/provider; see `.env.example` for the
 * required instance setting that pairs with this intentionally simple entry.
 *
 * `cta` switches to the 3D action button for the landing's hero and footer;
 * `variant` styles the plain path (the header uses `cta-flat` for the constant
 * action colour without the 3D weight).
 */
export function GoogleAuthButton({
  size = "default",
  className,
  cta = false,
  variant,
}: {
  size?: "default" | "sm" | "lg";
  className?: string;
  cta?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  return (
    <SignInButton mode="redirect" forceRedirectUrl="/aura" withSignUp>
      {cta ? (
        <CtaButton size={size} className={className}>
          Continue with Google
        </CtaButton>
      ) : (
        <Button size={size} variant={variant} className={className}>
          Continue with Google
        </Button>
      )}
    </SignInButton>
  );
}
