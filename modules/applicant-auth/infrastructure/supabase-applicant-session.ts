import "server-only";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";
import type { ApplicantSessionReader } from "../application/verify-applicant-session";

export function createSupabaseApplicantSessionReader(): ApplicantSessionReader {
  return {
    async getCurrentAuthUser() {
      const client = await createServerSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? "",
        emailConfirmedAt: data.user.email_confirmed_at ?? null,
      };
    },
  };
}
