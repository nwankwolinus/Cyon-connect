import "server-only";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";

export type PassportPhotoReference = {
  readonly photoId: string;
  readonly objectPath: string;
  readonly contentType: "image/jpeg";
  readonly byteSize: number;
};

function unavailable(): never {
  throw new Error("photo_unavailable");
}

export function createSupabasePassportPhotoRepository() {
  return {
    async register(input: {
      applicantAuthId: string;
      parishId: string;
      draftId: string;
      photoId: string;
      objectPath: string;
      byteSize: number;
      correlationId: string;
    }): Promise<{ readonly photoId: string; readonly previousObjectPath: string | null }> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "register_membership_application_photo",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_draft_id: input.draftId,
          p_photo_id: input.photoId,
          p_object_path: input.objectPath,
          p_byte_size: input.byteSize,
          p_correlation_id: input.correlationId,
        },
      );
      if (error || data?.photoId !== input.photoId) unavailable();
      return {
        photoId: data.photoId,
        previousObjectPath:
          typeof data.previousObjectPath === "string" ? data.previousObjectPath : null,
      };
    },

    async get(input: {
      applicantAuthId: string;
      parishId: string;
      draftId: string;
      correlationId: string;
    }): Promise<PassportPhotoReference | null> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "get_membership_application_photo",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_draft_id: input.draftId,
          p_correlation_id: input.correlationId,
        },
      );
      if (error) unavailable();
      if (data === null) return null;
      if (
        !data ||
        typeof data.photoId !== "string" ||
        typeof data.objectPath !== "string" ||
        data.contentType !== "image/jpeg" ||
        typeof data.byteSize !== "number"
      ) {
        unavailable();
      }
      return data as PassportPhotoReference;
    },

    async getForSubmission(input: {
      applicantAuthId: string;
      parishId: string;
      photoId: string;
      correlationId: string;
    }): Promise<PassportPhotoReference | null> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "verify_membership_application_photo",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_photo_id: input.photoId,
          p_correlation_id: input.correlationId,
        },
      );
      if (error) unavailable();
      if (data === null) return null;
      if (!data || typeof data.objectPath !== "string" || typeof data.byteSize !== "number") {
        unavailable();
      }
      return {
        photoId: input.photoId,
        objectPath: data.objectPath,
        contentType: "image/jpeg",
        byteSize: data.byteSize,
      };
    },

    async remove(input: {
      applicantAuthId: string;
      parishId: string;
      draftId: string;
      correlationId: string;
    }): Promise<string | null> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "remove_membership_application_photo",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_draft_id: input.draftId,
          p_correlation_id: input.correlationId,
        },
      );
      if (error) unavailable();
      if (data === null) return null;
      if (!data || typeof data.objectPath !== "string") unavailable();
      return data.objectPath;
    },

    async finalizeDeletion(objectPath: string): Promise<void> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "finalize_membership_application_photo_deletion",
        { p_object_path: objectPath },
      );
      if (error || data !== true) unavailable();
    },
  };
}
