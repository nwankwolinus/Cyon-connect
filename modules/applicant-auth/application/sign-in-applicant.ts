export type ApplicantPasswordSignIn = {
  signInWithPassword(credentials: { readonly email: string; readonly password: string }): Promise<{
    readonly data: { readonly session: unknown | null };
    readonly error: unknown | null;
  }>;
};

/** Provider authentication only; protected access is verified separately on the server. */
export async function signInApplicant(
  auth: ApplicantPasswordSignIn,
  email: string,
  password: string,
): Promise<boolean> {
  try {
    const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
    return error === null && data.session !== null;
  } catch {
    return false;
  }
}
