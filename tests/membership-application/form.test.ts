import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHDIOCESAN_SOCIETY_OPTIONS,
  createInitialMembershipApplicationDraft,
  createInitialMembershipApplicationFormState,
  membershipApplicationFormReducer,
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
    expect(validateMembershipApplicationDraft(validDraft())).toEqual({});
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
    expect(renderSocieties()).toContain('id="otherSocietyText"');
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

  it("offers a review step but does not submit or persist form values", () => {
    const markup = renderToStaticMarkup(
      createElement(MembershipApplicationForm, { verifiedEmail: "applicant@example.test" }),
    );
    expect(markup).toContain("Review");
    expect(markup).toContain("does not submit or save an application");
    expect(markup).not.toMatch(/<form[^>]+action=/);
    const source = readFileSync(
      resolve(
        process.cwd(),
        "modules/membership-application/presentation/membership-application-form.tsx",
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /\bfetch\s*\(|localStorage|sessionStorage|createServerSupabaseClient|console\.|logger|window\.location/,
    );
  });
});
