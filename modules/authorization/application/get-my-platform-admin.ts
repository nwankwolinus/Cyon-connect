export interface TrustedAuthenticatedCaller {
  getAuthUserId(): Promise<string | null>;
}

export interface CurrentPlatformAdminReader {
  /** Evaluates only the current signed-in caller through the server's authenticated Supabase context. */
  isCurrentUserPlatformAdmin(): Promise<boolean>;
}

export type GetMyPlatformAdminResult =
  | { readonly kind: "permitted" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "access_denied" };

export function createGetMyPlatformAdmin(deps: {
  readonly authenticatedUser: TrustedAuthenticatedCaller;
  readonly reader: CurrentPlatformAdminReader;
}) {
  return async (): Promise<GetMyPlatformAdminResult> => {
    const authUserId = await deps.authenticatedUser.getAuthUserId();
    if (!authUserId) return { kind: "unauthenticated" };
    return (await deps.reader.isCurrentUserPlatformAdmin())
      ? { kind: "permitted" }
      : { kind: "access_denied" };
  };
}
