/**
 * PROTOTYPE — throwaway. Seeded, in-memory mock data for the Style Book design
 * prototype. Mirrors the data model pinned in the map's decisions (#79/#82):
 * a Saved Look owns a snapshotted portrait, the generated look, a derived
 * caption, and its Sources — each an upload OR a link (provenance inferred:
 * a `url`/`site` means it's a link source).
 *
 * Nothing here is real: images are inline SVG swatches so the prototype runs
 * fully offline with no Cloudinary / remote-host allowlist involved.
 */

export type Source =
  | { kind: "upload"; image: string; name: string }
  | { kind: "link"; image: string; name: string; url: string; site: string };

export type SavedLook = {
  id: string;
  lookUrl: string;
  portraitUrl: string;
  caption: string;
  sources: Source[];
  createdAt: string; // ISO
};

/** A labelled gradient swatch as a data-URI SVG — stands in for a real image. */
function swatch(label: string, from: string, to: string, tall = false): string {
  const w = 400;
  const h = tall ? 560 : 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <text x="50%" y="50%" fill="rgba(255,255,255,.92)" font-family="ui-sans-serif,system-ui" font-size="26" font-weight="600" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PORTRAIT = swatch("AURA portrait", "#6d28d9", "#0ea5e9", true);

/** The look currently on the try-on result stage (drives the save affordance). */
export const STAGE_LOOK = {
  lookUrl: swatch("Generated look", "#db2777", "#7c3aed", true),
  portraitUrl: PORTRAIT,
  caption: "Oversized wool coat + pleated trousers",
  sources: [
    {
      kind: "link",
      image: swatch("Coat", "#0f766e", "#22d3ee"),
      name: "Oversized wool coat",
      url: "https://www.pinterest.com/pin/1122334455",
      site: "pinterest.com",
    },
    {
      kind: "upload",
      image: swatch("Trousers", "#b45309", "#f59e0b"),
      name: "Pleated trousers",
    },
  ] as Source[],
};

export const SAVED_LOOKS: SavedLook[] = [
  {
    id: "1",
    lookUrl: swatch("Look 01", "#db2777", "#7c3aed", true),
    portraitUrl: PORTRAIT,
    caption: "Cropped leather jacket + slip dress",
    createdAt: "2026-07-18T14:20:00Z",
    sources: [
      {
        kind: "link",
        image: swatch("Jacket", "#7c3aed", "#db2777"),
        name: "Cropped leather jacket",
        url: "https://www.myntra.com/jackets/roadster/leather-9981",
        site: "myntra.com",
      },
      {
        kind: "upload",
        image: swatch("Slip dress", "#be123c", "#fb7185"),
        name: "Slip dress",
      },
    ],
  },
  {
    id: "2",
    lookUrl: swatch("Look 02", "#0ea5e9", "#14b8a6", true),
    portraitUrl: PORTRAIT,
    caption: "Linen shirt + wide trousers",
    createdAt: "2026-07-17T09:05:00Z",
    sources: [
      {
        kind: "link",
        image: swatch("Linen shirt", "#0ea5e9", "#22d3ee"),
        name: "Linen shirt",
        url: "https://www.pinterest.com/pin/5566778899",
        site: "pinterest.com",
      },
    ],
  },
  {
    id: "3",
    lookUrl: swatch("Look 03", "#f59e0b", "#ef4444", true),
    portraitUrl: PORTRAIT,
    caption: "Knit vest + poplin shirt + chinos",
    createdAt: "2026-07-15T18:42:00Z",
    sources: [
      { kind: "upload", image: swatch("Vest", "#f59e0b", "#fbbf24"), name: "Knit vest" },
      { kind: "upload", image: swatch("Shirt", "#65a30d", "#a3e635"), name: "Poplin shirt" },
      {
        kind: "link",
        image: swatch("Chinos", "#78716c", "#a8a29e"),
        name: "Chinos",
        url: "https://www.myntra.com/trousers/levis/chinos-2200",
        site: "myntra.com",
      },
    ],
  },
  {
    id: "4",
    lookUrl: swatch("Look 04", "#7c3aed", "#2563eb", true),
    portraitUrl: PORTRAIT,
    caption: "Trench coat + turtleneck",
    createdAt: "2026-07-12T11:30:00Z",
    sources: [
      {
        kind: "link",
        image: swatch("Trench", "#57534e", "#a8a29e"),
        name: "Trench coat",
        url: "https://www.pinterest.com/pin/1029384756",
        site: "pinterest.com",
      },
      { kind: "upload", image: swatch("Turtleneck", "#1e293b", "#475569"), name: "Turtleneck" },
    ],
  },
  {
    id: "5",
    lookUrl: swatch("Look 05", "#0891b2", "#4f46e5", true),
    portraitUrl: PORTRAIT,
    caption: "Denim jacket + tee",
    createdAt: "2026-07-09T16:12:00Z",
    sources: [
      { kind: "upload", image: swatch("Denim", "#2563eb", "#60a5fa"), name: "Denim jacket" },
    ],
  },
];

export function sourceCount(n: number): string {
  return `${n} source${n === 1 ? "" : "s"}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
