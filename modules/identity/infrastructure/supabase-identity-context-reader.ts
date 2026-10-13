import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_STATUSES,
  MEMBERSHIP_STATUSES,
  ORG_UNIT_TYPES,
} from "@/modules/identity/domain/contracts";
import type {
  IdentityContextReader,
  IdentityContextLookup,
} from "@/modules/identity/application/ports";
import { AppError } from "@/shared/errors/app-error";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type ServerClientFactory = () => Promise<ServerSupabaseClient>;

// This validates only the explicitly selected PostgREST projection; it is not a persistence model.
const organizationProjection = z
  .object({ id: z.string().uuid(), unit_type: z.enum(ORG_UNIT_TYPES) })
  .nullable();

const memberProjection = z
  .object({
    id: z.string().uuid(),
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    org_unit_id: z.string().uuid(),
    org_unit_type: z.enum(ORG_UNIT_TYPES),
    org_units: organizationProjection,
  })
  .nullable();

const identityProjection = z.object({
  id: z.string().uuid(),
  auth_user_id: z.string().uuid(),
  member_id: z.string().uuid(),
  account_status: z.enum(ACCOUNT_STATUSES),
  members: memberProjection,
});

const IDENTITY_SELECT =
  "id,auth_user_id,member_id,account_status,members:members!user_accounts_member_fk(id,membership_status,org_unit_id,org_unit_type,org_units:org_units!members_org_unit_fk(id,unit_type))";

function unavailableError(cause: unknown): AppError {
  return new AppError("infrastructure", "Identity context unavailable.", { cause });
}

/** Reads the caller's identity through the cookie-aware server client, subject to RLS. */
export function createSupabaseIdentityContextReader(
  getClient: ServerClientFactory = createServerSupabaseClient,
): IdentityContextReader {
  return {
    async findByAuthUserId(authUserId): Promise<IdentityContextLookup> {
      const client: SupabaseClient = await getClient();
      const { data, error } = await client
        .from("user_accounts")
        .select(IDENTITY_SELECT)
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (error) throw unavailableError(error);
      if (data === null) return { kind: "missing_account" };

      const parsed = identityProjection.safeParse(data);
      if (!parsed.success) throw unavailableError(parsed.error);

      const account = parsed.data;
      if (account.auth_user_id !== authUserId) return { kind: "inconsistent_links" };

      // RLS intentionally hides member and organization rows for non-active accounts.
      if (account.account_status !== "active") return { kind: "access_denied" };
      if (account.members === null) return { kind: "missing_member" };

      const member = account.members;
      if (member.id !== account.member_id) return { kind: "inconsistent_links" };
      if (member.org_units === null) return { kind: "missing_org_unit" };

      const organization = member.org_units;
      if (
        organization.unit_type !== "parish" ||
        member.org_unit_id !== organization.id ||
        member.org_unit_type !== organization.unit_type
      ) {
        return { kind: "inconsistent_links" };
      }

      return {
        kind: "found",
        account: {
          id: account.id,
          authUserId: account.auth_user_id,
          memberId: account.member_id,
          accountStatus: account.account_status,
        },
        member: {
          id: member.id,
          membershipStatus: member.membership_status,
          homeParish: { id: organization.id, type: organization.unit_type },
        },
      };
    },
  };
}
