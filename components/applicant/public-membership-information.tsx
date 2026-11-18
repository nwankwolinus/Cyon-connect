import React from "react";
import Link from "next/link";
import { ParishCyonBrand } from "@/components/branding/parish-cyon-brand";

const applicationInformation = [
  "Personal and contact information",
  "Sacramental and parish history details",
  "Residential address and emergency contact",
  "A passport photograph before final submission",
];

const journeySteps = [
  "Create an applicant account and verify your email.",
  "Complete and review the membership application.",
  "Submit it for authorised parish review.",
  "Receive the parish decision and next steps.",
];

export function PublicMembershipInformation() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <header className="border-b border-emerald-950/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            aria-label="CYON Connect home"
            className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800"
          >
            <ParishCyonBrand />
          </Link>
          <Link
            href="/applicant/sign-in"
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 sm:px-4"
          >
            Applicant Sign In
          </Link>
        </div>
      </header>

      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -right-40 -top-32 -z-10 size-[34rem] rounded-full bg-emerald-100/70 blur-3xl"
        />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-900 shadow-sm">
              Membership at SS Joachim and Anne Parish, Ijegun
            </p>
            <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-emerald-950 sm:text-5xl lg:text-6xl">
              Take your next step with CYON
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Begin a membership application for the Catholic Youth Organization of Nigeria at SS
              Joachim and Anne Catholic Church, Ijegun. The application helps authorised parish
              personnel review your information.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/applicant/register"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-950 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
              >
                Start Membership Application
              </Link>
              <Link
                href="/applicant/sign-in"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/20 bg-white px-6 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
              >
                Existing applicant? Sign in
              </Link>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-xl shadow-emerald-950/5 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-800">
                  Before you begin
                </p>
                <h2 className="mt-2 text-2xl font-bold text-emerald-950">What to expect</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Applicants must be 16–40 years old inclusive. Applicants aged 16–17 need the required
              parent or legal guardian consent before an application can be accepted.
            </p>
            <h3 className="mt-6 text-sm font-bold text-slate-900">Information you will provide</h3>
            <ul className="mt-3 space-y-2.5">
              {applicationInformation.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-600"
                  />
                  {item}
                </li>
              ))}
            </ul>
            <h3 className="mt-7 text-sm font-bold text-slate-900">Application stages</h3>
            <ol className="mt-3 space-y-3">
              {journeySteps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-900">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Submitting an application does not automatically grant membership. Membership is
              granted only after the authorised parish review and approval process.
            </p>
          </aside>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 sm:px-8 sm:flex-row sm:items-center sm:justify-between">
          <ParishCyonBrand />
          <p className="text-xs text-slate-500">Membership application information</p>
        </div>
      </footer>
    </main>
  );
}
