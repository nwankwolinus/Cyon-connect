import React from "react";
import Link from "next/link";
import { ApplicantSignOutButton } from "@/modules/applicant-auth/presentation/sign-out-button";
import { ParishCyonBrand } from "@/components/branding/parish-cyon-brand";
import type { ApplicantApplicationOverview } from "@/modules/membership-application/domain/draft";

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

type ApplicantDashboardProps = {
  readonly overview: ApplicantApplicationOverview | null;
  readonly serviceUnavailable?: boolean;
  readonly submissionEnabled?: boolean;
};

export function ApplicantDashboard({
  overview,
  serviceUnavailable = false,
  submissionEnabled = false,
}: ApplicantDashboardProps) {
  const isNewApplicant = Boolean(overview && !overview.application && !overview.draft);

  return (
    <main className="min-h-screen bg-[#f7f8f4]">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <ParishCyonBrand />
        <ApplicantSignOutButton />
      </header>
      <section
        className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12"
        aria-labelledby="my-application-heading"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-800">
            Applicant portal
          </p>
          <h1
            id="my-application-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-emerald-950"
          >
            My Application
          </h1>
          {!serviceUnavailable && !submissionEnabled && !isNewApplicant && (
            <p
              className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
              role="status"
            >
              Membership application submission is temporarily unavailable. You can still view your
              application information here.
            </p>
          )}
          {serviceUnavailable ? (
            <div
              className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
              role="alert"
            >
              Application information is temporarily unavailable. Your application status has not
              been changed. Please try again later.
            </div>
          ) : overview?.application ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900">Application status</h2>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="mt-1 font-medium capitalize text-slate-900">
                    {overview.application.status.replaceAll("_", " ")}
                  </dd>
                </div>
                {overview.application.reference && (
                  <div>
                    <dt className="text-slate-500">Application reference</dt>
                    <dd className="mt-1 break-all font-mono text-slate-900">
                      {overview.application.reference}
                    </dd>
                  </div>
                )}
                {overview.application.submittedAt && (
                  <div>
                    <dt className="text-slate-500">Submitted</dt>
                    <dd className="mt-1 text-slate-900">
                      {new Date(overview.application.submittedAt).toLocaleDateString("en-NG", {
                        dateStyle: "long",
                        timeZone: "Africa/Lagos",
                      })}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-5 text-sm leading-6 text-slate-700">
                {statusText[overview.application.status] ??
                  "The application status is being updated."}
              </p>
              {overview.application.status === "approved" && (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Your CYON Connect system-account access is handled separately from the membership
                  decision.
                </p>
              )}
            </div>
          ) : overview?.draft ? (
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-semibold text-blue-950">
                Welcome back — your application is in progress
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-950">
                Last saved {formatParishDate(overview.draft.lastActivityAt)}. This draft expires
                after 30 days without a successful save.
              </p>
              {submissionEnabled && (
                <Link href="/applicant/form" className={primaryLinkClass}>
                  Continue application
                </Link>
              )}
            </div>
          ) : overview ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <h2 className="text-xl font-semibold text-emerald-950">
                Welcome to your applicant portal
              </h2>
              {overview.expiredDraftDisposed && (
                <p className="mt-3 text-sm leading-6 text-slate-700" role="status">
                  A previous draft expired after 30 days without a successful save and its saved
                  answers were deleted. You can start again.
                </p>
              )}
              <div className="mt-5 rounded-xl border border-emerald-900/10 bg-white p-5">
                <h3 className="text-lg font-semibold text-emerald-950">
                  Start Membership Application
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                  Complete your membership information for authorised parish review. Membership is
                  granted only after the parish review and approval process.
                </p>
                {submissionEnabled ? (
                  <Link href="/applicant/form" className={primaryLinkClass}>
                    Start Membership Application
                  </Link>
                ) : (
                  <button type="button" className={disabledButtonClass} disabled>
                    Start Membership Application
                  </button>
                )}
                {!submissionEnabled && (
                  <p className="mt-3 text-sm leading-6 text-slate-600" role="status">
                    Application intake is temporarily unavailable. Please check back later.
                  </p>
                )}
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  When intake is available, you can save progress as a draft and return later. Your
                  application is submitted only when you explicitly choose Submit Application.
                </p>
              </div>
            </div>
          ) : null}

          {submissionEnabled &&
            !serviceUnavailable &&
            overview?.application?.status === "rejected" &&
            !overview.draft && (
              <div className="mt-5">
                <Link href="/applicant/form" className={secondaryLinkClass}>
                  Start a new application
                </Link>
              </div>
            )}
          {submissionEnabled &&
            !serviceUnavailable &&
            overview?.application?.status === "withdrawn" &&
            !overview.draft && (
              <div className="mt-5">
                <Link href="/applicant/form" className={secondaryLinkClass}>
                  Start a new application
                </Link>
              </div>
            )}
          {submissionEnabled &&
            !serviceUnavailable &&
            overview?.application?.status === "closed" &&
            !overview.draft && (
              <div className="mt-5">
                <Link href="/applicant/form" className={secondaryLinkClass}>
                  Start a new application
                </Link>
              </div>
            )}
          {submissionEnabled && !serviceUnavailable && overview?.application && overview.draft && (
            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h2 className="font-semibold text-blue-950">A saved draft is also available</h2>
              <p className="mt-1 text-sm text-blue-950">
                Your saved draft is separate from the application shown above.
              </p>
              <Link href="/applicant/form" className={secondaryLinkClass}>
                Continue draft
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function formatParishDate(value: string) {
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}

const primaryLinkClass =
  "mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-950 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900";
const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/20 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900";
const disabledButtonClass =
  "mt-5 inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-xl bg-slate-300 px-5 py-3 text-sm font-bold text-slate-600";
