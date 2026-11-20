import { NextResponse } from "next/server";
import { registerApplicant } from "@/modules/applicant-auth/composition";
import { hasTrustedAppOrigin } from "@/infrastructure/config/public";

const GENERIC_ACCEPTED = {
  message: "If registration can proceed, confirmation instructions will be sent.",
};

export async function POST(request: Request): Promise<Response> {
  let trustedOrigin: boolean;
  try {
    trustedOrigin = hasTrustedAppOrigin(request);
  } catch (error) {
    logRegistrationRouteFailure("origin_validation", error);
    return unavailableResponse();
  }
  if (!trustedOrigin) {
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
      { message: "Enter a valid email, password, and date of birth." },
      { status: 400, headers: noStore },
    );
  }

  let result: Awaited<ReturnType<typeof registerApplicant>>;
  try {
    result = await registerApplicant(input);
  } catch (error) {
    logRegistrationRouteFailure("registration_service", error);
    return unavailableResponse();
  }
  if (result === "invalid") {
    return NextResponse.json(
      { message: "Enter a valid email, password, and date of birth." },
      { status: 400, headers: noStore },
    );
  }
  if (result === "ineligible") {
    return NextResponse.json(
      { message: "Registration is unavailable based on the eligibility requirements." },
      { status: 403, headers: noStore },
    );
  }
  if (result === "accepted") {
    return NextResponse.json(GENERIC_ACCEPTED, { status: 202, headers: noStore });
  }
  return unavailableResponse();
}

const noStore = { "cache-control": "no-store" };

function unavailableResponse(): Response {
  return NextResponse.json(
    { message: "Registration is temporarily unavailable. Please try again later." },
    { status: 503, headers: noStore },
  );
}

function logRegistrationRouteFailure(
  stage: "origin_validation" | "registration_service",
  error: unknown,
): void {
  try {
    console.error("[applicant-registration]", stage, safeErrorName(error));
  } catch {
    // Diagnostics must not prevent the generic response from being returned.
  }
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "NonError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : "Error";
}
