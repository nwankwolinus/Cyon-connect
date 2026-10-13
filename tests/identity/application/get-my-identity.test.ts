import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_STATUSES, MEMBERSHIP_STATUSES } from "@/modules/identity/domain/contracts";
import { createGetMyIdentity } from "@/modules/identity/application/get-my-identity";
import type { IdentityContextLookup } from "@/modules/identity/application/ports";

const authUserId = "auth-user-1";
const activeLookup: IdentityContextLookup = {
  kind: "found",
  account: {
    id: "account-1",
    authUserId,
    memberId: "member-1",
    accountStatus: "active",
  },
  member: {
    id: "member-1",
    membershipStatus: "active",
    homeParish: { id: "parish-1", type: "parish" },
  },
};

function createUseCase(
  lookup: IdentityContextLookup = activeLookup,
  currentUserId: string | null = authUserId,
) {
  const findByAuthUserId = vi.fn(async () => lookup);
  const execute = createGetMyIdentity({
    authenticatedUser: { getAuthUserId: async () => currentUserId },
    identityContextReader: { findByAuthUserId },
  });
  return { execute, findByAuthUserId };
}

describe("Get My Identity", () => {
  it("returns only the caller's minimal identity context when both statuses are active", async () => {
    const { execute, findByAuthUserId } = createUseCase();

    await expect(execute()).resolves.toEqual({
      kind: "permitted",
      identity: {
        account: { id: "account-1", status: "active" },
        member: { id: "member-1", status: "active" },
        homeOrganization: { id: "parish-1", type: "parish" },
      },
    });
    expect(findByAuthUserId).toHaveBeenCalledWith(authUserId);
  });

  it.each(ACCOUNT_STATUSES.filter((status) => status !== "active"))(
    "denies identity-context access for account status %s",
    async (accountStatus) => {
      const lookup: IdentityContextLookup = {
        ...activeLookup,
        account: { ...activeLookup.account, accountStatus },
      };
      const { execute } = createUseCase(lookup);
      await expect(execute()).resolves.toEqual({ kind: "access_denied" });
    },
  );

  it.each(MEMBERSHIP_STATUSES.filter((status) => status !== "active"))(
    "denies identity-context access for membership status %s",
    async (membershipStatus) => {
      const lookup: IdentityContextLookup = {
        ...activeLookup,
        member: { ...activeLookup.member, membershipStatus },
      };
      const { execute } = createUseCase(lookup);
      await expect(execute()).resolves.toEqual({ kind: "access_denied" });
    },
  );

  it.each(["missing_account", "missing_member", "missing_org_unit", "inconsistent_links"] as const)(
    "fails closed when lookup reports %s",
    async (kind) => {
      const { execute } = createUseCase({ kind });
      await expect(execute()).resolves.toEqual({ kind: "identity_unavailable" });
    },
  );

  it("denies when no trusted authenticated user is available and performs no lookup", async () => {
    const { execute, findByAuthUserId } = createUseCase(activeLookup, null);
    await expect(execute()).resolves.toEqual({ kind: "unauthenticated" });
    expect(findByAuthUserId).not.toHaveBeenCalled();
  });

  it("preserves the reader's generic denial when RLS hides related rows", async () => {
    const { execute } = createUseCase({ kind: "access_denied" });
    await expect(execute()).resolves.toEqual({ kind: "access_denied" });
  });

  it("fails closed if the reader returns another user's identity", async () => {
    const lookup: IdentityContextLookup = {
      ...activeLookup,
      account: { ...activeLookup.account, authUserId: "another-user" },
    };
    const { execute } = createUseCase(lookup);
    await expect(execute()).resolves.toEqual({ kind: "identity_unavailable" });
  });

  it("fails closed if the account and member links disagree", async () => {
    const lookup: IdentityContextLookup = {
      ...activeLookup,
      account: { ...activeLookup.account, memberId: "another-member" },
    };
    const { execute } = createUseCase(lookup);
    await expect(execute()).resolves.toEqual({ kind: "identity_unavailable" });
  });
});
