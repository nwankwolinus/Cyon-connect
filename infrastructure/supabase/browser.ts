import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/infrastructure/config/public";

/**
 * Browser client: anon key only, subject to RLS. Safe for client components.
 * Must never import server.ts, admin.ts or config/server.ts.
 */
export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  return createBrowserClient(url, anonKey);
}
