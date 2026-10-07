import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/infrastructure/config/public";
import { getPrivilegedEnv } from "@/infrastructure/config/server";

/**
 * Service-role client. BYPASSES RLS. Server-only, never logged, never exposed to the browser.
 * Every caller must perform its own application-level authorization first (FR-CC-008).
 * Only module infrastructure adapters may import this file (enforced by dependency-cruiser).
 */
export function createAdminSupabaseClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getPrivilegedEnv();
  return createClient(getSupabaseUrl(), SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
