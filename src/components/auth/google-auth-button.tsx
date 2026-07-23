import { SignInButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";

/**
 * Starts Clerk's sign-in-or-up flow. The pilot's Clerk Dashboard configuration
 * exposes Google as its only factor/provider; see `.env.example` for the
 * required instance setting that pairs with this intentionally simple entry.
 *
 * `cta` switches to the 3D action button for the landing's hero and footer;
 * the compact header entry stays the plain button.
 */
export function GoogleAuthButton({
  size = "default",
  className,
  cta = false,
}: {
  size?: "default" | "sm" | "lg";
  className?: string;
  cta?: boolean;
}) {
  const Comp = cta ? CtaButton : Button;
  return (
    <SignInButton mode="redirect" forceRedirectUrl="/aura" withSignUp>
      <Comp size={size} className={className}>
        Continue with Google
      </Comp>
    </SignInButton>
  );
}
