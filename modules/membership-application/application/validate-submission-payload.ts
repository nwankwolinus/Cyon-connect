import { membershipApplicationSubmissionSchema } from "../domain/submission";

export function getMembershipSubmissionValidationIssues(value: unknown) {
  const result = membershipApplicationSubmissionSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      }));
}
