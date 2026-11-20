import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { membershipApplicationSubmissionSchema } from "@/modules/membership-application/domain/submission";
import {
  ARCHDIOCESAN_SOCIETY_OPTIONS,
  createInitialMembershipApplicationDraft,
  createInitialMembershipApplicationFormState,
  membershipApplicationFormReducer,
  restoreMembershipApplicationFormState,
  MembershipApplicationForm,
  MembershipApplicationReview,
  MembershipApplicationSocieties,
  VerifiedApplicantEmail,
  validateMembershipApplicationDraft,
  type MembershipApplicationDraft,
} from "@/modules/membership-application/presentation/membership-application-form";

function validDraft(): MembershipApplicationDraft {
  return {
    ...createInitialMembershipApplicationDraft(),
    firstName: "Ada",
    middleName: "M",
    surname: "Example",
    dateOfBirth: "2000-01-01",
    sex: "female",
    maritalStatus: "single",
    phone: "+234 801 234 5678",
    residential: {
      street: "1 Example Road",
      area: "Ijegun",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
    },
    sacraments: {
      baptism: { status: "unknown", date: "", place: "" },
      communion: { status: "not_received", date: "", place: "" },
      confirmation: { status: "received", date: "", place: "Parish" },
      matrimonyApplicable: "no",
      matrimony: { status: "", date: "", place: "" },
    },
    currentlyBelongsElsewhere: "no",
    previouslyBelongedElsewhere: "no",
    parishJourney: "first_time",
    emergencyName: "Grace Example",
    emergencyRelationship: "Aunt",
    emergencyPhone: "+234 802 345 6789",
    emergencyConsent: true,
  };
}

