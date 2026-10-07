import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/infrastructure/config/public";

/**
 * Server client acting AS THE SIGNED-IN USER (anon key + session cookies), subject to RLS.
 * Server-only. For privileged operations use admin.ts instead.
 */
export async function createServerSupabaseClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component where cookies are read-only; middleware refresh handles it.
        }
      },
    },
  });
}
