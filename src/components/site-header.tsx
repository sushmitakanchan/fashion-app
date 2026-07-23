"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/mode-toggle";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";

/**
 * The routes worth a persistent entry point. Every one of these was previously
 * reachable only from inside another flow — `/colors` had no inbound link at
 * all — so this list is the app's information architecture, not decoration.
 */
const NAV = [
  { href: "/aura", label: "Profile" },
  { href: "/aura/style-book", label: "Style Book" },
  { href: "/colors", label: "Colours" },
] as const;

function isActive(pathname: string, href: string) {
  // `/aura` must not light up for `/aura/style-book`, but `/aura/style-book`
  // should stay lit on any future child route beneath it.
  return href === "/aura"
    ? pathname === "/aura"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only rounded-lg px-4 py-2 text-sm font-semibold focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-4 focus-visible:z-50 focus-visible:ring-3"
      >
        Skip to main content
      </a>

      {/* Wraps rather than scrolls: the wordmark and account controls hold the
          first row, and the nav drops to a full-width second row below `sm`.
          Laid out flat instead of as two conditionally-rendered copies, so the
          links appear exactly once in the accessibility tree at every width. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-6">
        <Link
          href="/"
          translate="no"
          className="font-heading focus-visible:ring-ring order-1 mr-auto rounded-sm px-1 text-xl tracking-wide touch-manipulation uppercase focus-visible:ring-3 focus-visible:outline-none"
        >
          AURA
        </Link>

        <nav
          aria-label="Main"
          className="order-3 -mx-1 flex w-full items-center overflow-x-auto px-1 pb-1 sm:order-2 sm:mx-0 sm:w-auto sm:px-0 sm:pb-0"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring rounded-lg px-2.5 py-2 text-xs font-semibold tracking-wider whitespace-nowrap touch-manipulation uppercase transition-colors focus-visible:ring-3 focus-visible:outline-none sm:px-3 sm:text-[13px]",
                  // The active item is marked by colour *and* an underline.
                  // v5 separates them by opacity alone, which lands at 4.05:1
                  // and leaves the state invisible to anyone who can't
                  // resolve the tint.
                  active
                    ? "text-foreground decoration-primary underline decoration-2 underline-offset-8"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-2 flex items-center gap-1 sm:order-3 sm:gap-2">
          <ModeToggle />
          <Show when="signed-out">
            <GoogleAuthButton
              size="sm"
              variant="cta-flat"
              className="rounded-full"
            />
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
