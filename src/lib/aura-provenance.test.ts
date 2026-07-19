import { describe, expect, it } from "bun:test";

import {
  inferKind,
  linkGarmentName,
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

describe("linkGarmentName", () => {
  it("uses the scraped title when the page yielded one", () => {
    expect(
      linkGarmentName(
        "Ribbed cotton tank",
        "https://www.pinterest.com/pin/123/",
        1,
      ),
    ).toBe("Ribbed cotton tank");
  });

  it("trims the scraped title", () => {
    expect(
      linkGarmentName("  Linen shirt  ", "https://www.myntra.com/x/999/buy", 2),
    ).toBe("Linen shirt");
  });

  it("falls back to host + index when the route returned the bare host", () => {
    // The scrape route collapses a missing title to the URL host, so a name
    // equal to the host is the "no title" case the index disambiguates.
    expect(
      linkGarmentName(
        "www.myntra.com",
        "https://www.myntra.com/x/999/buy",
        3,
      ),
    ).toBe("www.myntra.com 3");
  });

  it("falls back to host + index when no name was returned", () => {
    expect(
      linkGarmentName(null, "https://www.pinterest.com/pin/7/", 4),
    ).toBe("www.pinterest.com 4");
    expect(
      linkGarmentName(undefined, "https://www.pinterest.com/pin/7/", 5),
    ).toBe("www.pinterest.com 5");
  });

  it("keeps two title-less garments from the same host distinguishable", () => {
    const url = "https://www.myntra.com/x/1/buy";
    expect(linkGarmentName("", url, 1)).toBe("www.myntra.com 1");
    expect(linkGarmentName("", url, 2)).toBe("www.myntra.com 2");
  });
});
