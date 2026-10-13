import "server-only";
import { createConsoleLogger } from "@/infrastructure/logging/console-logger";
import { createGetMyIdentity } from "./application/get-my-identity";
import { createSupabaseIdentityContextReader } from "./infrastructure/supabase-identity-context-reader";
import { createSupabaseTrustedAuthenticatedUser } from "./infrastructure/supabase-trusted-authenticated-user";
import { createGetMyIdentityHandler } from "./presentation/identity-handlers";

/** Server composition root for the signed-in user's read-only identity context route. */
export function createGetMyIdentityRoute() {
  const logger = createConsoleLogger({ module: "identity" });
  const getMyIdentity = createGetMyIdentity({
    authenticatedUser: createSupabaseTrustedAuthenticatedUser(),
    identityContextReader: createSupabaseIdentityContextReader(),
  });
  return createGetMyIdentityHandler(getMyIdentity, logger);
}
