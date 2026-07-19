import { describe, expect, it } from "bun:test";

import { cloudinaryThumbUrl } from "./cloudinary-url";

const SECURE_URL =
  "https://res.cloudinary.com/demo/image/upload/v1700000000/fashion-app/style-book/user_1/abc123.jpg";

describe("cloudinaryThumbUrl", () => {
  it("inserts a fill-crop transform directly after /upload/", () => {
    expect(cloudinaryThumbUrl(SECURE_URL, { width: 600, height: 800 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_600,h_800,f_auto,q_auto,dpr_auto/v1700000000/fashion-app/style-book/user_1/abc123.jpg",
    );
  });

  it("omits the height segment when no height is given", () => {
    const result = cloudinaryThumbUrl(SECURE_URL, { width: 400 });
    expect(result).toContain("/upload/c_fill,g_auto,w_400,f_auto,q_auto,dpr_auto/");
    expect(result).not.toContain("h_");
  });

  it("preserves the version and asset path after the transform", () => {
    expect(cloudinaryThumbUrl(SECURE_URL, { width: 600 })).toContain(
      "/v1700000000/fashion-app/style-book/user_1/abc123.jpg",
    );
  });

  it("returns a non-Cloudinary URL untouched", () => {
    const foreign = "https://example.com/some/other/path.jpg";
    expect(cloudinaryThumbUrl(foreign, { width: 600, height: 800 })).toBe(
      foreign,
    );
  });
});
