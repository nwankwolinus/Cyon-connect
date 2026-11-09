import Link from "next/link";
import { ApplicantRegistrationForm } from "@/modules/applicant-auth/presentation/auth-forms";

export default function ApplicantRegistrationPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <Brand />
        <h1 className="mt-8 text-xl font-semibold">Applicant registration</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Create a sign-in to begin the future membership application process.
        </p>
        <ApplicantRegistrationForm />
        <p className="mt-5 text-sm text-neutral-600">
          Already registered?{" "}
          <Link className="underline" href="/applicant/sign-in">
            Sign in
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
