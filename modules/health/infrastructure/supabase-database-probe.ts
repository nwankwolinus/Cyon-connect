import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/shared/errors/app-error";
import type { InfrastructureProbe } from "@/modules/health/application/ports";

/**
 * Adapter: checks the PostgreSQL database through PostgREST by calling public.platform_ping()
 * (created by the platform baseline migration; executable by service_role only).
 * The client is created lazily so missing configuration surfaces as a failed probe, not a crash.
 */
export function createSupabaseDatabaseProbe(getClient: () => SupabaseClient): InfrastructureProbe {
  return {
    name: "database",
    async check() {
      const { data, error } = await getClient().rpc("platform_ping");
      if (error) throw new AppError("infrastructure", "Database unavailable.", { cause: error });
      if (data !== true) throw new AppError("infrastructure", "Database returned an unexpected response.");
    },
  };
}
