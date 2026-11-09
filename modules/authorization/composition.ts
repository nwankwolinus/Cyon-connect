import "server-only";
import { createGetMyPlatformAdmin } from "./application/get-my-platform-admin";
import { createSupabaseCurrentPlatformAdminReader } from "./infrastructure/supabase-current-platform-admin-reader";
import { createTrustedAuthenticatedUser } from "@/infrastructure/supabase/trusted-authenticated-user";
import { createCurrentPlatformAdminHandler } from "./presentation/authorization-handler";

export function createCurrentPlatformAdminRoute() {
  const getMyPlatformAdmin = createGetMyPlatformAdmin({
    authenticatedUser: createTrustedAuthenticatedUser(),
    reader: createSupabaseCurrentPlatformAdminReader(),
  });
  return createCurrentPlatformAdminHandler(getMyPlatformAdmin);
}
