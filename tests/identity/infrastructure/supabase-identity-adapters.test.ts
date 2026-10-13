import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseTrustedAuthenticatedUser } from "@/modules/identity/infrastructure/supabase-trusted-authenticated-user";
import { createSupabaseIdentityContextReader } from "@/modules/identity/infrastructure/supabase-identity-context-reader";
import { toPublicError } from "@/shared/errors/app-error";
import type { IdentityContextLookup } from "@/modules/identity/application/ports";
import type { createServerSupabaseClient } from "@/infrastructure/supabase/server";

const authUserId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const parishId = "00000000-0000-4000-8000-000000000004";

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function createClient(options?: {
  session?: object | null;
  user?: { id: string } | null;
  authError?: Error | null;
  sessionError?: Error | null;
  row?: unknown;
  queryError?: { message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.row === undefined ? activeRow() : options.row,
    error: options?.queryError ?? null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const getSession = vi.fn().mockResolvedValue({
    data: {
      session: options?.session === undefined ? { access_token: "test-token" } : options.session,
    },
    error: options?.sessionError ?? null,
  });
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options?.user === undefined ? { id: authUserId } : options.user },
    error: options?.authError ?? null,
  });
  const client = {
    auth: { getSession, getUser },
    from,
  } as unknown as SupabaseClient;
  const getClient = async () => client as ServerClient;
  return { client, getClient, getSession, getUser, from, select, eq, maybeSingle };
}

function activeRow() {
  return {
    id: accountId,
    auth_user_id: authUserId,
    member_id: memberId,
    account_status: "active",
    members: {
      id: memberId,
      membership_status: "active",
      org_unit_id: parishId,
      org_unit_type: "parish",
      org_units: { id: parishId, unit_type: "parish" },
    },
  };
}

function setProjectionValue(row: Record<string, unknown>, field: string, value: unknown): void {
  const path = field.split(".");
  let parent = row;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  parent[path[path.length - 1]!] = value;
}

afterEach(() => vi.restoreAllMocks());

