import {
  getPasswordUpdateDestination,
  getTrustedAppDestination,
} from "@/infrastructure/config/public";
import { consumeApplicantAuthCallback } from "@/modules/applicant-auth/composition";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const result = await consumeApplicantAuthCallback({
    code: requestUrl.searchParams.get("code"),
    tokenHash: requestUrl.searchParams.get("token_hash"),
    flow: requestUrl.searchParams.get("flow"),
  });
  if (result.kind === "verified") {
    const destination = result.recovery
      ? getPasswordUpdateDestination()
      : getTrustedAppDestination("/applicant/registration-confirmed");
    return redirectWithoutCaching(destination);
  }
  return failed(result.recovery);
}

function failed(recovery: boolean): Response {
  return redirectWithoutCaching(
    getTrustedAppDestination(
      recovery ? "/auth/reset-password" : "/applicant/sign-in",
      recovery ? "recovery-failed" : "confirmation-failed",
    ),
  );
}

function redirectWithoutCaching(destination: URL): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: destination.toString(),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
