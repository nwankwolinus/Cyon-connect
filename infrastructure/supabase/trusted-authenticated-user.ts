import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/shared/errors/app-error";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type ServerClientFactory = () => Promise<ServerSupabaseClient>;

/** Shared server-only adapter: returns only the Auth ID verified by Supabase Auth getUser(). */
export function createTrustedAuthenticatedUser(
  getClient: ServerClientFactory = createServerSupabaseClient,
) {
  return {
    async getAuthUserId(): Promise<string | null> {
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
