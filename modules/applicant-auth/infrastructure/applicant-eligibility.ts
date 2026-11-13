import "server-only";

export type ApplicantEligibility = "eligible" | "ineligible" | "invalid";

export function getCurrentParishDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
}

/** DOB-only server service. Never log, persist, return, or forward DOB/age values. */
export function evaluateApplicantEligibility(
  dateOfBirth: string,
  onDate: string,
): ApplicantEligibility {
  const age = getApplicantAgeOnDate(dateOfBirth, onDate);
  if (age === null) return "invalid";
  return age >= 16 && age <= 40 ? "eligible" : "ineligible";
}

/** Submission additionally requires the approved but not-yet-implemented minor-consent path. */
export function evaluateMembershipSubmissionEligibility(
  dateOfBirth: string,
  onDate: string,
): "eligible" | "ineligible" | "guardian_consent_required" | "invalid" {
  const age = getApplicantAgeOnDate(dateOfBirth, onDate);
  if (age === null) return "invalid";
  if (age < 16 || age > 40) return "ineligible";
  if (age < 18) return "guardian_consent_required";
  return "eligible";
}

/** Transient server-only age calculation; callers must not persist or log the result. */
export function getApplicantAgeOnDate(dateOfBirth: string, onDate: string): number | null {
  if (!isDateOnly(dateOfBirth) || !isDateOnly(onDate) || dateOfBirth > onDate) return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [currentYear, currentMonth, currentDay] = onDate.split("-").map(Number);
  let age = currentYear! - birthYear!;
  if (currentMonth! < birthMonth! || (currentMonth === birthMonth && currentDay! < birthDay!)) {
    age -= 1;
  }

  return age;
}
