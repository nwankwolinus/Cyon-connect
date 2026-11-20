import { NextResponse } from "next/server";
import { z } from "zod";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import { isMembershipApplicationSubmissionAvailable } from "@/modules/membership-application/composition";
import {
  passportPhotoLimits,
  readApplicantPassportPhoto,
  removeApplicantPassportPhoto,
  uploadApplicantPassportPhoto,
} from "@/modules/membership-application/composition-photo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const draftIdSchema = z.string().uuid();
const noStoreHeaders = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
const multipartBodyLimit = passportPhotoLimits.maxUploadBytes + 16_384;
type Applicant = NonNullable<Awaited<ReturnType<typeof getVerifiedApplicant>>>;

async function currentApplicant(
  request: Request,
): Promise<{ readonly response: Response } | { readonly applicant: Applicant }> {
  if (request.method !== "GET" && !hasTrustedAppOrigin(request)) {
    return { response: json({ message: "Request could not be accepted." }, 403) };
  }
  const applicant = await getVerifiedApplicant().catch(() => null);
  if (!applicant)
    return {
      response: json({ message: "Sign in with a verified email to manage this photograph." }, 401),
    };
  if (!(await isMembershipApplicationSubmissionAvailable())) {
    return {
      response: json({ message: "The application service is temporarily unavailable." }, 503),
    };
  }
  return { applicant };
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await currentApplicant(request);
  if ("response" in auth) return auth.response;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > multipartBodyLimit) {
    return json({ message: "Choose a supported image no larger than 4 MiB." }, 413);
  }
  let form: FormData;
  try {
    const bytes = await readBoundedBody(request, multipartBodyLimit);
    form = await new Response(new Uint8Array(bytes), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (error) {
    if (error instanceof Error && error.message === "photo_too_large") {
      return json({ message: "Choose an image no larger than 4 MiB." }, 413);
    }
    return json({ message: "Choose a valid passport photograph and try again." }, 400);
  }
  const draftId = draftIdSchema.safeParse(form.get("draftId"));
  const file = form.get("file");
  if (!draftId.success || !(file instanceof File) || file.size === 0) {
    return json({ message: "Save your draft and choose a passport photograph." }, 400);
  }
  if (file.size > passportPhotoLimits.maxUploadBytes) {
    return json({ message: "Choose an image no larger than 4 MiB." }, 413);
  }
  try {
    const result = await uploadApplicantPassportPhoto({
      applicantAuthId: auth.applicant.id,
      draftId: draftId.data,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return json({ photoId: result.photoId, draftUpdatedAt: result.draftUpdatedAt }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "photo_invalid") {
      return json(
        { message: "Use a valid JPEG, PNG or WebP image within the upload limits." },
        400,
      );
    }
    return json({ message: "The photograph could not be saved. Please retry." }, 503);
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = await currentApplicant(request);
  if ("response" in auth) return auth.response;
  const draftId = draftIdSchema.safeParse(new URL(request.url).searchParams.get("draftId"));
  if (!draftId.success) return json({ message: "Photograph unavailable." }, 404);
  try {
    const photo = await readApplicantPassportPhoto({
      applicantAuthId: auth.applicant.id,
      draftId: draftId.data,
    });
    if (!photo) return json({ message: "Photograph unavailable." }, 404);
    return new Response(new Uint8Array(photo), {
      status: 200,
      headers: {
        ...noStoreHeaders,
        "content-type": "image/jpeg",
        "content-length": String(photo.byteLength),
        "content-disposition": "inline; filename=passport-photo.jpg",
      },
    });
  } catch {
    return json({ message: "Photograph unavailable." }, 404);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = await currentApplicant(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: "Photograph could not be removed." }, 400);
  }
  const draftId = z.object({ draftId: z.string().uuid() }).strict().safeParse(body);
  if (!draftId.success) return json({ message: "Photograph could not be removed." }, 400);
  try {
    const removed = await removeApplicantPassportPhoto({
      applicantAuthId: auth.applicant.id,
      draftId: draftId.data.draftId,
    });
    return json({ removed }, 200);
  } catch {
    return json({ message: "The photograph could not be removed. Please retry." }, 503);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  if (!request.body) throw new Error("photo_request_invalid");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("photo_too_large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}
