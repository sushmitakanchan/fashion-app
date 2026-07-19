import { describe, expect, it } from "bun:test";

import {
  admitGoogleAuraIdentity,
  resolveInitialAuraDisplayName,
} from "./aura-identity";

const googleIdentity = {
  externalAccounts: [
    {
      provider: "google",
      emailAddress: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      verification: { status: "verified" },
    },
  ],
  emailAddresses: [
    {
      emailAddress: "ada@example.com",
      verification: { status: "verified" },
    },
  ],
};

describe("Google AURA identity boundary", () => {
  it("admits a verified Google account with its matching verified email", () => {
    expect(admitGoogleAuraIdentity(googleIdentity)).toEqual({
      ok: true,
      email: "ada@example.com",
      googleName: "Ada Lovelace",
    });
  });

  it("refuses a user without a linked Google OAuth account", () => {
    expect(
      admitGoogleAuraIdentity({
        ...googleIdentity,
        externalAccounts: [{ ...googleIdentity.externalAccounts[0], provider: "github" }],
      }),
    ).toEqual({
      ok: false,
      error: "Your AURA profile requires a linked Google account.",
    });
  });

  it("refuses a linked Google account whose email has not been verified", () => {
    expect(
      admitGoogleAuraIdentity({
        ...googleIdentity,
        emailAddresses: [
          { ...googleIdentity.emailAddresses[0], verification: { status: "unverified" } },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "Verify your Google email before saving an AURA profile.",
    });
  });

  it("admits a verified Google account even when an earlier linked one is unverified", () => {
    expect(
      admitGoogleAuraIdentity({
        ...googleIdentity,
        externalAccounts: [
          {
            ...googleIdentity.externalAccounts[0],
            emailAddress: "unverified@example.com",
            verification: { status: "unverified" },
          },
          googleIdentity.externalAccounts[0],
        ],
      }),
    ).toEqual({
      ok: true,
      email: "ada@example.com",
      googleName: "Ada Lovelace",
    });
  });
});

describe("initial AURA display name", () => {
  it("keeps an existing AURA-owned display name over the Google name", () => {
    expect(
      resolveInitialAuraDisplayName({
        persistedName: "Countess Ada",
        googleName: "Ada Lovelace",
      }),
    ).toBe("Countess Ada");
  });

  it("seeds a first profile with a usable Google-supplied name", () => {
    expect(
      resolveInitialAuraDisplayName({ persistedName: null, googleName: "Ada Lovelace" }),
    ).toBe("Ada Lovelace");
  });

  it("leaves the field empty when Google supplies no usable name", () => {
    expect(
      resolveInitialAuraDisplayName({ persistedName: null, googleName: " " }),
    ).toBe("");
  });
});
