import "server-only";
import { AppError } from "@/shared/errors/app-error";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";
import type { CurrentPlatformAdminReader } from "../application/get-my-platform-admin";

export function createSupabaseCurrentPlatformAdminReader(): CurrentPlatformAdminReader {
  return {
    async isCurrentUserPlatformAdmin() {
      const client = await createServerSupabaseClient();
      const { data, error } = await client.rpc("current_user_is_platform_admin");
      if (error || typeof data !== "boolean") {
        throw new AppError("infrastructure", "Authorization service unavailable.", {
          cause: error ?? new Error("Invalid authorization response."),
        });
      }
      return data;
    },
  };
}
