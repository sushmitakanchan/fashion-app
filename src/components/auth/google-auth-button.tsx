import { SignInButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

/**
 * Starts Clerk's sign-in-or-up flow. The pilot's Clerk Dashboard configuration
 * exposes Google as its only factor/provider; see `.env.example` for the
 * required instance setting that pairs with this intentionally simple entry.
 */
export function GoogleAuthButton({
  size = "default",
  className,
}: {
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <SignInButton mode="redirect" forceRedirectUrl="/aura" withSignUp>
      <Button size={size} className={className}>
        Continue with Google
      </Button>
    </SignInButton>
  );
}
