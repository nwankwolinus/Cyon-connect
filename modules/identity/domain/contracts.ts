/** Persisted vocabulary currently defined by the Sprint 1B.1 identity migration. */
export const ORG_UNIT_TYPES = ["archdiocese", "deanery", "parish"] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

/** Membership lifecycle vocabulary; this is independent of account status. */
export const MEMBERSHIP_STATUSES = [
  "pending",
  "active",
  "inactive",
  "suspended",
  "archived",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Account lifecycle vocabulary; no transition or access semantics are implied here. */
export const ACCOUNT_STATUSES = [
  "pending_activation",
  "active",
  "suspended",
  "deactivated",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Domain-facing reference to an organisation unit, not a persistence row. */
export interface OrgUnitReference {
  readonly id: string;
  readonly type: OrgUnitType;
}

/** The current schema constrains a member's home unit to a parish. */
export type ParishReference = OrgUnitReference & { readonly type: "parish" };

/** Identity-facing member reference; omits persistence-only columns and timestamps. */
export interface MemberIdentityReference {
  readonly id: string;
  readonly homeParish: ParishReference;
  readonly membershipStatus: MembershipStatus;
}

/** Identity link for one account, auth identity, and member; not an account workflow. */
export interface UserAccountIdentityReference {
  readonly id: string;
  readonly authUserId: string;
  readonly memberId: string;
  readonly accountStatus: AccountStatus;
}
