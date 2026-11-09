"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/infrastructure/supabase/browser";

export function ApplicantSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await createBrowserSupabaseClient().auth.signOut();
    } catch {
      // The next protected request still validates the session server-side.
    } finally {
      setBusy(false);
      router.replace("/applicant/sign-in");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
