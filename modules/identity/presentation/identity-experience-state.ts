export type IdentityGateOutcome =
  "permitted" | "unauthenticated" | "access_unavailable" | "service_unavailable";

/** Maps only the public identity endpoint status; response bodies and provider details stay private. */
export function identityGateOutcome(status: number): IdentityGateOutcome {
  if (status === 200) return "permitted";
  if (status === 401) return "unauthenticated";
  if (status === 403 || status === 404) return "access_unavailable";
  return "service_unavailable";
}

export function mayRenderProtectedShell(
  outcome: IdentityGateOutcome | "checking" | "checking_identity",
): boolean {
  return outcome === "permitted";
}

export async function checkIdentity(
  fetchIdentity: () => Promise<{ readonly status: number }>,
): Promise<IdentityGateOutcome> {
  try {
    const response = await fetchIdentity();
    return identityGateOutcome(response.status);
  } catch {
    return "service_unavailable";
  }
}

export async function resolveSessionIdentity(
  hasSession: boolean,
  verify: () => Promise<IdentityGateOutcome>,
): Promise<IdentityGateOutcome> {
  if (!hasSession) return "unauthenticated";
  try {
    return await verify();
  } catch {
    return "service_unavailable";
  }
}

type SignInResult = {
  readonly data: { readonly session: unknown | null };
  readonly error: unknown | null;
};

/** Returns no provider error details to the presentation layer. */
export async function signInWithEmailPassword(
  signIn: (credentials: { email: string; password: string }) => Promise<SignInResult>,
  email: string,
  password: string,
): Promise<boolean> {
  try {
    const result = await signIn({ email, password });
    return result.error === null && Boolean(result.data.session);
  } catch {
    return false;
  }
}

export type SignInAndVerifyOutcome<T = IdentityGateOutcome> =
  | { readonly kind: "sign_in_failed" }
  | { readonly kind: "verification_failed" }
  | { readonly kind: "stale" }
  | { readonly kind: "identity"; readonly outcome: T };

export async function signInAndVerify<T>(
  signIn: (credentials: { email: string; password: string }) => Promise<SignInResult>,
  verify: () => Promise<T>,
  email: string,
  password: string,
  isCurrent: () => boolean = () => true,
): Promise<SignInAndVerifyOutcome<T>> {
  const accepted = await signInWithEmailPassword(signIn, email, password);
  if (!accepted) return { kind: "sign_in_failed" };
  if (!isCurrent()) return { kind: "stale" };
  try {
    return { kind: "identity", outcome: await verify() };
  } catch {
    return { kind: "verification_failed" };
  }
}

export function isCurrentIdentityRequest(request: number, currentRequest: number): boolean {
  return request === currentRequest;
}

export async function signOutSafely(
  signOut: () => Promise<{ readonly error: unknown | null }>,
): Promise<"signed_out" | "service_unavailable"> {
  try {
    const result = await signOut();
    return result.error === null ? "signed_out" : "service_unavailable";
  } catch {
    return "service_unavailable";
  }
}
