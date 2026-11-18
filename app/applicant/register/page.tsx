import React from "react";
import Link from "next/link";
import { ApplicantRegistrationForm } from "@/modules/applicant-auth/presentation/auth-forms";
import { ParishCyonBrand } from "@/components/branding/parish-cyon-brand";

export default function ApplicantRegistrationPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 sm:px-6 sm:py-10">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <ParishCyonBrand />
        <Link
          href="/applicant"
          className="text-sm font-semibold text-emerald-900 underline underline-offset-4"
        >
          Membership information
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-6xl justify-center py-8 sm:py-12">
        <section
          aria-labelledby="registration-heading"
          className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg shadow-neutral-900/5"
        >
          <div className="px-6 pt-7 sm:px-10 sm:pt-9">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Applicant account
            </p>
            <h1
              id="registration-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl"
            >
              Applicant Registration
            </h1>
            <p className="mt-2 max-w-prose text-sm leading-6 text-neutral-600">
              Create a secure sign-in to begin the membership application process.
            </p>
          </div>

          <div className="px-6 pb-7 pt-6 sm:px-10 sm:pb-9">
            <ApplicantRegistrationForm />
            <p className="mt-6 border-t border-neutral-200 pt-5 text-center text-sm text-neutral-600">
              Already have an applicant sign-in?{" "}
              <Link
                className="font-semibold text-neutral-900 underline decoration-neutral-400 underline-offset-4 hover:decoration-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                href="/applicant/sign-in"
              >
                Sign in
              </Link>
            </p>
          </div>

          <aside className="border-t border-neutral-200 bg-neutral-50 px-6 py-5 sm:px-10">
            <p className="text-sm font-semibold text-neutral-800">
              Your membership journey stays protected
            </p>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              Registration creates an Auth identity only. It does not create a membership or account
              record.
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
