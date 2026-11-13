import React from "react";
import Link from "next/link";

const steps = [
  "Create an applicant account",
  "Verify your email and sign in",
  "Complete your membership application",
  "Submit your application for parish review",
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8f4] text-slate-900">
      <header className="relative z-10 border-b border-slate-200/80 bg-white/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="CYON Connect home" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-emerald-950 text-xs font-extrabold tracking-wide text-white shadow-sm">
              CYON
            </span>
            <span>
              <span className="block text-sm font-extrabold tracking-[0.14em] text-emerald-950">
                CYON CONNECT
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                SS Joachim and Anne Parish, Ijegun
              </span>
            </span>
          </Link>
          <nav aria-label="Applicant links" className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/applicant/sign-in"
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 sm:px-4"
            >
              Applicant Sign In
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute -right-36 -top-32 -z-10 size-[34rem] rounded-full bg-emerald-100/70 blur-3xl"
        />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-900 shadow-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
              Catholic Youth Organization of Nigeria
            </p>
            <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-emerald-950 sm:text-5xl lg:text-6xl">
              Welcome to <span className="text-emerald-700">CYON Connect</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
              Your digital gateway to the Catholic Youth Organization of Nigeria at SS Joachim and
              Anne Parish, Ijegun.
            </p>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Create an applicant account to begin your membership application, or sign in to
              continue with an existing applicant account.
            </p>

            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm shadow-amber-950/5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
                  New applicant
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start with a secure applicant account and verified email.
                </p>
                <Link
                  href="/applicant/register"
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                >
                  Create Applicant Account
                </Link>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/75 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Existing applicant
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Return to your applicant sign-in to continue.
                </p>
                <Link
                  href="/applicant/sign-in"
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-900/20 bg-white px-4 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                >
                  Applicant Sign In
                </Link>
              </div>
            </div>
          </div>

          <aside
            aria-labelledby="journey-heading"
            className="relative rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-2xl shadow-emerald-950/15 sm:p-9"
          >
            <div
              aria-hidden="true"
              className="absolute right-7 top-7 grid size-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-amber-300"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
                <path
                  d="M12 3v18M5 10h14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
              Your application journey
            </p>
            <h2 id="journey-heading" className="mt-3 max-w-sm text-2xl font-bold leading-tight">
              A clear path from account to parish review
            </h2>
            <ol className="mt-8 space-y-5">
              {steps.map((step, index) => (
                <li key={step} className="flex items-start gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-emerald-200/30 bg-white/10 text-sm font-bold text-amber-200">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-sm leading-6 text-emerald-50">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-8 border-t border-white/15 pt-5 text-sm leading-6 text-emerald-100">
              Submitting an application begins the parish review process. It does not mean that
              membership has been approved.
            </p>
          </aside>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-sm sm:px-8 md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-emerald-950">CYON Connect</p>
          <p className="text-slate-600">SS Joachim and Anne Parish, Ijegun</p>
        </div>
      </footer>
    </main>
  );
}
