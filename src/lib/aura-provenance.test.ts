import { describe, expect, it } from "bun:test";

import {
  inferKind,
  linkGarmentName,
  rawImageOf,
  toSaveSource,
  toTryOnGarment,
  type Link,
  type Upload,
  type WardrobeSource,
} from "./aura-provenance";

const IMAGE = "data:image/jpeg;base64,AAAA";

const upload: Upload = {
  kind: "upload",
  id: "1",
  name: "Linen shirt",
  file: new File([new Uint8Array([1, 2, 3])], "shirt.png", {
    type: "image/png",
  }),
  previewUrl: "blob:preview-1",
};

const link: Link = {
  kind: "link",
  id: "2",
  name: "Ribbed tank",
  scrapedImage: "data:image/jpeg;base64,BBBB",
  previewUrl: "data:image/jpeg;base64,BBBB",
  sourceUrl: "https://www.pinterest.com/pin/123",
  site: "pinterest",
};

const wardrobe: WardrobeSource = {
  kind: "wardrobe",
  id: "wi_abc",
  wardrobeItemId: "wi_abc",
  name: "Charcoal blazer",
  previewUrl: "https://res.cloudinary.test/signed/wi_abc.jpg?token=xyz",
};

describe("toTryOnGarment", () => {
  it("projects an upload to a provenance-free { image, name }", () => {
    expect(toTryOnGarment(upload, IMAGE)).toEqual({
      image: IMAGE,
      name: "Linen shirt",
    });
  });

  it("projects a link to the same provenance-free { image, name }", () => {
    expect(toTryOnGarment(link, IMAGE)).toEqual({
      image: IMAGE,
      name: "Ribbed tank",
    });
  });

  it("projects a wardrobe source to { wardrobeItemId }, ignoring the image", () => {
    // No local bytes cross the wire for a wardrobe source: the server resolves
    // its authorized media and saved name from the id alone.
    expect(toTryOnGarment(wardrobe)).toEqual({ wardrobeItemId: "wi_abc" });
  });
});

describe("toSaveSource", () => {
  it("projects an upload to { image, name } with no provenance", () => {
    const source = toSaveSource(upload, IMAGE);
    expect(source).toEqual({ image: IMAGE, name: "Linen shirt" });
    expect(inferKind(source)).toBe("upload");
  });

  it("projects a link to { image, name, url, site }", () => {
    const source = toSaveSource(link, IMAGE);
    expect(source).toEqual({
      image: IMAGE,
      name: "Ribbed tank",
      url: "https://www.pinterest.com/pin/123",
      site: "pinterest",
    });
    expect(inferKind(source)).toBe("link");
  });

  it("projects a wardrobe source to a plain { image, name }, retaining no reference", () => {
    const source = toSaveSource(wardrobe, IMAGE);
    expect(source).toEqual({ image: IMAGE, name: "Charcoal blazer" });
    expect(inferKind(source)).toBe("upload");
  });
});

describe("rawImageOf", () => {
  it("returns the File for an upload", () => {
    expect(rawImageOf(upload)).toBe(upload.file);
  });

  it("returns the scraped data URI for a link", () => {
    expect(rawImageOf(link)).toBe(link.scrapedImage);
  });

  it("returns the signed delivery URL for a wardrobe source", () => {
    // downscalePhoto re-encodes a string source by fetching it, so a save
    // re-derives the wardrobe item's bytes from its authorized rendition.
    expect(rawImageOf(wardrobe)).toBe(wardrobe.previewUrl);
  });
});

describe("linkGarmentName", () => {
  it("uses the scraped title when the route returned one", () => {
    expect(linkGarmentName("Ribbed knit tank", "www.myntra.com", 1)).toBe(
      "Ribbed knit tank",
    );
  });

  it("falls back to host + running index when the title is just the host", () => {
    // The scrape route echoes `target.host` as the name when a page carries no
    // usable title, so a name equal to the host is the fallback signal.
    expect(linkGarmentName("www.pinterest.com", "www.pinterest.com", 2)).toBe(
      "www.pinterest.com 2",
    );
  });

  it("falls back to host + running index when the title is blank", () => {
    expect(linkGarmentName("  ", "assets.myntra.com", 3)).toBe(
      "assets.myntra.com 3",
    );
  });

  it("caps an over-long title at the shared 80-char garment-name limit", () => {
    const long = "A".repeat(120);
    expect(linkGarmentName(long, "www.pinterest.com", 1)).toBe("A".repeat(80));
  });
});

describe("inferKind", () => {
  it("infers a link from a save source carrying url/site", () => {
    expect(
      inferKind({
        image: IMAGE,
        name: "Ribbed tank",
        url: "https://www.myntra.com/p/1",
        site: "myntra",
      }),
    ).toBe("link");
  });

  it("infers an upload from a save source without url/site", () => {
    expect(inferKind({ image: IMAGE, name: "Linen shirt" })).toBe("upload");
  });
});
