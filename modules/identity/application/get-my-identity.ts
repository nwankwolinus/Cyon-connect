import type { OrgUnitType } from "@/modules/identity/domain/contracts";
import type { IdentityContextReader, TrustedAuthenticatedUser } from "./ports";

export interface MyIdentityContext {
  readonly account: {
    readonly id: string;
    readonly status: "active";
  };
  readonly member: {
    readonly id: string;
    readonly status: "active";
  };
  readonly homeOrganization: {
    readonly id: string;
    readonly type: OrgUnitType;
  };
}

export type GetMyIdentityResult =
  | { readonly kind: "permitted"; readonly identity: MyIdentityContext }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "access_denied" }
  | { readonly kind: "identity_unavailable" };

export interface GetMyIdentityDependencies {
  readonly authenticatedUser: TrustedAuthenticatedUser;
  readonly identityContextReader: IdentityContextReader;
}

export type GetMyIdentity = () => Promise<GetMyIdentityResult>;

/**
 * Read-only use case for the caller's own identity context. The caller identity must come from
 * a trusted authentication boundary; request-supplied user IDs must never be wired here.
 */
export function createGetMyIdentity(deps: GetMyIdentityDependencies): GetMyIdentity {
  return async () => {
    const authUserId = await deps.authenticatedUser.getAuthUserId();
    if (!authUserId) return { kind: "unauthenticated" };

    const lookup = await deps.identityContextReader.findByAuthUserId(authUserId);
    if (lookup.kind === "access_denied") return { kind: "access_denied" };
    if (lookup.kind !== "found") return { kind: "identity_unavailable" };

    const { account, member } = lookup;
    if (account.authUserId !== authUserId || account.memberId !== member.id) {
      return { kind: "identity_unavailable" };
    }

    if (account.accountStatus !== "active" || member.membershipStatus !== "active") {
      return { kind: "access_denied" };
    }

    return {
      kind: "permitted",
      identity: {
        account: { id: account.id, status: "active" },
        member: { id: member.id, status: "active" },
        homeOrganization: { id: member.homeParish.id, type: member.homeParish.type },
      },
    };
  };
}
