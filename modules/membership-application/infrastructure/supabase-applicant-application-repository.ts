import "server-only";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";
import type {
  ApplicantApplicationOverview,
  MembershipApplicationDraftPayload,
} from "../domain/draft";
import { createSupabasePassportPhotoRepository } from "./supabase-passport-photo-repository";
import { createConsoleLogger } from "@/infrastructure/logging/console-logger";
import { z } from "zod";

const logger = createConsoleLogger({ module: "applicant-application-repository" });

const applicationStatusSchema = z.enum([
  "submitted",
  "under_review",
  "on_hold",
  "approved",
  "rejected",
  "withdrawn",
  "closed",
]);
const timestampSchema = z.string().datetime({ offset: true });
const applicationOverviewSchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string().uuid().nullable(),
    status: applicationStatusSchema,
    submittedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();
const draftOverviewSchema = z
  .object({
    id: z.string().uuid(),
    lastActivityAt: timestampSchema,
    expiresAt: timestampSchema,
    activeStep: z.number().int().min(0).max(9),
  })
  .strict();
const applicantApplicationOverviewSchema: z.ZodType<ApplicantApplicationOverview> = z
  .object({
    application: applicationOverviewSchema.nullable(),
    draft: draftOverviewSchema.nullable(),
    expiredDraftDisposed: z.boolean(),
  })
  .strict();

export type DraftSnapshot = {
  readonly draftId: string;
  readonly passportPhotoId: string | null;
  readonly payload: MembershipApplicationDraftPayload;
  readonly activeStep: number;
  readonly lastActivityAt: string;
  readonly expiresAt: string;
  readonly updatedAt: string;
};

function errorCode(error: { code?: string; message?: string }) {
  if (error.code === "23505" && error.message?.includes("application_already_open")) {
    throw new Error("application_already_open");
  }
  if (error.code === "40001") throw new Error("draft_version_conflict");
  throw new Error("draft_unavailable");
}

export function createSupabaseApplicantApplicationRepository() {
  return {
    async saveDraft(input: {
      applicantAuthId: string;
      parishId: string;
      payload: MembershipApplicationDraftPayload;
      activeStep: number;
      expectedUpdatedAt: string | null;
      correlationId: string;
    }): Promise<Omit<DraftSnapshot, "payload">> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "save_membership_application_draft",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_applicant_payload: input.payload,
          p_active_step: input.activeStep,
          p_expected_updated_at: input.expectedUpdatedAt,
          p_correlation_id: input.correlationId,
        },
      );
      if (error) errorCode(error);
      if (
        !data ||
        typeof data.draftId !== "string" ||
        typeof data.updatedAt !== "string" ||
        typeof data.expiresAt !== "string" ||
        typeof data.lastActivityAt !== "string" ||
        typeof data.activeStep !== "number"
      ) {
        throw new Error("draft_unavailable");
      }
      const passportPhoto = await createSupabasePassportPhotoRepository().get({
        applicantAuthId: input.applicantAuthId,
        parishId: input.parishId,
        draftId: data.draftId,
        correlationId: input.correlationId,
      });
      return {
        draftId: data.draftId,
        updatedAt: data.updatedAt,
        expiresAt: data.expiresAt,
        lastActivityAt: data.lastActivityAt,
        activeStep: data.activeStep,
        passportPhotoId: passportPhoto?.photoId ?? null,
      };
    },

    async getDraft(input: {
      applicantAuthId: string;
      parishId: string;
      correlationId: string;
    }): Promise<DraftSnapshot | { readonly expired: true } | null> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "get_membership_application_draft",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_correlation_id: input.correlationId,
        },
      );
      if (error) errorCode(error);
      if (data === null) return null;
      if (data?.expired === true) return { expired: true };
      if (
        !data ||
        typeof data.draftId !== "string" ||
        typeof data.payload !== "object" ||
        data.payload === null ||
        typeof data.activeStep !== "number" ||
        typeof data.lastActivityAt !== "string" ||
        typeof data.expiresAt !== "string" ||
        typeof data.updatedAt !== "string"
      ) {
        throw new Error("draft_unavailable");
      }
      const passportPhoto = await createSupabasePassportPhotoRepository().get({
        applicantAuthId: input.applicantAuthId,
        parishId: input.parishId,
        draftId: data.draftId,
        correlationId: input.correlationId,
      });
      return {
        draftId: data.draftId,
        payload: data.payload as MembershipApplicationDraftPayload,
        activeStep: data.activeStep,
        lastActivityAt: data.lastActivityAt,
        expiresAt: data.expiresAt,
        updatedAt: data.updatedAt,
        passportPhotoId: passportPhoto?.photoId ?? null,
      };
    },

    async getOverview(input: {
      applicantAuthId: string;
      parishId: string;
      correlationId: string;
    }): Promise<ApplicantApplicationOverview> {
      const { data, error } = await createAdminSupabaseClient().rpc(
        "get_my_membership_application_overview",
        {
          p_applicant_auth_id: input.applicantAuthId,
          p_org_unit_id: input.parishId,
          p_correlation_id: input.correlationId,
        },
      );
      if (error) {
        const databaseErrorCode =
          typeof error.code === "string" && /^[A-Z0-9]{5,8}$/.test(error.code)
            ? error.code
            : "unclassified";
        logger.error("applicant application overview RPC failed", {
          failureStage: "overview_rpc",
          databaseErrorCode,
        });
      }
      if (error) errorCode(error);
      const parsedOverview = applicantApplicationOverviewSchema.safeParse(data);
      if (!parsedOverview.success) {
        logger.error("applicant application overview RPC returned an invalid result", {
          failureStage: "overview_rpc_response",
        });
        throw new Error("application_unavailable");
      }
      return parsedOverview.data;
    },
  };
}
