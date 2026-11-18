import React from "react";
import { getVerifiedApplicant } from "@/modules/applicant-auth/composition";
import { ApplicantDashboard } from "@/components/applicant/applicant-dashboard";
import { PublicMembershipInformation } from "@/components/applicant/public-membership-information";
import {
  getMyMembershipApplicationOverview,
  isMembershipApplicationOverviewAvailable,
  isMembershipApplicationSubmissionAvailable,
} from "@/modules/membership-application/composition";
import { createConsoleLogger } from "@/infrastructure/logging/console-logger";
import { describeError } from "@/shared/logging/logger";

const logger = createConsoleLogger({ module: "applicant-dashboard" });

export const dynamic = "force-dynamic";

export default async function ApplicantPage() {
  let applicant = null;
  try {
    applicant = await getVerifiedApplicant();
  } catch {
    // The public information page remains available when Auth cannot be reached.
  }
  if (!applicant) return <PublicMembershipInformation />;

  const available = await isMembershipApplicationOverviewAvailable();
  if (!available) return <ApplicantDashboard overview={null} serviceUnavailable />;

  try {
    const overview = await getMyMembershipApplicationOverview(applicant.id);
    const submissionEnabled = await isMembershipApplicationSubmissionAvailable();
    return (
      <ApplicantDashboard
        overview={overview}
        serviceUnavailable={!overview}
        submissionEnabled={submissionEnabled}
      />
    );
  } catch (error) {
    logger.error("applicant dashboard overview could not be loaded", {
      failureStage: "overview_load",
      ...describeError(error),
    });
    return <ApplicantDashboard overview={null} serviceUnavailable />;
  }
}
