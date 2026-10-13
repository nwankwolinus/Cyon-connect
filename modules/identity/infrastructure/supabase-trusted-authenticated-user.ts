import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/shared/errors/app-error";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";
import type { TrustedAuthenticatedUser } from "@/modules/identity/application/ports";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type ServerClientFactory = () => Promise<ServerSupabaseClient>;

/** Resolves the signed-in request user; the session value itself is never trusted as identity proof. */
export function createSupabaseTrustedAuthenticatedUser(
  getClient: ServerClientFactory = createServerSupabaseClient,
): TrustedAuthenticatedUser {
  return {
    async getAuthUserId() {
      const client: SupabaseClient = await getClient();
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        throw new AppError("infrastructure", "Authentication service unavailable.", {
          cause: sessionError,
        });
      }
      if (!sessionData.session) return null;

      const { data, error } = await client.auth.getUser();
      if (error) {
        throw new AppError("infrastructure", "Authentication service unavailable.", {
          cause: error,
        });
      }
      return data.user?.id ?? null;
    },
  };
}
