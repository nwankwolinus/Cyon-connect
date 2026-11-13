import Link from "next/link";
import { redirect } from "next/navigation";
import { getTrustedAppDestination } from "@/infrastructure/config/public";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import { ApplicantSignOutButton } from "@/modules/applicant-auth/presentation/sign-out-button";
import {
  getMyMembershipApplicationOverview,
  isMembershipApplicationSubmissionAvailable,
} from "@/modules/membership-application/composition";

export const dynamic = "force-dynamic";

const statusText: Record<string, string> = {
  submitted: "Received. The application has not yet been reviewed.",
  under_review: "Your application is being reviewed by the parish.",
  on_hold:
    "Review is paused while the application is on hold. The parish will contact you if clarification is needed.",
  approved:
    "Your membership application was approved. Membership approval is separate from access to a CYON Connect account.",
  rejected:
    "This application was not approved. Its history is retained; a new application can be started if appropriate.",
  withdrawn: "This application was withdrawn.",
  closed: "This application is closed.",
};

export default async function ApplicantPage() {
  let applicant = null;
  try {
    applicant = await getVerifiedApplicant();
  } catch {
    applicant = null;
  }
  if (!applicant)
    redirect(getTrustedAppDestination("/applicant/sign-in", "unavailable").toString());

  const available = await isMembershipApplicationSubmissionAvailable();
  const overview = available ? await getMyMembershipApplicationOverview(applicant.id) : null;

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-wide">CYON CONNECT</p>
          <p className="text-xs text-neutral-500">Applicant access</p>
        </div>
        <ApplicantSignOutButton />
      </header>
      <section
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6"
        aria-labelledby="my-application-heading"
      >
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold tracking-wide text-neutral-600">
            SS Joachim and Anne Parish, Ijegun
          </p>
          <h1 id="my-application-heading" className="mt-2 text-2xl font-bold">
            My Application
          </h1>
          {!available || !overview ? (
            <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm text-amber-950" role="status">
              Application information is temporarily unavailable. Please retry later.
            </div>
          ) : (
            <>
              {overview.application && (
                <div className="mt-6 rounded-lg border border-neutral-200 p-4">
                  <h2 className="font-semibold">Application status</h2>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-neutral-500">Status</dt>
                      <dd className="mt-1 font-medium">
                        {overview.application.status.replaceAll("_", " ")}
                      </dd>
                    </div>
                    {overview.application.reference && (
                      <div>
                        <dt className="text-neutral-500">Application reference</dt>
                        <dd className="mt-1 break-all font-mono">
                          {overview.application.reference}
                        </dd>
                      </div>
                    )}
                    {overview.application.submittedAt && (
                      <div>
                        <dt className="text-neutral-500">Submitted</dt>
                        <dd className="mt-1">
                          {new Date(overview.application.submittedAt).toLocaleDateString("en-NG", {
                            dateStyle: "long",
                            timeZone: "Africa/Lagos",
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-4 text-sm text-neutral-700">
                    {statusText[overview.application.status] ??
                      "The application status is being updated."}
                  </p>
                  {overview.application.status === "approved" && overview.draft === null && (
                    <p className="mt-3 text-sm text-neutral-600">
                      Your system-account access is managed separately from this membership
                      decision.
                    </p>
                  )}
                </div>
              )}

              {overview.draft ? (
                <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <h2 className="font-semibold">Application in progress</h2>
                  <p className="mt-2 text-sm">
                    Last saved{" "}
                    {new Date(overview.draft.lastActivityAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Africa/Lagos",
                    })}
                  </p>
                  <p className="mt-1 text-sm">
                    Draft expires{" "}
                    {new Date(overview.draft.expiresAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    if there is no further successful save.
                  </p>
                  <Link
                    href="/applicant/form"
                    className="mt-4 inline-flex rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Resume application
                  </Link>
                </div>
              ) : overview.expiredDraftDisposed ? (
                <p
                  className="mt-6 rounded-md bg-neutral-100 p-4 text-sm text-neutral-700"
                  role="status"
                >
                  Your draft expired after 30 days without a successful save, and its saved answers
                  were deleted. You may start a new application.
                </p>
              ) : null}

              {!overview.draft &&
                !["submitted", "under_review", "on_hold", "approved"].includes(
                  overview.application?.status ?? "",
                ) && (
                  <div className="mt-6">
                    <Link
                      href="/applicant/form"
                      className="inline-flex rounded-md bg-neutral-900 px-5 py-3 text-sm font-semibold text-white"
                    >
                      {overview.application
                        ? "Start a new application"
                        : "Start membership application"}
                    </Link>
                    <p className="mt-3 text-xs text-neutral-600">
                      Draft progress is saved securely for 30 days after your last successful save.
                      Your date of birth must be entered again when resuming.
                    </p>
                    {!overview.application && !overview.expiredDraftDisposed && (
                      <p className="mt-2 text-sm text-neutral-600">
                        No submitted application or resumable draft is currently available. Expired
                        draft answers are deleted and cannot be resumed.
                      </p>
                    )}
                    {!overview.application && (
                      <p className="mt-2 text-sm text-neutral-600">
                        If an earlier draft expired, its saved answers have been deleted. Starting
                        again will create a new draft.
                      </p>
                    )}
                  </div>
                )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
