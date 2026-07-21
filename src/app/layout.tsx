import type { Metadata, Viewport } from "next";
import { Anton, Archivo, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// v5's three faces, self-hosted through next/font rather than the mockup's
// Google Fonts <link>: no third-party connection on first paint, and the
// fallback is size-adjusted so swapping in the real cut costs no layout shift.
const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Anton is single-weight and uppercase-only by design. Headings, nothing else.
const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

// The italic phrase that breaks up each Anton heading ("three easy steps",
// "your portrait"). `italic` ships the real cut, not a synthesised slant.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AURA | Studio-style portraits from two photos",
  description:
    "Create an AURA portrait from a full-body, front-facing photo and a face close-up.",
};

// Matches --background in each mode, so the mobile browser chrome blends into
// the page instead of banding against it.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDF3F6" },
    { media: "(prefers-color-scheme: dark)", color: "#14110F" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${archivo.variable} ${anton.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="flex min-h-full flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <SiteHeader />
              {/* The skip-link target. `tabIndex={-1}` makes it focusable
                  programmatically so the jump actually moves the caret, not
                  just the scroll position. */}
              <div
                id="main-content"
                tabIndex={-1}
                className="flex flex-1 flex-col scroll-mt-20 outline-none"
              >
                {children}
              </div>
            </QueryProvider>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
