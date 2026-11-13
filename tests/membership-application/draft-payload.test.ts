import { describe, expect, it } from "vitest";
import { membershipApplicationDraftPayloadSchema } from "@/modules/membership-application/domain/draft";

describe("membership application draft payload", () => {
  it("accepts incomplete, partial progress", () => {
    expect(membershipApplicationDraftPayloadSchema.safeParse({ firstName: "Ada" }).success).toBe(
      true,
    );
  });

  it.each(["dateOfBirth", "dob", "date_of_birth"])("rejects DOB key %s", (key) => {
    expect(membershipApplicationDraftPayloadSchema.safeParse({ [key]: "2000-01-01" }).success).toBe(
      false,
    );
    expect(
      membershipApplicationDraftPayloadSchema.safeParse({ section: { [key]: "2000-01-01" } })
        .success,
    ).toBe(false);
  });

  it("rejects applicant identity, parish and unknown keys", () => {
    expect(
      membershipApplicationDraftPayloadSchema.safeParse({
        applicantId: "forged",
        parishId: "forged",
      }).success,
    ).toBe(false);
  });
});
