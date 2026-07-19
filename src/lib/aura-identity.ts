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
  const googleAccounts = user.externalAccounts.filter(
    (account) => account.provider === "google",
  );
  if (googleAccounts.length === 0) {
    return {
      ok: false,
      error: "Your AURA profile requires a linked Google account.",
    };
  }

  const admittedGoogleAccount = googleAccounts.find(
    (account) =>
      account.verification?.status === "verified" &&
      user.emailAddresses.some(
        (email) =>
          normalizeEmail(email.emailAddress) === normalizeEmail(account.emailAddress) &&
          email.verification?.status === "verified",
      ),
  );
  if (!admittedGoogleAccount) {
    return {
      ok: false,
      error: "Verify your Google email before saving an AURA profile.",
    };
  }

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
