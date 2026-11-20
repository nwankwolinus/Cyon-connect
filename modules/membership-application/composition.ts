import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { getServerEnv } from "@/infrastructure/config/server";
import { assertStagingSupabaseTarget, getSupabaseUrl } from "@/infrastructure/config/public";
import { resolveOperationalParish } from "@/infrastructure/organization/operational-parish";
import {
  membershipApplicationSubmissionSchema,
  toPersistedApplicationPayload,
} from "./domain/submission";
import {
  createSupabaseSubmissionRepository,
  type SubmissionResult,
} from "./infrastructure/supabase-submission-repository";
import { membershipApplicationDraftPayloadSchema } from "./domain/draft";
import { createSupabaseApplicantApplicationRepository } from "./infrastructure/supabase-applicant-application-repository";
import { verifyApplicantPassportPhotoForSubmission } from "./composition-photo";
import { z } from "zod";
import { createConsoleLogger } from "@/infrastructure/logging/console-logger";
import { describeError } from "@/shared/logging/logger";

const applicantApplicationLogger = createConsoleLogger({ module: "applicant-application" });

export type MembershipSubmissionOutcome =
  | { readonly kind: "submitted"; readonly result: SubmissionResult }
  | { readonly kind: "invalid" }
  | { readonly kind: "invalid_photo" }
  | { readonly kind: "disabled" }
  | { readonly kind: "conflict" }
  | { readonly kind: "unavailable" };

/** Dedicated composition-boundary access to the server-only cleanup HMAC setting. */
export function getMembershipPhotoCleanupSecret(): string | undefined {
  return getServerEnv().MEMBERSHIP_PHOTO_CLEANUP_HMAC_SECRET;
}

function submissionConfigIsEnabled(): boolean {
  try {
    const env = getServerEnv();
    if (env.MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED !== "true" || !env.CYON_ACTIVE_PARISH_ID) {
      return false;
    }
    if (env.APP_ENV === "development") return process.env.NODE_ENV !== "production";
    if (env.APP_ENV !== "staging") return false;
    assertStagingSupabaseTarget(getSupabaseUrl());
    return true;
  } catch {
    return false;
  }
}

/** Read-only dashboard/status access is independent of whether intake is enabled. */
export async function isMembershipApplicationOverviewAvailable(): Promise<boolean> {
  let parishConfigured = false;
  try {
    parishConfigured = Boolean(getServerEnv().CYON_ACTIVE_PARISH_ID);
  } catch {
    // Fail closed when server configuration is malformed.
  }
  if (!parishConfigured) {
    applicantApplicationLogger.warn("applicant application access is disabled by configuration", {
      failureStage: "overview_configuration",
    });
    return false;
  }
  try {
    await resolveOperationalParish();
    return true;
  } catch (error) {
    applicantApplicationLogger.error("applicant application parish resolution failed", {
      failureStage: "overview_parish_resolution",
      ...describeError(error),
    });
    return false;
  }
}

