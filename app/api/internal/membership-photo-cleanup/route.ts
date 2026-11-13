import { NextResponse } from "next/server";
import { runMembershipPhotoCleanup } from "@/modules/membership-application/composition-photo-cleanup";
import { readBoundedRequestBody } from "./read-bounded-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const bodyLimitBytes = 1024;

export async function POST(request: Request): Promise<Response> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) {
      return json({ message: "Request could not be accepted." }, 400);
    }
    if (Number(declaredLength) > bodyLimitBytes) {
      await request.body?.cancel().catch(() => undefined);
      return json({ message: "Request could not be accepted." }, 413);
    }
  }
  const body = await readBoundedRequestBody(request, bodyLimitBytes);
  if (body === null) {
    return json({ message: "Request could not be accepted." }, 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({ message: "Request could not be accepted." }, 400);
  }

  const result = await runMembershipPhotoCleanup({
    body: JSON.stringify(parsed),
    timestamp: request.headers.get("x-cyon-cleanup-timestamp"),
    requestId: request.headers.get("x-cyon-cleanup-request-id"),
    signature: request.headers.get("x-cyon-cleanup-signature"),
  });
  if (result.kind === "unauthorized")
    return json({ message: "Request could not be accepted." }, 401);
  if (result.kind === "unavailable")
    return json({ message: "Cleanup is temporarily unavailable." }, 503);
  return json(result.counts, 200);
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
