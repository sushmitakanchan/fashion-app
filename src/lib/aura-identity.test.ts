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

  // DEMO RELAXATION: with no Google account but a verified email, the keyless
  // fallback admits the user (no Google name). Restore the strict refusal once
  // Clerk has real keys + Google enabled.
  it("admits a verified email even without a linked Google account", () => {
    expect(
      admitGoogleAuraIdentity({
        ...googleIdentity,
        externalAccounts: [{ ...googleIdentity.externalAccounts[0], provider: "github" }],
      }),
    ).toEqual({
      ok: true,
      email: "ada@example.com",
      googleName: "",
    });
  });

  it("refuses a user with no verified email at all", () => {
    expect(
      admitGoogleAuraIdentity({
        ...googleIdentity,
        externalAccounts: [{ ...googleIdentity.externalAccounts[0], provider: "github" }],
        emailAddresses: [
          { ...googleIdentity.emailAddresses[0], verification: { status: "unverified" } },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "Verify your email before saving an AURA profile.",
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
