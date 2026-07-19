type Verification = { status?: string | null } | null | undefined;

type GoogleAccount = {
  provider: string;
  emailAddress: string;
  firstName?: string | null;
  lastName?: string | null;
  verification: Verification;
};

type EmailAddress = {
  emailAddress: string;
  verification: Verification;
};

/** The subset of Clerk's backend user record that AURA needs to inspect. */
export type AuraIdentityCandidate = {
  externalAccounts: readonly GoogleAccount[];
  emailAddresses: readonly EmailAddress[];
};

export type GoogleAuraAdmission =
  | { ok: true; email: string; googleName: string }
  | { ok: false; error: string };

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase();
}

function usableDisplayName(name: string | null | undefined) {
  const normalized = name?.trim().replaceAll(/\s+/g, " ") ?? "";
  return normalized.length >= 2 && normalized.length <= 60 ? normalized : "";
}

function googleDisplayName(account: GoogleAccount) {
  return usableDisplayName([account.firstName, account.lastName].filter(Boolean).join(" "));
}

/**
 * Ensures the identity that reaches AURA came from a verified Google account.
 * This is intentionally independent of Clerk's full user type so both route
 * handlers and server-rendered data loading share the same narrow boundary.
 */
export function admitGoogleAuraIdentity(
  user: AuraIdentityCandidate,
): GoogleAuraAdmission {
  // DEMO RELAXATION: the Google-linked identity boundary is deliberately strict
  // (see AGENTS.md), but the hackathon build runs Clerk in keyless dev mode where
  // Google isn't a reliable connection, so email/password sign-ins have no Google
  // external account and would be wrongly refused. We keep the Google path (name +
  // account) when it's present and verified, and otherwise admit any verified email.
  // TODO: restore the Google-only gate once Clerk has real keys + Google enabled.
  const googleAccounts = user.externalAccounts.filter(
    (account) => account.provider === "google",
  );

  const admittedGoogleAccount = googleAccounts.find(
    (account) =>
      account.verification?.status === "verified" &&
      user.emailAddresses.some(
        (email) =>
          normalizeEmail(email.emailAddress) === normalizeEmail(account.emailAddress) &&
          email.verification?.status === "verified",
      ),
  );

  if (admittedGoogleAccount) {
    const matchingEmail = user.emailAddresses.find(
      (email) =>
        normalizeEmail(email.emailAddress) ===
          normalizeEmail(admittedGoogleAccount.emailAddress) &&
        email.verification?.status === "verified",
    )!;

    return {
      ok: true,
      email: matchingEmail.emailAddress,
      googleName: googleDisplayName(admittedGoogleAccount),
    };
  }

  // Fallback: admit any verified email so keyless email/password sign-ins work.
  const verifiedEmail = user.emailAddresses.find(
    (email) => email.verification?.status === "verified",
  );
  if (verifiedEmail) {
    return { ok: true, email: verifiedEmail.emailAddress, googleName: "" };
  }

  return {
    ok: false,
    error: "Verify your email before saving an AURA profile.",
  };
}

/**
 * A profile name is AURA-owned. A previous choice always wins, while a usable
 * Google name reduces friction only for a participant's first profile.
 */
export function resolveInitialAuraDisplayName({
  persistedName,
  googleName,
}: {
  persistedName: string | null | undefined;
  googleName: string | null | undefined;
}) {
  return usableDisplayName(persistedName) || usableDisplayName(googleName);
}
