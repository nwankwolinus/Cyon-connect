export type ApplicantAuthUser = {
  readonly id: string;
  readonly email: string;
  readonly emailConfirmedAt: string | null;
};

export type ApplicantSessionReader = {
  getCurrentAuthUser(): Promise<ApplicantAuthUser | null>;
};

/** Auth identity only: this deliberately does not read members or user_accounts. */
export async function verifyApplicantSession(
  reader: ApplicantSessionReader,
): Promise<ApplicantAuthUser | null> {
  const user = await reader.getCurrentAuthUser();
  if (!user?.id || !user.email || !user.emailConfirmedAt) return null;
  return user;
}