describe("membership application form", () => {
  it("renders the verified Auth email without providing an editable email input", () => {
    const markup = renderToStaticMarkup(
      createElement(VerifiedApplicantEmail, { email: "applicant@example.test" }),
    );
    expect(markup).toContain("applicant@example.test");
    expect(markup).not.toContain("<input");
  });

  it("accepts the approved required fields and leaves approved optional fields empty", () => {
    const draft = validDraft();
    expect(validateMembershipApplicationDraft(draft)).toEqual({});
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(true);
  });

  it("accepts formatted phone numbers consistently in client and server validation", () => {
    const draft = validDraft();
    draft.phone = "+234 (801) 234-5678";
    draft.emergencyPhone = "+234-802-345-6789";
    expect(validateMembershipApplicationDraft(draft)).toEqual({});
    const parsed = membershipApplicationSubmissionSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe("+2348012345678");
      expect(parsed.data.emergencyPhone).toBe("+2348023456789");
    }
  });

  it("rejects missing names, invalid or future birth dates, and unapproved choices", () => {
    const draft = validDraft();
    draft.firstName = " ";
    draft.surname = "";
    draft.dateOfBirth = "2035-02-31";
    draft.sex = "other";
    draft.maritalStatus = "unknown";
    expect(validateMembershipApplicationDraft(draft)).toMatchObject({
      firstName: expect.any(String),
      surname: expect.any(String),
      dateOfBirth: expect.any(String),
      sex: expect.any(String),
      maritalStatus: expect.any(String),
    });
    draft.dateOfBirth = "2099-01-01";
    expect(validateMembershipApplicationDraft(draft).dateOfBirth).toBeDefined();
  });

  it("requires sacramental responses but not dates or places; Matrimony details are conditional", () => {
    const draft = validDraft();
    draft.sacraments.baptism.status = "";
    draft.sacraments.matrimonyApplicable = "yes";
    const errors = validateMembershipApplicationDraft(draft);
    expect(errors["sacraments.baptism.status"]).toBeDefined();
    expect(errors["sacraments.matrimony.status"]).toBeDefined();
    expect(errors["sacraments.confirmation.date"]).toBeUndefined();
  });

  it("rejects invalid optional sacrament dates with field-level feedback in both validators", () => {
    const draft = validDraft();
    draft.sacraments.confirmation.date = "2024-02-30";
    expect(validateMembershipApplicationDraft(draft)["sacraments.confirmation.date"]).toBe(
      "Enter a valid date or leave the date blank.",
    );
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(false);
    draft.sacraments.confirmation.date = "";
    expect(
      validateMembershipApplicationDraft(draft)["sacraments.confirmation.date"],
    ).toBeUndefined();
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(true);
  });

  it("requires permanent-address fields only when the address differs", () => {
    const draft = validDraft();
    expect(validateMembershipApplicationDraft(draft)["permanent.street"]).toBeUndefined();
    draft.permanentSame = false;
    expect(validateMembershipApplicationDraft(draft)["permanent.street"]).toBeDefined();
  });

  it("requires parish details only for declared current or previous parish membership", () => {
    const draft = validDraft();
    expect(validateMembershipApplicationDraft(draft).currentParish).toBeUndefined();
    draft.currentlyBelongsElsewhere = "yes";
    draft.previouslyBelongedElsewhere = "yes";
    const errors = validateMembershipApplicationDraft(draft);
    expect(errors.currentParish).toBeDefined();
    expect(errors.previousParish).toBeDefined();
    expect(errors.parishJourney).toBeUndefined();
  });

  it("contains all 52 exact names from the Archdiocesan directory", () => {
    expect(ARCHDIOCESAN_SOCIETY_OPTIONS).toHaveLength(52);
    expect(ARCHDIOCESAN_SOCIETY_OPTIONS[2]).toBe(
      "Catholic Women Organisation of Nigeria Lagos Archdiocese (CWONLA) – Sister Adviser",
    );
    expect(ARCHDIOCESAN_SOCIETY_OPTIONS[51]).toBe("Altar Servers");
  });

  it("supports selecting and deselecting multiple societies and clears None currently", () => {
    const initial = createInitialMembershipApplicationFormState();
    const none = membershipApplicationFormReducer(initial, {
      type: "set-no-societies",
      selected: true,
    });
    const selectedFirst = membershipApplicationFormReducer(none, {
      type: "toggle-society",
      name: ARCHDIOCESAN_SOCIETY_OPTIONS[0],
    });
    const selectedSecond = membershipApplicationFormReducer(selectedFirst, {
      type: "toggle-society",
      name: ARCHDIOCESAN_SOCIETY_OPTIONS[1],
    });
    expect(selectedSecond.draft.noSocieties).toBe(false);
    expect(selectedSecond.draft.selectedSocieties).toEqual([
      ARCHDIOCESAN_SOCIETY_OPTIONS[0],
      ARCHDIOCESAN_SOCIETY_OPTIONS[1],
    ]);
    const deselected = membershipApplicationFormReducer(selectedSecond, {
      type: "toggle-society",
      name: ARCHDIOCESAN_SOCIETY_OPTIONS[0],
    });
    expect(deselected.draft.selectedSocieties).toEqual([ARCHDIOCESAN_SOCIETY_OPTIONS[1]]);
    const movedForward = membershipApplicationFormReducer(deselected, {
      type: "set-step",
      stepIndex: 7,
    });
    const movedBack = membershipApplicationFormReducer(movedForward, {
      type: "set-step",
      stepIndex: 6,
    });
    expect(movedBack.draft.selectedSocieties).toEqual([ARCHDIOCESAN_SOCIETY_OPTIONS[1]]);
  });

  it("makes None currently exclusive and clears society and Other selections", () => {
    let state = createInitialMembershipApplicationFormState();
    state = membershipApplicationFormReducer(state, {
      type: "toggle-society",
      name: ARCHDIOCESAN_SOCIETY_OPTIONS[0],
    });
    state = membershipApplicationFormReducer(state, { type: "set-other-society", selected: true });
    state = membershipApplicationFormReducer(state, {
      type: "update-field",
      field: "otherSocietyText",
      value: "Local group",
    });
    state = membershipApplicationFormReducer(state, {
      type: "set-no-societies",
      selected: true,
    });
    expect(state.draft.noSocieties).toBe(true);
    expect(state.draft.selectedSocieties).toEqual([]);
    expect(state.draft.otherSocietySelected).toBe(false);
    expect(state.draft.otherSocietyText).toBe("");
  });

  it("shows Other text only when selected and keeps the entire section optional", () => {
    let state = createInitialMembershipApplicationFormState();
    const renderSocieties = () =>
      renderToStaticMarkup(
        createElement(MembershipApplicationSocieties, {
          draft: state.draft,
          toggleSociety: (name) => {
            state = membershipApplicationFormReducer(state, { type: "toggle-society", name });
          },
          setNoSocieties: (selected) => {
            state = membershipApplicationFormReducer(state, { type: "set-no-societies", selected });
          },
          setOtherSociety: (selected) => {
            state = membershipApplicationFormReducer(state, {
              type: "set-other-society",
              selected,
            });
          },
          setOtherSocietyText: (value) => {
            state = membershipApplicationFormReducer(state, {
              type: "update-field",
              field: "otherSocietyText",
              value,
            });
          },
        }),
      );
    expect(validateMembershipApplicationDraft(validDraft())).toEqual({});
    expect(renderSocieties()).toContain('id="society-0"');
    expect(renderSocieties()).not.toContain('id="otherSocietyText"');
    state = membershipApplicationFormReducer(state, {
      type: "set-no-societies",
      selected: true,
    });
    state = membershipApplicationFormReducer(state, { type: "set-other-society", selected: true });
    expect(state.draft.noSocieties).toBe(false);
    state = membershipApplicationFormReducer(state, { type: "set-other-society", selected: false });
    expect(state.draft.otherSocietySelected).toBe(false);
    state = membershipApplicationFormReducer(state, { type: "set-other-society", selected: true });
    const otherMarkup = renderSocieties();
    expect(otherMarkup).toContain('id="otherSocietyText"');
    expect(otherMarkup).toMatch(/<input[^>]*id="otherSocietyText"[^>]*required=""/);
    state = membershipApplicationFormReducer(state, {
      type: "update-field",
      field: "otherSocietyText",
      value: "Community group",
    });
    state = membershipApplicationFormReducer(state, { type: "set-step", stepIndex: 6 });
    state = membershipApplicationFormReducer(state, { type: "set-step", stepIndex: 9 });
    expect(state.draft.otherSocietyText).toBe("Community group");
    const review = renderToStaticMarkup(
      createElement(MembershipApplicationReview, {
        draft: { ...validDraft(), ...state.draft },
        email: "verified@example.test",
      }),
    );
    expect(review).toContain("Other: Community group");
  });

  it("requires an Other society name with field-level feedback while keeping society membership optional", () => {
    const draft = validDraft();
    expect(validateMembershipApplicationDraft(draft).otherSocietyText).toBeUndefined();
    draft.otherSocietySelected = true;
    expect(validateMembershipApplicationDraft(draft).otherSocietyText).toBe(
      "Enter the society name, or deselect Other.",
    );
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(false);
    draft.otherSocietyText = "Catholic youth choir";
    expect(validateMembershipApplicationDraft(draft).otherSocietyText).toBeUndefined();
    expect(membershipApplicationSubmissionSchema.safeParse(draft).success).toBe(true);
  });

  it("shows the None currently choice and renders selected names accurately in review", () => {
    const draft = {
      ...validDraft(),
      selectedSocieties: [ARCHDIOCESAN_SOCIETY_OPTIONS[0], ARCHDIOCESAN_SOCIETY_OPTIONS[2]],
    };
    const markup = renderToStaticMarkup(
      createElement(MembershipApplicationSocieties, {
        draft,
        toggleSociety: () => undefined,
        setNoSocieties: () => undefined,
        setOtherSociety: () => undefined,
        setOtherSocietyText: () => undefined,
      }),
    );
    expect(markup).toContain("None currently");
    expect(markup).toContain(ARCHDIOCESAN_SOCIETY_OPTIONS[0]);
    const review = renderToStaticMarkup(
      createElement(MembershipApplicationReview, { draft, email: "verified@example.test" }),
    );
    expect(review).toContain(
      `${ARCHDIOCESAN_SOCIETY_OPTIONS[0]}, ${ARCHDIOCESAN_SOCIETY_OPTIONS[2]}`,
    );
    const noSocietiesReview = renderToStaticMarkup(
      createElement(MembershipApplicationReview, {
        draft: { ...draft, noSocieties: true, selectedSocieties: [] },
        email: "verified@example.test",
      }),
    );
    expect(noSocietiesReview).toContain("None currently");
  });

  it("requires emergency contact details, valid phone structure, and purpose acknowledgement", () => {
    const draft = validDraft();
    draft.emergencyName = "";
    draft.emergencyPhone = "not a telephone";
    draft.emergencyConsent = false;
    const errors = validateMembershipApplicationDraft(draft);
    expect(errors.emergencyName).toBeDefined();
    expect(errors.emergencyPhone).toBeDefined();
    expect(errors.emergencyConsent).toBeDefined();
  });

  it("retains values while navigating backward and forward through in-memory steps", () => {
    let state = createInitialMembershipApplicationFormState();
    state = membershipApplicationFormReducer(state, {
      type: "update-field",
      field: "firstName",
      value: "Ada",
    });
    state = membershipApplicationFormReducer(state, { type: "set-step", stepIndex: 4 });
    state = membershipApplicationFormReducer(state, { type: "set-step", stepIndex: 3 });
    expect(state.stepIndex).toBe(3);
    expect(state.draft.firstName).toBe("Ada");
  });

  it("restores saved answers and step while requiring DOB to be entered again", () => {
    const state = restoreMembershipApplicationFormState(
      { firstName: "Ada", residential: { city: "Lagos" } },
      5,
    );
    expect(state.stepIndex).toBe(5);
    expect(state.draft.firstName).toBe("Ada");
    expect(state.draft.residential.city).toBe("Lagos");
    expect(state.draft.dateOfBirth).toBe("");
  });

  it("excludes DOB from saved payload and uses only in-memory browser state", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "modules/membership-application/presentation/membership-application-form.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("function draftPayloadWithoutDob");
    expect(source).toContain('key !== "dateOfBirth"');
    expect(source).toContain('fetch("/api/membership-applications/draft"');
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("marks only local review as complete and displays the entered information for correction", () => {
    const initial = createInitialMembershipApplicationFormState();
    const draft = { ...validDraft(), firstName: "Ada" };
    const state = membershipApplicationFormReducer(
      { ...initial, draft },
      { type: "mark-reviewed" },
    );
    expect(state.reviewed).toBe(true);
    const markup = renderToStaticMarkup(
      createElement(MembershipApplicationReview, {
        draft: state.draft,
        email: "verified@example.test",
      }),
    );
    expect(markup).toContain("Ada M Example");
    expect(markup).toContain("verified@example.test");
    expect(markup).toContain("+234 801 234 5678");
    expect(markup).toContain("Not applicable");
  });

  it("offers a real submit action from the review step without browser storage or identity fields", () => {
    const markup = renderToStaticMarkup(
      createElement(MembershipApplicationForm, {
        verifiedEmail: "applicant@example.test",
        initialStep: 9,
      }),
    );
    expect(markup).toContain("Review");
    const source = readFileSync(
      resolve(
        process.cwd(),
        "modules/membership-application/presentation/membership-application-form.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("Submit application");
    expect(source).toContain('fetch("/api/membership-applications/submit"');
    expect(source).toContain("onSubmit={preventImplicitSubmission}");
    expect(source).not.toContain("onSubmit={finishReview}");
    expect(source).toContain("onClick={() => void submitApplication()}");
    expect(source).toContain("stepIndex !== steps.length - 1");
    expect(source).toContain("submissionInFlight.current");
    expect(source).toContain(
      "disabled={submitting || !submissionEnabled || !passportPhotoId || photoBusy}",
    );
    expect(source).toContain(
      "Upload a valid passport photograph before submitting your application.",
    );
    expect(markup).toContain("Passport photograph");
    expect(markup).toContain("Required before final submission");
    expect(markup).toContain("Save progress to prepare a secure draft upload.");
    expect(source).toContain("useEffect(() =>");
    expect(source).toContain('fetch("/api/membership-applications/draft"');
    expect(source).toContain("function draftPayloadWithoutDob");
    expect(source).toContain('key !== "dateOfBirth"');
    expect(source).not.toMatch(
      /localStorage|sessionStorage|createServerSupabaseClient|console\.|logger|window\.location/,
    );
  });

  it("keeps navigation controls non-submitting and the review action explicit", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "modules/membership-application/presentation/membership-application-form.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("<form onSubmit={preventImplicitSubmission} noValidate>");
    expect(source).toContain('<button type="button" onClick={next} className={primaryButton}>');
    expect(source).toMatch(
      /<button\s+type="button"\s+onClick=\{\(\) => void submitApplication\(\)\}/,
    );
    expect(source).not.toContain('type="submit"');
  });
});