describe("Supabase trusted authenticated user adapter", () => {
  it("uses getUser's verified identity rather than the session's user value", async () => {
    const verifiedId = "00000000-0000-4000-8000-000000000099";
    const { getClient, getUser } = createClient({
      session: { user: { id: "unverified-session-value" } },
      user: { id: verifiedId },
    });
    const currentUser = createSupabaseTrustedAuthenticatedUser(getClient);

    await expect(currentUser.getAuthUserId()).resolves.toBe(verifiedId);
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("returns null for a missing session without calling getUser", async () => {
    const { getClient, getUser } = createClient({ session: null });
    const currentUser = createSupabaseTrustedAuthenticatedUser(getClient);

    await expect(currentUser.getAuthUserId()).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("treats Auth provider errors as generic infrastructure failures", async () => {
    const { getClient } = createClient({ authError: new Error("private provider detail") });
    const currentUser = createSupabaseTrustedAuthenticatedUser(getClient);

    await expect(currentUser.getAuthUserId()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Authentication service unavailable.",
    });
    try {
      await currentUser.getAuthUserId();
    } catch (error) {
      expect(toPublicError(error)).toEqual({
        category: "infrastructure",
        message: "Authentication service unavailable.",
      });
    }
  });

  it("treats session lookup failures as infrastructure failures", async () => {
    const { getClient } = createClient({ sessionError: new Error("private cookie detail") });
    const currentUser = createSupabaseTrustedAuthenticatedUser(getClient);
    await expect(currentUser.getAuthUserId()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Authentication service unavailable.",
    });
  });
});

describe("Supabase identity context reader", () => {
  it("filters by the verified caller and selects only the required linked columns", async () => {
    const { getClient, from, select, eq } = createClient();
    const reader = createSupabaseIdentityContextReader(getClient);

    await expect(reader.findByAuthUserId(authUserId)).resolves.toEqual({
      kind: "found",
      account: {
        id: accountId,
        authUserId,
        memberId,
        accountStatus: "active",
      },
      member: {
        id: memberId,
        membershipStatus: "active",
        homeParish: { id: parishId, type: "parish" },
      },
    } satisfies IdentityContextLookup);

    expect(from).toHaveBeenCalledWith("user_accounts");
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(
      "id,auth_user_id,member_id,account_status,members:members!user_accounts_member_fk(id,membership_status,org_unit_id,org_unit_type,org_units:org_units!members_org_unit_fk(id,unit_type))",
    );
    expect(eq).toHaveBeenCalledWith("auth_user_id", authUserId);
  });

  it("reports no linked account without conflating database errors with missing data", async () => {
    const { getClient } = createClient({ row: null });
    const reader = createSupabaseIdentityContextReader(getClient);
    await expect(reader.findByAuthUserId(authUserId)).resolves.toEqual({ kind: "missing_account" });
  });

  it("denies a non-active account when RLS hides its related rows", async () => {
    const row = { ...activeRow(), account_status: "suspended", members: null };
    const { getClient } = createClient({ row });
    const reader = createSupabaseIdentityContextReader(getClient);
    await expect(reader.findByAuthUserId(authUserId)).resolves.toEqual({ kind: "access_denied" });
  });

  it("fails closed when an active account has no visible member relationship", async () => {
    const { getClient } = createClient({ row: { ...activeRow(), members: null } });
    const reader = createSupabaseIdentityContextReader(getClient);
    await expect(reader.findByAuthUserId(authUserId)).resolves.toEqual({ kind: "missing_member" });
  });

  it("fails closed when the member's organization relationship is missing", async () => {
    const row = { ...activeRow(), members: { ...activeRow().members, org_units: null } };
    const { getClient } = createClient({ row });
    const reader = createSupabaseIdentityContextReader(getClient);
    await expect(reader.findByAuthUserId(authUserId)).resolves.toEqual({
      kind: "missing_org_unit",
    });
  });

  it.each([
    {
      name: "account and member IDs",
      row: {
        ...activeRow(),
        members: { ...activeRow().members, id: "00000000-0000-4000-8000-000000000099" },
      },
    },
    {
      name: "member and organization IDs",
      row: {
        ...activeRow(),
        members: { ...activeRow().members, org_unit_id: "00000000-0000-4000-8000-000000000099" },
      },
    },
    {
      name: "member and organization types",
      row: {
        ...activeRow(),
        members: { ...activeRow().members, org_unit_type: "deanery" },
      },
    },
  ])("reports inconsistent $name", async ({ row }) => {
    const { getClient } = createClient({ row });
    const reader = createSupabaseIdentityContextReader(getClient);
    await expect(reader.findByAuthUserId(authUserId)).resolves.toEqual({
      kind: "inconsistent_links",
    });
  });

  it.each([
    { field: "account_status", value: "recovering" },
    { field: "members.membership_status", value: "locked" },
    { field: "members.org_units.unit_type", value: "province" },
  ])("rejects invalid projection values for $field", async ({ field, value }) => {
    const row = structuredClone(activeRow()) as unknown as Record<string, unknown>;
    setProjectionValue(row, field, value);

    const { getClient } = createClient({ row });
    const reader = createSupabaseIdentityContextReader(getClient);
    await expect(reader.findByAuthUserId(authUserId)).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Identity context unavailable.",
    });
  });

  it("hides raw database error details from public errors", async () => {
    const { getClient } = createClient({ queryError: { message: "private database detail" } });
    const reader = createSupabaseIdentityContextReader(getClient);
    try {
      await reader.findByAuthUserId(authUserId);
      throw new Error("expected adapter to reject");
    } catch (error) {
      expect(toPublicError(error)).toEqual({
        category: "infrastructure",
        message: "Identity context unavailable.",
      });
      expect(JSON.stringify(toPublicError(error))).not.toContain("private database detail");
    }
  });
});
