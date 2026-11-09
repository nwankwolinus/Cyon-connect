import { NextResponse } from "next/server";
import { updateApplicantPassword } from "@/modules/applicant-auth/composition";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  if (!hasTrustedAppOrigin(request)) {
    return NextResponse.json(
      { message: "Request could not be accepted." },
      { status: 403, headers: noStore },
    );
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Enter a valid password." },
      { status: 400, headers: noStore },
    );
  }

  const result = await updateApplicantPassword(input);
  if (result === "invalid") {
    return NextResponse.json(
      { message: "Enter a valid password." },
      { status: 400, headers: noStore },
    );
  }
  if (result === "unauthenticated") {
    return NextResponse.json(
      { message: "A verified sign-in is required." },
      { status: 401, headers: noStore },
    );
  }
  if (result === "rejected") {
    return NextResponse.json(
      { message: "Password could not be updated." },
      { status: 400, headers: noStore },
    );
  }
  if (result === "updated") {
    return NextResponse.json(
      { message: "Password updated. You can sign in now." },
      { status: 200, headers: noStore },
    );
  }
  return NextResponse.json(
    { message: "Password update is temporarily unavailable." },
    { status: 503, headers: noStore },
  );
}
