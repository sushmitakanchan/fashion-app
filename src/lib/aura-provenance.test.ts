import { describe, expect, it } from "bun:test";

import {
  inferKind,
  rawImageOf,
  toSaveSource,
  toTryOnGarment,
  type Link,
  type Upload,
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
});

describe("rawImageOf", () => {
  it("returns the File for an upload", () => {
    expect(rawImageOf(upload)).toBe(upload.file);
  });

  it("returns the scraped data URI for a link", () => {
    expect(rawImageOf(link)).toBe(link.scrapedImage);
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
