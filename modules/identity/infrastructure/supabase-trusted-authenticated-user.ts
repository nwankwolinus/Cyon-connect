import "server-only";
import { createTrustedAuthenticatedUser } from "@/infrastructure/supabase/trusted-authenticated-user";
import type { TrustedAuthenticatedUser } from "@/modules/identity/application/ports";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type ServerClientFactory = () => Promise<ServerSupabaseClient>;

/** Identity-module adapter wrapper preserving its port type and test seam. */
export function createSupabaseTrustedAuthenticatedUser(
  getClient?: ServerClientFactory,
): TrustedAuthenticatedUser {
  return createTrustedAuthenticatedUser(getClient);
}
