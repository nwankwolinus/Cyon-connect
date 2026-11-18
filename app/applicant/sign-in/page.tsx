import React from "react";
import Link from "next/link";
import { ApplicantSignInForm } from "@/modules/applicant-auth/presentation/auth-forms";
import { ParishCyonBrand } from "@/components/branding/parish-cyon-brand";

export default async function ApplicantSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <ParishCyonBrand />
        <h1 className="mt-8 text-xl font-semibold">Applicant sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Sign in with the email identity you verified.
        </p>
        <ApplicantSignInForm status={status} />
        <div className="mt-5 flex justify-between text-sm text-neutral-600">
          <Link className="underline" href="/applicant/register">
            Register
          </Link>
          <Link className="underline" href="/auth/reset-password">
            Forgot password?
          </Link>
        </div>
        <p className="mt-5 text-center text-sm">
          <Link
            className="font-medium text-emerald-900 underline underline-offset-4"
            href="/applicant"
          >
            Membership information
          </Link>
        </p>
      </section>
    </main>
  );
}
