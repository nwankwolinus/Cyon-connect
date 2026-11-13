import Link from "next/link";
import { redirect } from "next/navigation";
import { getTrustedAppDestination } from "@/infrastructure/config/public";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import { ApplicantSignOutButton } from "@/modules/applicant-auth/presentation/sign-out-button";
import {
  getMyMembershipApplicationDraft,
  getMyMembershipApplicationOverview,
  isMembershipApplicationSubmissionAvailable,
} from "@/modules/membership-application/composition";
import { MembershipApplicationForm } from "@/modules/membership-application/presentation/membership-application-form";
import { readApplicantPassportPhoto } from "@/modules/membership-application/composition-photo";

export const dynamic = "force-dynamic";

export default async function ApplicantApplicationFormPage() {
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
  const hasOpenApplication = ["submitted", "under_review", "on_hold", "approved"].includes(
    overview?.application?.status ?? "",
  );
  if (hasOpenApplication) redirect("/applicant");

  const savedDraft = available ? await getMyMembershipApplicationDraft(applicant.id) : null;
  const expired = Boolean(
    overview?.expiredDraftDisposed || (savedDraft && "expired" in savedDraft && savedDraft.expired),
  );
  const initialDraft =
    savedDraft && !expired && "payload" in savedDraft ? savedDraft.payload : null;
  const initialStep =
    savedDraft && !expired && "activeStep" in savedDraft ? savedDraft.activeStep : 0;
  const updatedAt =
    savedDraft && !expired && "updatedAt" in savedDraft ? savedDraft.updatedAt : null;
  const savedDraftId =
    savedDraft && !expired && "draftId" in savedDraft ? savedDraft.draftId : null;
  const savedPassportPhotoId =
    savedDraft && !expired && "passportPhotoId" in savedDraft ? savedDraft.passportPhotoId : null;
  const verifiedPassportPhotoId =
    savedPassportPhotoId && savedDraftId
      ? await readApplicantPassportPhoto({ applicantAuthId: applicant.id, draftId: savedDraftId })
          .then(() => savedPassportPhotoId)
          .catch(() => null)
      : null;

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-wide">CYON CONNECT</p>
          <p className="text-xs text-neutral-500">SS Joachim and Anne Parish, Ijegun</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/applicant" className="text-sm underline">
            My Application
          </Link>
          <ApplicantSignOutButton />
        </div>
      </header>
      {!available ? (
        <section className="mx-auto max-w-3xl px-4 py-10" role="status">
          <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-950">
            The application service is temporarily unavailable. Your form has not been submitted.
          </p>
        </section>
      ) : expired ? (
        <section className="mx-auto max-w-3xl px-4 py-10" role="status">
          <p className="rounded-md bg-neutral-100 p-4 text-sm">
            This draft expired after 30 days without a successful save. Its saved answers have been
            deleted. You can start a new application.
          </p>
          <Link href="/applicant" className="mt-4 inline-flex underline">
            Return to My Application
          </Link>
        </section>
      ) : (
        <MembershipApplicationForm
          verifiedEmail={applicant.email}
          submissionEnabled={available}
          draftPersistenceEnabled={available}
          initialDraft={initialDraft}
          initialStep={initialStep}
          initialDraftUpdatedAt={updatedAt}
          initialDraftId={savedDraftId}
          initialPassportPhotoId={verifiedPassportPhotoId}
        />
      )}
    </main>
  );
}
