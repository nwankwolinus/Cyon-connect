import React from "react";
import Link from "next/link";
import { ParishCyonBrand } from "@/components/branding/parish-cyon-brand";

export default function ApplicantRegistrationConfirmedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <ParishCyonBrand />

        <div className="mt-8">
          <h1 className="text-xl font-semibold">Email Verified Successfully!</h1>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Your email address has been successfully verified. Your CYON Connect applicant account
            is now ready.
          </p>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            You can now sign in to access your applicant dashboard and continue with your membership
            application.
          </p>

          <Link
            href="/applicant/sign-in"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Sign In to Continue
          </Link>

          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-600">
            <li>Sign in using the email address and password you registered with.</li>
            <li>Your membership application is not complete until you submit it.</li>
            <li>Email verification does not constitute membership approval.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
