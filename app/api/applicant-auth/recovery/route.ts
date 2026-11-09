import { NextResponse } from "next/server";
import { requestApplicantRecovery } from "@/modules/applicant-auth/composition";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";

const genericAccepted = {
  message: "If the account can be recovered, instructions will be sent.",
};
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
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }

  const result = await requestApplicantRecovery(input);
  if (result === "invalid") {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }
  if (result === "accepted") {
    return NextResponse.json(genericAccepted, { status: 202, headers: noStore });
  }
  return NextResponse.json(
    { message: "Recovery is temporarily unavailable. Please try again later." },
    { status: 503, headers: noStore },
  );
}
