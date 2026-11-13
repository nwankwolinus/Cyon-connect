import { NextResponse } from "next/server";
import { z } from "zod";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import { saveMembershipApplicationDraft } from "@/modules/membership-application/composition";

export const dynamic = "force-dynamic";
const maxBodyBytes = 48 * 1024;
const requestSchema = z
  .object({
    payload: z.unknown(),
    activeStep: z.number().int().min(0).max(9),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
const noStore = { "cache-control": "no-store" };

export async function PUT(request: Request): Promise<Response> {
  if (!hasTrustedAppOrigin(request))
    return json({ message: "Request could not be accepted." }, 403);
  let applicant;
  try {
    applicant = await getVerifiedApplicant();
  } catch {
    applicant = null;
  }
  if (!applicant) return json({ message: "Sign in with a verified email to save progress." }, 401);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBodyBytes) return json({ message: "The draft could not be saved." }, 413);
  let raw: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBodyBytes)
      return json({ message: "The draft could not be saved." }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ message: "The draft could not be saved." }, 400);
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return json({ message: "Review the saved information and try again." }, 400);
  const outcome = await saveMembershipApplicationDraft({
    applicantAuthId: applicant.id,
    payload: parsed.data.payload,
    activeStep: parsed.data.activeStep,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });
  if (outcome.kind === "saved") return json(outcome.result, 200);
  if (outcome.kind === "invalid")
    return json({ message: "Review the saved information and try again." }, 400);
  if (outcome.kind === "conflict")
    return json(
      { message: "This draft changed in another session. Reload to get the latest saved version." },
      409,
    );
  if (outcome.kind === "application_open")
    return json(
      { message: "An application has already been submitted and cannot be changed as a draft." },
      409,
    );
  return json({ message: "Progress could not be saved. Please retry." }, 503);
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
