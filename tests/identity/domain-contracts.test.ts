import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUSES,
  MEMBERSHIP_STATUSES,
  ORG_UNIT_TYPES,
  type MemberIdentityReference,
  type UserAccountIdentityReference,
} from "@/modules/identity/domain/contracts";

describe("identity domain contract vocabulary", () => {
  it("matches the organisation-unit types in the identity schema", () => {
    expect(ORG_UNIT_TYPES).toEqual(["archdiocese", "deanery", "parish"]);
  });

  it("keeps membership and account status vocabularies separate", () => {
    expect(MEMBERSHIP_STATUSES).toEqual(["pending", "active", "inactive", "suspended", "archived"]);
    expect(ACCOUNT_STATUSES).toEqual(["pending_activation", "active", "suspended", "deactivated"]);
  });

  it("allows domain references to carry their own distinct status fields", () => {
    const member: MemberIdentityReference = {
      id: "member-id",
      homeParish: { id: "parish-id", type: "parish" },
      membershipStatus: "suspended",
    };
    const account: UserAccountIdentityReference = {
      id: "account-id",
      authUserId: "auth-user-id",
      memberId: member.id,
      accountStatus: "active",
    };

    expect(member.membershipStatus).toBe("suspended");
    expect(account.accountStatus).toBe("active");
  });
});