/** Submission/draft intake remains gated by the explicit development feature flag. */
export async function isMembershipApplicationSubmissionAvailable(): Promise<boolean> {
  if (!submissionConfigIsEnabled()) return false;
  return isMembershipApplicationOverviewAvailable();
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export async function submitMembershipApplication(input: {
  readonly applicantAuthId: string;
  readonly verifiedEmail: string;
  readonly idempotencyKey: string;
  readonly draft: unknown;
  readonly passportPhotoId: string;
}): Promise<MembershipSubmissionOutcome> {
  if (!submissionConfigIsEnabled()) return { kind: "disabled" };

  const parsed = membershipApplicationSubmissionSchema.safeParse(input.draft);
  if (!parsed.success) return { kind: "invalid" };
  if (!z.string().uuid().safeParse(input.passportPhotoId).success) return { kind: "invalid_photo" };

  try {
    const parish = await resolveOperationalParish();
    const passportPhotoVerified = await verifyApplicantPassportPhotoForSubmission({
      applicantAuthId: input.applicantAuthId,
      parishId: parish.id,
      photoId: input.passportPhotoId,
    });
    const payload = toPersistedApplicationPayload(parsed.data, input.verifiedEmail);
    // DOB has an eligibility-only purpose in this increment: neither its value nor a
    // DOB-derived digest is sent to or stored by PostgreSQL.
    const requestDigest = canonicalize({ payload, passportPhotoId: input.passportPhotoId });
    const keyDigest = createHash("sha256")
      .update(`${input.applicantAuthId}:membership_application.submit:${input.idempotencyKey}`)
      .digest();
    // The per-operation random key keeps the persisted payload digest non-reversible.
    const payloadDigest = createHmac("sha256", input.idempotencyKey).update(requestDigest).digest();
    const result = await createSupabaseSubmissionRepository().submit({
      applicantAuthId: input.applicantAuthId,
      parishId: parish.id,
      payload,
      idempotencyKeyDigest: keyDigest,
      payloadDigest,
      correlationId: randomUUID(),
      passportPhotoId: input.passportPhotoId,
      passportPhotoVerified,
    });
    return { kind: "submitted", result };
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_photo")
      return { kind: "invalid_photo" };
    if (error instanceof Error && error.message === "submission_conflict")
      return { kind: "conflict" };
    if (error instanceof Error && error.message === "idempotency_conflict")
      return { kind: "conflict" };
    return { kind: "unavailable" };
  }
}

export type DraftSaveOutcome =
  | {
      readonly kind: "saved";
      readonly result: {
        readonly draftId: string;
        readonly activeStep: number;
        readonly lastActivityAt: string;
        readonly expiresAt: string;
        readonly updatedAt: string;
      };
    }
  | { readonly kind: "invalid" | "disabled" | "conflict" | "application_open" | "unavailable" };

function applicationAccessIsEnabled(): boolean {
  return submissionConfigIsEnabled();
}

export async function saveMembershipApplicationDraft(input: {
  readonly applicantAuthId: string;
  readonly payload: unknown;
  readonly activeStep: number;
  readonly expectedUpdatedAt: string | null;
}): Promise<DraftSaveOutcome> {
  if (!applicationAccessIsEnabled()) return { kind: "disabled" };
  const parsed = membershipApplicationDraftPayloadSchema.safeParse(input.payload);
  if (
    !parsed.success ||
    !Number.isInteger(input.activeStep) ||
    input.activeStep < 0 ||
    input.activeStep > 9
  ) {
    return { kind: "invalid" };
  }
  try {
    const parish = await resolveOperationalParish();
    const result = await createSupabaseApplicantApplicationRepository().saveDraft({
      applicantAuthId: input.applicantAuthId,
      parishId: parish.id,
      payload: parsed.data,
      activeStep: input.activeStep,
      expectedUpdatedAt: input.expectedUpdatedAt,
      correlationId: randomUUID(),
    });
    return { kind: "saved", result };
  } catch (error) {
    if (error instanceof Error && error.message === "draft_version_conflict")
      return { kind: "conflict" };
    if (error instanceof Error && error.message === "application_already_open")
      return { kind: "application_open" };
    return { kind: "unavailable" };
  }
}

export async function getMyMembershipApplicationOverview(applicantAuthId: string) {
  const parish = await resolveOperationalParish();
  return createSupabaseApplicantApplicationRepository().getOverview({
    applicantAuthId,
    parishId: parish.id,
    correlationId: randomUUID(),
  });
}

export async function getMyMembershipApplicationDraft(applicantAuthId: string) {
  if (!applicationAccessIsEnabled()) return null;
  const parish = await resolveOperationalParish();
  return createSupabaseApplicantApplicationRepository().getDraft({
    applicantAuthId,
    parishId: parish.id,
    correlationId: randomUUID(),
  });
}
