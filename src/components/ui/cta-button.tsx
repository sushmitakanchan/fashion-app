import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The primary call-to-action, everywhere: the 3D neon-pink-on-lime button.
 *
 * A thin wrapper over `Button` that pins the `cta` variant and the CTA's own
 * sizing. Sizing lives here as a `className` (not the `size` prop) on purpose —
 * `className` is merged last, so its padding/radius win over any `size` the
 * caller passes; the `cta` variant's 3D face is unaffected either way. The
 * `render` prop passes straight through, so a CTA can still be an `<a>`/`Link`.
 */
export function CtaButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      variant="cta"
      className={cn("h-auto rounded-full px-7 py-3.5 text-sm", className)}
    />
  );
}
