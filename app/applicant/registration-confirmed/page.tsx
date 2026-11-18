import React from "react";
import Link from "next/link";
import { ParishCyonBrand } from "@/components/branding/parish-cyon-brand";

export default function ApplicantRegistrationConfirmedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <ParishCyonBrand />

        <div className="mt-8">
          <h1 className="text-xl font-semibold">Email Address Verified Successfully</h1>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Your email address has been verified, and your CYON Connect applicant account is ready.
          </p>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Email verification does not mean your membership application has been submitted or
            approved. Continue to your applicant portal to start or resume your application.
          </p>

          <Link
            href="/applicant"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Continue to My Application
          </Link>
        </div>
      </section>
    </main>
  );
}
