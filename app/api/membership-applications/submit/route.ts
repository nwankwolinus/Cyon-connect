import { NextResponse } from "next/server";
import { z } from "zod";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";
import {
  assessMembershipSubmissionEligibility,
  getVerifiedApplicant,
} from "@/modules/applicant-auth/composition";
import { submitMembershipApplication } from "@/modules/membership-application/composition";

export const dynamic = "force-dynamic";
const maxBodyBytes = 64 * 1024;
const requestSchema = z.object({ draft: z.unknown(), passportPhotoId: z.string().uuid() }).strict();
const idempotencyKeySchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const noStore = { "cache-control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  if (!hasTrustedAppOrigin(request))
    return json({ message: "Request could not be accepted." }, 403);

  let applicant;
  try {
    applicant = await getVerifiedApplicant();
  } catch {
    applicant = null;
  }
  if (!applicant)
    return json({ message: "Sign in with a verified email to submit an application." }, 401);

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!idempotencyKey.success) return json({ message: "Please retry the submission." }, 400);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBodyBytes)
    return json({ message: "Review the application and try again." }, 413);

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return json({ message: "Review the application and try again." }, 400);
  }
  if (Buffer.byteLength(bodyText, "utf8") > maxBodyBytes) {
    return json({ message: "Review the application and try again." }, 413);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return json({ message: "Review the application and try again." }, 400);
  }
  const requestBody = requestSchema.safeParse(raw);
  if (
    !requestBody.success ||
    !requestBody.data.draft ||
    typeof requestBody.data.draft !== "object"
  ) {
    return json({ message: "Review the application and correct any incomplete information." }, 400);
  }

  const dateOfBirth = (requestBody.data.draft as Record<string, unknown>).dateOfBirth;
  if (typeof dateOfBirth !== "string") {
    return json({ message: "Review the application and correct any incomplete information." }, 400);
  }
  const eligibility = assessMembershipSubmissionEligibility(dateOfBirth);
  if (eligibility === "invalid") return json({ message: "Enter a valid date of birth." }, 400);
  if (eligibility === "ineligible") {
    return json(
      { message: "This application cannot be accepted under the approved age requirements." },
      422,
    );
  }
  if (eligibility === "guardian_consent_required") {
    return json(
      {
        message:
          "Parent or legal guardian consent must be verified before this application can be accepted.",
      },
      422,
    );
  }

  const result = await submitMembershipApplication({
    applicantAuthId: applicant.id,
    verifiedEmail: applicant.email,
    idempotencyKey: idempotencyKey.data,
    draft: requestBody.data.draft,
    passportPhotoId: requestBody.data.passportPhotoId,
  });
  if (result.kind === "submitted") {
    return json(
      {
        message: "Your membership application was submitted.",
        applicationReference: result.result.applicationReference,
        status: result.result.status,
      },
      result.result.replay ? 200 : 201,
    );
  }
  if (result.kind === "invalid") {
    return json({ message: "Review the application and correct any incomplete information." }, 400);
  }
  if (result.kind === "invalid_photo") {
    return json(
      { message: "Upload a valid passport photograph before submitting your application." },
      400,
    );
  }
  if (result.kind === "conflict") {
    return json(
      {
        message: "An application already exists or this retry does not match the original request.",
      },
      409,
    );
  }
  return json({ message: "The application could not be submitted. Please try again later." }, 503);
}

function json(body: Record<string, string>, status: number) {
  return NextResponse.json(body, { status, headers: noStore });
}
