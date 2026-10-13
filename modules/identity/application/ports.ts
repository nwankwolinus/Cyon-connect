import type {
  MemberIdentityReference,
  UserAccountIdentityReference,
} from "@/modules/identity/domain/contracts";

/** Supplies an authenticated identity established by the trusted caller boundary. */
export interface TrustedAuthenticatedUser {
  getAuthUserId(): Promise<string | null>;
}

/** Missing links are reported without exposing persistence rows or personal data. */
export type IdentityContextLookup =
  | { readonly kind: "access_denied" }
  | {
      readonly kind: "found";
      readonly account: UserAccountIdentityReference;
      readonly member: MemberIdentityReference;
    }
  | {
      readonly kind:
        "missing_account" | "missing_member" | "missing_org_unit" | "inconsistent_links";
    };

/** Application-owned read port; an infrastructure adapter may implement it in a later increment. */
export interface IdentityContextReader {
  findByAuthUserId(authUserId: string): Promise<IdentityContextLookup>;
}
