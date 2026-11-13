import "server-only";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";

export type SubmissionRecord = {
  readonly applicantAuthId: string;
  readonly parishId: string;
  readonly payload: Record<string, unknown>;
  readonly idempotencyKeyDigest: Uint8Array;
  readonly payloadDigest: Uint8Array;
  readonly correlationId: string;
  readonly passportPhotoId: string;
  readonly passportPhotoVerified: boolean;
};

export type SubmissionResult = {
  readonly applicationId: string;
  readonly applicationReference: string;
  readonly status: "submitted";
  readonly replay: boolean;
};

export type SubmissionRepository = {
  submit(record: SubmissionRecord): Promise<SubmissionResult>;
};

function bytea(value: Uint8Array): string {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

export function createSupabaseSubmissionRepository(): SubmissionRepository {
  return {
    async submit(record) {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "submit_membership_application",
        {
          p_applicant_auth_id: record.applicantAuthId,
          p_org_unit_id: record.parishId,
          p_applicant_payload: record.payload,
          p_idempotency_key_digest: bytea(record.idempotencyKeyDigest),
          p_payload_digest: bytea(record.payloadDigest),
          p_correlation_id: record.correlationId,
          p_passport_photo_id: record.passportPhotoId,
          p_passport_photo_verified: record.passportPhotoVerified,
        },
      );
      if (error) {
        if (error.code === "23505") throw new Error("submission_conflict");
        if (error.code === "23514" && error.message.includes("valid_applicant_photo_required")) {
          throw new Error("invalid_photo");
        }
        if (error.code === "22023" && error.message.includes("idempotency_payload_conflict")) {
          throw new Error("idempotency_conflict");
        }
        throw new Error("submission_unavailable");
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (
        !row ||
        typeof row.application_id !== "string" ||
        typeof row.application_reference !== "string" ||
        row.application_status !== "submitted"
      ) {
        throw new Error("submission_unavailable");
      }
      return {
        applicationId: row.application_id,
        applicationReference: row.application_reference,
        status: "submitted",
        replay: row.was_replay === true,
      };
    },
  };
}
