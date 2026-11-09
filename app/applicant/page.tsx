import { redirect } from "next/navigation";
import { getTrustedAppDestination } from "@/infrastructure/config/public";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import { ApplicantSignOutButton } from "@/modules/applicant-auth/presentation/sign-out-button";
import { MembershipApplicationForm } from "@/modules/membership-application/presentation/membership-application-form";

export const dynamic = "force-dynamic";

export default async function ApplicantPage() {
  let applicant = null;
  try {
    applicant = await getVerifiedApplicant();
  } catch {
    applicant = null;
  }
  if (!applicant) {
    redirect(getTrustedAppDestination("/applicant/sign-in", "unavailable").toString());
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-wide">CYON CONNECT</p>
          <p className="text-xs text-neutral-500">Applicant access</p>
        </div>
        <ApplicantSignOutButton />
      </header>
      <MembershipApplicationForm verifiedEmail={applicant.email} />
    </main>
  );
}
