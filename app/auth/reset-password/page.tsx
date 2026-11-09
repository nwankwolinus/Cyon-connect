import Link from "next/link";
import { redirect } from "next/navigation";
import { getTrustedAppDestination } from "@/infrastructure/config/public";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import {
  PasswordUpdateForm,
  RecoveryRequestForm,
} from "@/modules/applicant-auth/presentation/auth-forms";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; status?: string }>;
}) {
  const { mode, status } = await searchParams;
  const updating = mode === "update";
  if (updating) {
    let applicant = null;
    try {
      applicant = await getVerifiedApplicant();
    } catch {
      applicant = null;
    }
    if (!applicant) {
      redirect(getTrustedAppDestination("/applicant/sign-in", "recovery-failed").toString());
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <Brand />
        <h1 className="mt-8 text-xl font-semibold">
          {updating ? "Choose a new password" : "Password recovery"}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {updating
            ? "Update the password for the verified identity that opened this link."
            : "Request a password recovery link."}
        </p>
        {status === "recovery-failed" ? (
          <p role="status" className="mt-4 text-sm text-neutral-700">
            The recovery link is invalid or expired. Request a new link.
          </p>
        ) : null}
        {updating ? <PasswordUpdateForm /> : <RecoveryRequestForm />}
        <p className="mt-5 text-sm text-neutral-600">
          <Link className="underline" href="/applicant/sign-in">
            Return to applicant sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div>
      <p className="text-sm font-semibold tracking-wide">CYON CONNECT</p>
      <p className="mt-1 text-xs text-neutral-500">SS Joachim and Anne Parish, Ijegun</p>
    </div>
  );
}
