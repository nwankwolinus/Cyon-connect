import { NextResponse } from "next/server";
import { registerApplicant } from "@/modules/applicant-auth/composition";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";

const GENERIC_ACCEPTED = {
  message: "If registration can proceed, confirmation instructions will be sent.",
};

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
    return NextResponse.json({ message: "Enter a valid email and password." }, { status: 400 });
  }

  const result = await registerApplicant(input);
  if (result === "invalid") {
    return NextResponse.json({ message: "Enter a valid email and password." }, { status: 400 });
  }
  if (result === "accepted") {
    return NextResponse.json(GENERIC_ACCEPTED, { status: 202, headers: noStore });
  }
  return NextResponse.json(
    { message: "Registration is temporarily unavailable. Please try again later." },
    { status: 503, headers: noStore },
  );
}

const noStore = { "cache-control": "no-store" };
