/**
 * Provenance model for the in-composer try-on garment.
 *
 * A garment in the composer is a tagged union with an explicit `kind`: an
 * uploaded file or a scraped link. The explicit `kind` lives *only* in memory —
 * it keeps illegal mixes out of state (e.g. an "upload" carrying a dangling
 * source URL) — and collapses to the **inferred** discriminator at the save
 * boundary, where a source with `url`/`site` is a link and one without is an
 * upload.
 *
 * Like {@link import("./aura-try-on-state").tryOnPresentation}, this is the pure
 * core pulled out of the React shell: the projections below map the tagged union
 * down to the two flat shapes the flow needs — a provenance-blind try-on garment
 * and a provenance-carrying save source — so both are exercisable without a DOM.
 * The try-on projection deliberately strips provenance: both arms enter the
 * request identically, keeping the try-on contract provenance-free.
 */

import { GARMENT_NAME_MAX_LENGTH } from "./validations";

export type GarmentSite = "pinterest" | "myntra";

/** A garment the user attached from their device: the real `File` (encoded at
 * generate/save time) and an object URL used only for its thumbnail. */
export type Upload = {
  kind: "upload";
  id: string;
  name: string;
  file: File;
  previewUrl: string;
};

/** A garment scraped from a pasted Pinterest/Myntra link: the returned image is
 * a data URI (its own `previewUrl`, so no object URL is needed), and the pasted
 * `sourceUrl`/`site` are retained provenance carried through to the save. */
export type Link = {
  kind: "link";
  id: string;
  name: string;
  scrapedImage: string;
  previewUrl: string;
  sourceUrl: string;
  site: GarmentSite;
};

export type Attachment = Upload | Link;

/** The provenance-blind shape a garment enters the try-on request as. */
export type TryOnGarment = { image: string; name: string };

/** The per-source shape a garment is saved as. Provenance is carried but not as
 * an explicit discriminator — `url`/`site` are present only on the link arm and
 * are what the save boundary infers `kind` from. */
export type SaveSource =
  | { image: string; name: string }
  | { image: string; name: string; url: string; site: GarmentSite };

/**
 * The garment's raw, un-encoded image bytes — the single source of truth each
 * projection re-encodes from. An upload carries a `File`; a link carries its
 * scraped data URI. Both are shapes {@link import("./aura").downscalePhoto}
 * accepts, so a caller can downscale either arm without knowing the `kind`.
 */
export function rawImageOf(source: Attachment): File | string {
  return source.kind === "link" ? source.scrapedImage : source.file;
}

/**
 * Resolve a scraped link garment's display name. The scrape route echoes the
 * page's title when it has a usable one, else the pasted link's host — so a
 * `scrapedName` equal to `host` is the route's "no title" fallback signal, and
 * we disambiguate repeat links from the same host with a running `index`. The
 * result is capped at {@link GARMENT_NAME_MAX_LENGTH}, the same length the save
 * schema enforces, so it can never be built longer than that boundary accepts.
 */
export function linkGarmentName(
  scrapedName: string,
  host: string,
  index: number,
): string {
  const trimmed = scrapedName.trim();
  const name = trimmed && trimmed !== host ? trimmed : `${host} ${index}`;
  return name.slice(0, GARMENT_NAME_MAX_LENGTH);
}

/**
 * Project a garment down to the try-on request shape. `image` is the already
 * downscaled data URI; both arms collapse to `{ image, name }`, so no provenance
 * reaches the try-on route.
 */
export function toTryOnGarment(
  source: Attachment,
  image: string,
): TryOnGarment {
  return { image, name: source.name };
}

/**
 * Project a garment down to the save-source shape. `image` is the re-encoded
 * data URI. An upload carries only `{ image, name }`; a link additionally
 * carries `{ url, site }`, the provenance the save boundary re-infers `kind`
 * from.
 */
export function toSaveSource(source: Attachment, image: string): SaveSource {
  if (source.kind === "link") {
    return { image, name: source.name, url: source.sourceUrl, site: source.site };
  }
  return { image, name: source.name };
}

/**
 * The inference rule the save boundary applies: a source carrying `url`/`site`
 * is a link, one without is an upload. No `kind` is written to the wire — this
 * re-derives it from a {@link SaveSource}.
 */
export function inferKind(source: SaveSource): "upload" | "link" {
  return "url" in source ? "link" : "upload";
}
