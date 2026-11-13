import "server-only";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";
import type {
  PassportPhotoCleanupJob,
  PassportPhotoCleanupRepository,
} from "../application/process-passport-photo-cleanup";

function unavailable(): never {
  throw new Error("photo_cleanup_unavailable");
}

export function createSupabasePhotoCleanupRepository(): PassportPhotoCleanupRepository {
  return {
    async consumeRequest(requestId, acceptedUntil, signal) {
      const { data, error } = await createAdminSupabaseClient()
        .rpc("consume_membership_photo_cleanup_request", {
          p_request_id: requestId,
          p_accepted_until: acceptedUntil,
        })
        .abortSignal(signal);
      if (error || typeof data !== "boolean") unavailable();
      return data;
    },

    async claim(limit, signal) {
      const { data, error } = await createAdminSupabaseClient()
        .rpc("claim_membership_application_photo_cleanup_jobs", { p_limit: limit })
        .abortSignal(signal);
      if (error || !Array.isArray(data)) unavailable();
      return data.map((row: unknown): PassportPhotoCleanupJob => {
        if (!row || typeof row !== "object") return unavailable();
        const value = row as Record<string, unknown>;
        if (
          typeof value.photo_id !== "string" ||
          typeof value.applicant_auth_id !== "string" ||
          typeof value.source_draft_id !== "string" ||
          typeof value.object_path !== "string" ||
          typeof value.deletion_reason !== "string" ||
          !(value.source_expires_at === null || typeof value.source_expires_at === "string") ||
          typeof value.queued_at !== "string" ||
          typeof value.claim_token !== "string"
        ) {
          return unavailable();
        }
        if (
          !["draft_expired", "replaced", "applicant_removed", "legacy_pending"].includes(
            value.deletion_reason,
          )
        ) {
          return unavailable();
        }
        return {
          photoId: value.photo_id,
          applicantAuthId: value.applicant_auth_id,
          sourceDraftId: value.source_draft_id,
          objectPath: value.object_path,
          reason: value.deletion_reason as PassportPhotoCleanupJob["reason"],
          sourceExpiresAt: value.source_expires_at,
          queuedAt: value.queued_at,
          claimToken: value.claim_token,
        };
      });
    },

    async complete(photoId, claimToken, signal) {
      const { data, error } = await createAdminSupabaseClient()
        .rpc("complete_membership_application_photo_cleanup", {
          p_photo_id: photoId,
          p_claim_token: claimToken,
        })
        .abortSignal(signal);
      if (error || typeof data !== "boolean") unavailable();
      return data;
    },

    async fail(photoId, claimToken, category, permanent, signal) {
      const { data, error } = await createAdminSupabaseClient()
        .rpc("fail_membership_application_photo_cleanup", {
          p_photo_id: photoId,
          p_claim_token: claimToken,
          p_failure_category: category,
          p_permanent: permanent,
        })
        .abortSignal(signal);
      if (error || typeof data !== "boolean") unavailable();
      return data;
    },
  };
}
