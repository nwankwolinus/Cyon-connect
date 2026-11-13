import { describe, expect, it } from "vitest";
import {
  membershipApplicationSubmissionSchema,
  toPersistedApplicationPayload,
  type MembershipApplicationSubmissionDraft,
} from "@/modules/membership-application/domain/submission";

function validDraft(): MembershipApplicationSubmissionDraft {
  return {
    firstName: "Ada",
    middleName: "",
    surname: "Applicant",
    dateOfBirth: "2000-01-01",
    sex: "female",
    maritalStatus: "single",
    phone: "+2348012345678",
    residential: {
      street: "1 Road",
      area: "Ijegun",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
    },
    permanentSame: true,
    permanent: { street: "", area: "", city: "", state: "", country: "" },
    sacraments: {
      baptism: { status: "unknown", date: "", place: "" },
      communion: { status: "not_received", date: "", place: "" },
      confirmation: { status: "received", date: "", place: "Parish" },
      matrimonyApplicable: "no",
      matrimony: { status: "", date: "", place: "" },
    },
    currentlyBelongsElsewhere: "no",
    previouslyBelongedElsewhere: "no",
    currentParish: "",
    currentParishLocation: "",
    previousParish: "",
    previousParishLocation: "",
    parishJourney: "first_time",
    occupationStatus: "",
    occupationDescription: "",
    selectedSocieties: [],
    noSocieties: false,
    otherSocietySelected: false,
    otherSocietyText: "",
    emergencyName: "Grace Applicant",
    emergencyRelationship: "Aunt",
    emergencyPhone: "+2348023456789",
    emergencyAlternativePhone: "",
    emergencyConsent: true,
    schoolNotApplicable: true,
    school: "",
  };
}

describe("membership application submission contract", () => {
  it("validates the accepted form and excludes DOB from the persisted payload", () => {
    const parsed = membershipApplicationSubmissionSchema.parse(validDraft());
    const payload = toPersistedApplicationPayload(parsed, "verified@example.test");
    expect(JSON.stringify(payload).toLowerCase()).not.toMatch(/dateofbirth|date_of_birth|\bdob\b/);
    expect(payload.contact.verifiedEmail).toBe("verified@example.test");
    expect(payload.addresses.permanent).toBeNull();
  });

  it("requires a complete permanent address only when it differs", () => {
    const draft = validDraft();
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(true);
    draft.permanentSame = false;
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(false);
    draft.permanent = {
      street: "2 Road",
      area: "Area",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
    };
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects unapproved society values, contradictory None selections, and missing emergency consent", () => {
    const society = validDraft();
    society.selectedSocieties = ["Invented society"];
    expect(membershipApplicationSubmissionSchema.safeParse(society).success).toBe(false);
    society.selectedSocieties = [];
    society.noSocieties = true;
    society.otherSocietySelected = true;
    expect(membershipApplicationSubmissionSchema.safeParse(society).success).toBe(false);
    society.otherSocietySelected = false;
    expect(
      membershipApplicationSubmissionSchema.safeParse({ ...society, emergencyConsent: false })
        .success,
    ).toBe(false);
  });
});
