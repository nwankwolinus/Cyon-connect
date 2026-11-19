"use client";

import React, { useEffect, useReducer, useRef, useState, type FormEvent } from "react";

type SacramentStatus = "" | "received" | "not_received" | "unknown";
type Sacrament = { status: SacramentStatus; date: string; place: string };
type Address = { street: string; area: string; city: string; state: string; country: string };
export type MembershipApplicationDraft = {
  firstName: string;
  middleName: string;
  surname: string;
  dateOfBirth: string;
  sex: string;
  maritalStatus: string;
  phone: string;
  residential: Address;
  permanentSame: boolean;
  permanent: Address;
  sacraments: {
    baptism: Sacrament;
    communion: Sacrament;
    confirmation: Sacrament;
    matrimonyApplicable: string;
    matrimony: Sacrament;
  };
  currentlyBelongsElsewhere: string;
  previouslyBelongedElsewhere: string;
  currentParish: string;
  currentParishLocation: string;
  previousParish: string;
  previousParishLocation: string;
  parishJourney: string;
  occupationStatus: string;
  occupationDescription: string;
  selectedSocieties: string[];
  noSocieties: boolean;
  otherSocietySelected: boolean;
  otherSocietyText: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  emergencyAlternativePhone: string;
  emergencyConsent: boolean;
  schoolNotApplicable: boolean;
  school: string;
};

const emptyAddress = (): Address => ({ street: "", area: "", city: "", state: "", country: "" });
const emptySacrament = (): Sacrament => ({ status: "", date: "", place: "" });
export const createInitialMembershipApplicationDraft = (): MembershipApplicationDraft => ({
  firstName: "",
  middleName: "",
  surname: "",
  dateOfBirth: "",
  sex: "",
  maritalStatus: "",
  phone: "",
  residential: emptyAddress(),
  permanentSame: true,
  permanent: emptyAddress(),
  sacraments: {
    baptism: emptySacrament(),
    communion: emptySacrament(),
    confirmation: emptySacrament(),
    matrimonyApplicable: "",
    matrimony: emptySacrament(),
  },
  currentlyBelongsElsewhere: "",
  previouslyBelongedElsewhere: "",
  currentParish: "",
  currentParishLocation: "",
  previousParish: "",
  previousParishLocation: "",
  parishJourney: "",
  occupationStatus: "",
  occupationDescription: "",
  selectedSocieties: [],
  noSocieties: false,
  otherSocietySelected: false,
  otherSocietyText: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  emergencyAlternativePhone: "",
  emergencyConsent: false,
  schoolNotApplicable: false,
  school: "",
});

export type MembershipApplicationFormState = {
  readonly draft: MembershipApplicationDraft;
  readonly stepIndex: number;
  readonly reviewed: boolean;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type MembershipApplicationFormAction =
  | { readonly type: "set-step"; readonly stepIndex: number }
  | {
      readonly type: "update-field";
      readonly field: keyof MembershipApplicationDraft;
      readonly value: MembershipApplicationDraft[keyof MembershipApplicationDraft];
    }
  | {
      readonly type: "update-address";
      readonly address: "residential" | "permanent";
      readonly field: keyof Address;
      readonly value: string;
    }
  | {
      readonly type: "update-sacrament";
      readonly sacrament: SacramentName;
      readonly value: Sacrament;
    }
  | { readonly type: "update-matrimony-applicability"; readonly value: string }
  | { readonly type: "toggle-society"; readonly name: string }
  | { readonly type: "set-no-societies"; readonly selected: boolean }
  | { readonly type: "set-other-society"; readonly selected: boolean }
  | { readonly type: "mark-reviewed" }
  | { readonly type: "reset" };

export const ARCHDIOCESAN_SOCIETY_OPTIONS = [
  "Lagos Archdiocesan Catholic Men Organization of Nigeria (LACMON)",
  "Catholic Women Organisation Lagos Archdiocese (CWONLA)",
  "Catholic Women Organisation of Nigeria Lagos Archdiocese (CWONLA) – Sister Adviser",
  "Catholic Young Adults Association (CYAA)",
  "Catholic Youth Organization of Nigeria (CYON)",
  "Pontifical Mission Societies",
  "Young Missionary Movement of Nigeria (YOMM)",
  "Missionary Childhood Association (MCA) Coordinator",
  "Apostleship of Prayer / League of Sacred Heart of Jesus",
  "Apostolate of the Precious Blood of Jesus Christ",
  "Association of Papal Knights and Medalists",
  "Association of Sacred Heart of Jesus and Immaculate Heart of Mary",
  "Ave Maria Society",
  "Blessed Tansi Solidarity Movement",
  "Block Rosary Crusade (BRC)",
  "Guild of Catechists",
  "Board of Church Wardens",
  "Board of Lectors",
  "Catholic Biblical Instructors Union (CBIU)",
  "Catholic Biblical Movement of Nigeria (CBMN)",
  "Catholic Charismatic Renewal of Nigeria (CCRN)",
  "Catholic Confraternity of Christian Fathers (CCCF)",
  "Catholic Sisters United in Christ (CSU)",
  "Confraternity of the Miraculous Infant Jesus of Prague",
  "Confraternity of Mary Queen of all Hearts",
  "Confraternity of Our Mother of Perpetual Help",
  "Couples for Christ (CFC)",
  "Community of Companions of Priests and Religious (CCPR)",
  "Divine Mercy Devotion Prayer Group",
  "Guild of Catholic Nurses",
  "Guild of St. Anthony of Padua",
  "Knights and Ladies of St. John International",
  "Knights and Ladies of St. Mulumba",
  "Lagos Archdiocesan Confraternity of Christian Mothers (LACCM)",
  "Legion of Mary Society",
  "Men of Order and Discipline (MOD)",
  "Pages of the Blessed Sacrament",
  "Pastoral Bereavement and Caring Ministry",
  "Purgatorian Society",
  "Society of St. Vincent de Paul (SSVP)",
  "St. Joseph Society",
  "St. John Vianney Group",
  "St. Jude Catholic Society",
  "St. Philomena Society",
  "St. Pio Prayer Group",
  "St. Rita Society",
  "Women of Divine Love",
  "World Apostolate of Fatima (Blue Army)",
  "Young Christian Workers Movement (YCW)",
  "Young Catholic Professionals (YCP)",
  "Association of Catholic Medical Practitioners of Nigeria, Lagos Chapter",
  "Altar Servers",
] as const;

export function createInitialMembershipApplicationFormState(): MembershipApplicationFormState {
  return { draft: createInitialMembershipApplicationDraft(), stepIndex: 0, reviewed: false };
}

export function restoreMembershipApplicationFormState(
  saved: DeepPartial<MembershipApplicationDraft> | null | undefined,
  activeStep = 0,
): MembershipApplicationFormState {
  const empty = createInitialMembershipApplicationDraft();
  const savedSacraments = saved?.sacraments;
  return {
    draft: {
      ...empty,
      ...saved,
      // DOB is never persisted; an applicant re-enters it after resuming.
      dateOfBirth: "",
      residential: { ...empty.residential, ...saved?.residential },
      permanent: { ...empty.permanent, ...saved?.permanent },
      sacraments: {
        baptism: { ...empty.sacraments.baptism, ...savedSacraments?.baptism },
        communion: { ...empty.sacraments.communion, ...savedSacraments?.communion },
        confirmation: { ...empty.sacraments.confirmation, ...savedSacraments?.confirmation },
        matrimonyApplicable:
          savedSacraments?.matrimonyApplicable ?? empty.sacraments.matrimonyApplicable,
        matrimony: { ...empty.sacraments.matrimony, ...savedSacraments?.matrimony },
      },
    },
    stepIndex: Math.max(0, Math.min(activeStep, 9)),
    reviewed: false,
  };
}

function draftPayloadWithoutDob(
  draft: MembershipApplicationDraft,
): Omit<MembershipApplicationDraft, "dateOfBirth"> {
  return Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "dateOfBirth")) as Omit<
    MembershipApplicationDraft,
    "dateOfBirth"
  >;
}

export function membershipApplicationFormReducer(
  state: MembershipApplicationFormState,
  action: MembershipApplicationFormAction,
): MembershipApplicationFormState {
  switch (action.type) {
    case "set-step":
      return { ...state, stepIndex: Math.max(0, Math.min(action.stepIndex, 9)) };
    case "update-field":
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value } as MembershipApplicationDraft,
        reviewed: false,
      };
    case "update-address":
      return {
        ...state,
        draft: {
          ...state.draft,
          [action.address]: { ...state.draft[action.address], [action.field]: action.value },
        },
        reviewed: false,
      };
    case "update-sacrament":
      return {
        ...state,
        draft: {
          ...state.draft,
          sacraments: { ...state.draft.sacraments, [action.sacrament]: action.value },
        },
        reviewed: false,
      };
    case "update-matrimony-applicability":
      return {
        ...state,
        draft: {
          ...state.draft,
          sacraments: { ...state.draft.sacraments, matrimonyApplicable: action.value },
        },
        reviewed: false,
      };
    case "toggle-society": {
      if (
        !ARCHDIOCESAN_SOCIETY_OPTIONS.includes(
          action.name as (typeof ARCHDIOCESAN_SOCIETY_OPTIONS)[number],
        )
      )
        return state;
      const isSelected = state.draft.selectedSocieties.includes(action.name);
      return {
        ...state,
        draft: {
          ...state.draft,
          selectedSocieties: isSelected
            ? state.draft.selectedSocieties.filter((name) => name !== action.name)
            : [...state.draft.selectedSocieties, action.name],
          noSocieties: isSelected ? state.draft.noSocieties : false,
        },
        reviewed: false,
      };
    }
    case "set-no-societies":
      return {
        ...state,
        draft: {
          ...state.draft,
          noSocieties: action.selected,
          selectedSocieties: action.selected ? [] : state.draft.selectedSocieties,
          otherSocietySelected: action.selected ? false : state.draft.otherSocietySelected,
          otherSocietyText: action.selected ? "" : state.draft.otherSocietyText,
        },
        reviewed: false,
      };
    case "set-other-society":
      return {
        ...state,
        draft: {
          ...state.draft,
          noSocieties: action.selected ? false : state.draft.noSocieties,
          otherSocietySelected: action.selected,
          otherSocietyText: action.selected ? state.draft.otherSocietyText : "",
        },
        reviewed: false,
      };
    case "mark-reviewed":
      return { ...state, reviewed: true };
    case "reset":
      return createInitialMembershipApplicationFormState();
  }
}

const steps = [
  "Personal information",
  "Contact information",
  "Addresses",
  "Sacraments",
  "Parish history",
  "Occupation",
  "Societies",
  "Emergency contact",
  "School",
  "Review",
] as const;
type Draft = MembershipApplicationDraft;
type Step = (typeof steps)[number];
type Errors = Record<string, string>;

export function MembershipApplicationForm({
  verifiedEmail,
  submissionEnabled = false,
  draftPersistenceEnabled = false,
  initialDraft = null,
  initialStep = 0,
  initialDraftUpdatedAt = null,
  initialDraftId = null,
  initialPassportPhotoId = null,
}: {
  readonly verifiedEmail: string;
  readonly submissionEnabled?: boolean;
  readonly draftPersistenceEnabled?: boolean;
  readonly initialDraft?: DeepPartial<MembershipApplicationDraft> | null;
  readonly initialStep?: number;
  readonly initialDraftUpdatedAt?: string | null;
  readonly initialDraftId?: string | null;
  readonly initialPassportPhotoId?: string | null;
}) {
  const [formState, dispatch] = useReducer(
    membershipApplicationFormReducer,
    restoreMembershipApplicationFormState(initialDraft, initialStep),
  );
  const { draft, stepIndex } = formState;
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applicationReference, setApplicationReference] = useState("");
  const [passportPhotoId, setPassportPhotoId] = useState<string | null>(initialPassportPhotoId);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const retryKey = useRef<{ payload: string; key: string } | null>(null);
  const submissionInFlight = useRef(false);
  const draftUpdatedAt = useRef<string | null>(initialDraftUpdatedAt);
  const draftId = useRef<string | null>(initialDraftId);
  const draftDirty = useRef(false);
  const draftRevision = useRef(0);
  const saveSequence = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveProgressRef = useRef<
    (snapshot?: MembershipApplicationDraft, snapshotStep?: number) => Promise<void>
  >(() => Promise.resolve());
  const [requiresDobReentry, setRequiresDobReentry] = useState(Boolean(initialDraft));
  const [resumeDob, setResumeDob] = useState("");
  const [resumeDobError, setResumeDobError] = useState("");
  const step = steps[stepIndex] ?? "Personal information";
  const fieldErrors = errors;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "update-field", field: key, value });
  }
  function updateAddress(key: "residential" | "permanent", field: keyof Address, value: string) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "update-address", address: key, field, value });
  }
  function updateSacrament(key: SacramentName, value: Sacrament) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "update-sacrament", sacrament: key, value });
  }
  function updateMatrimonyApplicability(value: string) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "update-matrimony-applicability", value });
  }
  function toggleSociety(name: string) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "toggle-society", name });
  }
  function setNoSocieties(selected: boolean) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "set-no-societies", selected });
  }
  function setOtherSociety(selected: boolean) {
    if (submitting) return;
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "set-other-society", selected });
  }

  function next() {
    const result = validateStep(step, draft);
    setErrors(result);
    if (Object.keys(result).length) {
      const firstError = Object.keys(result)[0];
      if (firstError) document.getElementById(firstError)?.focus();
      return;
    }
    setNotice("");
    draftDirty.current = true;
    draftRevision.current += 1;
    dispatch({ type: "set-step", stepIndex: stepIndex + 1 });
  }

  function saveProgress(
    snapshot: MembershipApplicationDraft = draft,
    snapshotStep: number = stepIndex,
  ): Promise<void> {
    if (!draftPersistenceEnabled || submitting || applicationReference) return Promise.resolve();
    const sequence = ++saveSequence.current;
    const revision = draftRevision.current;
    setSaveState("saving");
    setSaveMessage("");
    const payload = draftPayloadWithoutDob(snapshot);
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const response = await fetch("/api/membership-applications/draft", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              payload,
              activeStep: snapshotStep,
              expectedUpdatedAt: draftUpdatedAt.current,
            }),
          });
          const result: unknown = await response.json().catch(() => null);
          if (
            response.ok &&
            result &&
            typeof result === "object" &&
            "updatedAt" in result &&
            typeof result.updatedAt === "string" &&
            "draftId" in result &&
            typeof result.draftId === "string"
          ) {
            draftUpdatedAt.current = result.updatedAt;
            draftId.current = result.draftId;
            if (sequence === saveSequence.current && revision === draftRevision.current) {
              draftDirty.current = false;
              setSaveState("saved");
              setSaveMessage("Saved. Drafts expire 30 days after the last successful save.");
            } else if (sequence === saveSequence.current) {
              setSaveState("saving");
              setSaveMessage("New changes are waiting to be saved.");
            }
          } else if (sequence === saveSequence.current) {
            setSaveState("error");
            setSaveMessage(
              response.status === 409
                ? "This draft changed in another session. Reload to get the latest saved version, then try again."
                : "Unable to save — retry. Your current entries remain on this page.",
            );
          }
        } catch {
          if (sequence === saveSequence.current) {
            setSaveState("error");
            setSaveMessage("Unable to save — retry. Your current entries remain on this page.");
          }
        }
      });
    return saveQueue.current;
  }
  saveProgressRef.current = saveProgress;

  async function uploadPassportPhoto(file: File) {
    if (photoBusy || submitting || applicationReference) return;
    setPhotoError("");
    if (!draftId.current) await saveProgress();
    if (!draftId.current || saveState === "error") {
      setPhotoError("Save your draft before uploading the photograph, then retry.");
      return;
    }
    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.set("draftId", draftId.current);
      form.set("file", file);
      const response = await fetch("/api/membership-applications/photo", {
        method: "PUT",
        credentials: "same-origin",
        body: form,
      });
      const result: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("photoId" in result) ||
        typeof result.photoId !== "string"
      ) {
        setPhotoError(
          result &&
            typeof result === "object" &&
            "message" in result &&
            typeof result.message === "string"
            ? result.message
            : "The photograph could not be saved. Please retry.",
        );
        return;
      }
      setPassportPhotoId(result.photoId);
      setSaveMessage("Photograph saved with your draft.");
    } catch {
      setPhotoError("The photograph could not be saved. Check your connection and retry.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePassportPhoto() {
    if (!draftId.current || photoBusy || submitting || applicationReference) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const response = await fetch("/api/membership-applications/photo", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: draftId.current }),
      });
      if (!response.ok) {
        setPhotoError("The photograph could not be removed. Please retry.");
        return;
      }
      setPassportPhotoId(null);
      setSaveMessage("Photograph removed from the draft.");
    } catch {
      setPhotoError("The photograph could not be removed. Check your connection and retry.");
    } finally {
      setPhotoBusy(false);
    }
  }

  // Warn before leaving when the latest local state has not yet been durably saved.
  useEffect(() => {
    if (!draftPersistenceEnabled || !draftDirty.current || submitting || applicationReference)
      return;
    const timer = window.setTimeout(() => void saveProgressRef.current(draft, stepIndex), 800);
    return () => window.clearTimeout(timer);
  }, [draft, stepIndex, draftPersistenceEnabled, submitting, applicationReference]);

  useEffect(() => {
    if (!draftDirty.current && saveState !== "saving" && saveState !== "error") return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [draft, saveState]);

  function preventImplicitSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  async function submitApplication() {
    // This action is called only by the final review button. The synchronous ref guard
    // also closes the gap before React commits the disabled/loading state.
    if (
      submissionInFlight.current ||
      submitting ||
      applicationReference ||
      stepIndex !== steps.length - 1
    ) {
      return;
    }
    if (!passportPhotoId) {
      setSubmissionError("Upload a valid passport photograph before submitting your application.");
      return;
    }
    const result = validateMembershipApplicationDraft(draft);
    setErrors(result);
    if (Object.keys(result).length) {
      const firstStep = steps.findIndex(
        (candidate) => Object.keys(validateStep(candidate, draft)).length > 0,
      );
      dispatch({ type: "set-step", stepIndex: Math.max(0, firstStep) });
      setNotice("Please complete the highlighted required information before reviewing.");
      return;
    }
    setSubmissionError("");
    submissionInFlight.current = true;
    setSubmitting(true);
    const serializedDraft = JSON.stringify({ draft, passportPhotoId });
    if (retryKey.current?.payload !== serializedDraft) {
      retryKey.current = { payload: serializedDraft, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch("/api/membership-applications/submit", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "idempotency-key": retryKey.current.key,
        },
        body: JSON.stringify({ draft, passportPhotoId }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (
        response.ok &&
        result &&
        typeof result === "object" &&
        "applicationReference" in result &&
        typeof result.applicationReference === "string"
      ) {
        draftDirty.current = false;
        setSaveState("saved");
        setApplicationReference(result.applicationReference);
        setNotice(
          "Your application has been submitted for parish review. Submission is not membership approval.",
        );
        return;
      }
      const safeMessage =
        result &&
        typeof result === "object" &&
        "message" in result &&
        typeof result.message === "string"
          ? result.message
          : "The application could not be submitted. Please try again.";
      setSubmissionError(safeMessage);
    } catch {
      setSubmissionError(
        "The application could not be submitted. Check your connection and retry.",
      );
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  }

  if (applicationReference) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6" aria-labelledby="submitted-heading">
        <div className="rounded-xl border border-green-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-green-800">Application submitted</p>
          <h1 id="submitted-heading" className="mt-2 text-2xl font-bold">
            Thank you for your application
          </h1>
          <p className="mt-3 text-sm text-neutral-700">{notice}</p>
          <p className="mt-5 text-sm font-medium text-neutral-700">Application reference</p>
          <p className="mt-1 break-all font-mono text-sm" aria-label="Application reference">
            {applicationReference}
          </p>
          <p className="mt-4 text-sm text-neutral-600">Keep this reference for future enquiries.</p>
          <a
            href="/applicant"
            className="mt-6 inline-flex rounded-md bg-neutral-900 px-5 py-3 text-sm font-semibold text-white"
          >
            View My Application
          </a>
        </div>
      </section>
    );
  }

  if (requiresDobReentry) {
    return (
      <section
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6"
        aria-labelledby="resume-dob-heading"
      >
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 id="resume-dob-heading" className="text-2xl font-bold">
            Resume your application
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            For your privacy, your date of birth was not saved. Enter it again to continue. It will
            be checked by the server when you submit.
          </p>
          <div className="mt-5 max-w-md">
            <TextField
              id="resumeDateOfBirth"
              label="Date of birth"
              type="date"
              required
              value={resumeDob}
              onChange={setResumeDob}
              error={resumeDobError}
            />
          </div>
          <button
            type="button"
            className={`${primaryButton} mt-6`}
            onClick={() => {
              if (!validDate(resumeDob) || resumeDob > localToday()) {
                setResumeDobError("Enter a valid date of birth that is not in the future.");
                return;
              }
              draftDirty.current = true;
              draftRevision.current += 1;
              dispatch({ type: "update-field", field: "dateOfBirth", value: resumeDob });
              setResumeDobError("");
              setRequiresDobReentry(false);
            }}
          >
            Continue to saved step
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-neutral-700">CYON CONNECT</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Membership application</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Complete each section, review your information, then submit it securely for parish
            review.
          </p>
          {draftPersistenceEnabled && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void saveProgress()}
                disabled={submitting || saveState === "saving"}
                className={secondaryButton}
              >
                Save Progress
              </button>
              <p role="status" aria-live="polite" className="text-sm text-neutral-700">
                {saveState === "saving"
                  ? "Saving..."
                  : saveState === "saved"
                    ? "Saved"
                    : saveState === "error"
                      ? "Unable to save — retry"
                      : "Progress saves automatically as you work."}
              </p>
              {saveMessage && <p className="w-full text-sm text-neutral-600">{saveMessage}</p>}
              {saveState === "error" && (
                <button
                  type="button"
                  onClick={() => void saveProgress()}
                  className="text-sm font-medium underline"
                >
                  Retry save
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
        <div className="mb-2 flex justify-between text-sm">
          <span>
            Step {stepIndex + 1} of {steps.length}
          </span>
          <span>{step}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-neutral-900 transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        <ol className="sr-only">
          {steps.map((label, index) => (
            <li key={label} aria-current={index === stepIndex ? "step" : undefined}>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={preventImplicitSubmission} noValidate>
        <fieldset className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
          <legend className="sr-only">{step}</legend>
          <h2 className="text-xl font-semibold">{step}</h2>
          <p className="mb-6 mt-1 text-sm text-neutral-600">
            Fields marked <span className="font-semibold">Required</span> must be completed.
            Optional fields may be left blank.
          </p>
          {step === "Personal information" && (
            <Personal draft={draft} update={update} errors={fieldErrors} />
          )}
          {step === "Contact information" && (
            <Contact draft={draft} update={update} email={verifiedEmail} errors={fieldErrors} />
          )}
          {step === "Addresses" && (
            <Addresses
              draft={draft}
              update={update}
              updateAddress={updateAddress}
              errors={fieldErrors}
            />
          )}
          {step === "Sacraments" && (
            <Sacraments
              draft={draft}
              errors={fieldErrors}
              updateSacrament={updateSacrament}
              setMatrimonyApplicability={updateMatrimonyApplicability}
            />
          )}
          {step === "Parish history" && (
            <ParishHistory draft={draft} update={update} errors={fieldErrors} />
          )}
          {step === "Occupation" && <Occupation draft={draft} update={update} />}
          {step === "Societies" && (
            <MembershipApplicationSocieties
              draft={draft}
              toggleSociety={toggleSociety}
              setNoSocieties={setNoSocieties}
              setOtherSociety={setOtherSociety}
              setOtherSocietyText={(value) => update("otherSocietyText", value)}
            />
          )}
          {step === "Emergency contact" && (
            <Emergency draft={draft} update={update} errors={fieldErrors} />
          )}
          {step === "School" && <School draft={draft} update={update} />}
          {step === "Review" && (
            <>
              <PassportPhotoControl
                draftId={draftId.current}
                photoId={passportPhotoId}
                busy={photoBusy}
                error={photoError}
                onUpload={uploadPassportPhoto}
                onRemove={removePassportPhoto}
              />
              <MembershipApplicationReview draft={draft} email={verifiedEmail} />
            </>
          )}
          {notice && (
            <p role="status" className="mt-5 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
              {notice}
            </p>
          )}
          {submissionError && (
            <p role="alert" className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-900">
              {submissionError}
            </p>
          )}
          {Object.keys(fieldErrors).length > 0 && (
            <p role="alert" className="mt-4 text-sm font-medium text-red-800">
              Please correct the errors in this section.
            </p>
          )}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-neutral-200 pt-5 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => {
                draftDirty.current = true;
                draftRevision.current += 1;
                setNotice("");
                setSubmissionError("");
                dispatch({ type: "set-step", stepIndex: stepIndex - 1 });
              }}
              disabled={stepIndex === 0 || submitting}
              className={secondaryButton}
            >
              Back
            </button>
            {stepIndex < steps.length - 1 ? (
              <button type="button" onClick={next} className={primaryButton}>
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submitApplication()}
                disabled={submitting || !submissionEnabled || !passportPhotoId || photoBusy}
                className={primaryButton}
              >
                {submitting ? "Submitting application…" : "Submit application"}
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {!submissionEnabled && (
        <p role="status" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          Application submission is not available until the development database and parish
          configuration are verified.
        </p>
      )}
      <p className="mt-4 text-xs text-neutral-500">
        Your verified email is displayed from your signed-in Auth identity. Parish intake is set by
        CYON Connect, not by this form. Submission creates an application only; it does not create a
        member record, user account, or membership approval.
      </p>
    </section>
  );
}

function Personal({ draft, update, errors }: ValidatedSectionProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        id="firstName"
        label="First name"
        value={draft.firstName}
        required
        error={errors.firstName}
        onChange={(v) => update("firstName", v)}
      />
      <TextField
        id="middleName"
        label="Middle name"
        value={draft.middleName}
        onChange={(v) => update("middleName", v)}
      />
      <TextField
        id="surname"
        label="Surname"
        value={draft.surname}
        required
        error={errors.surname}
        onChange={(v) => update("surname", v)}
      />
      <TextField
        id="dateOfBirth"
        label="Date of birth"
        type="date"
        value={draft.dateOfBirth}
        required
        error={errors.dateOfBirth}
        onChange={(v) => update("dateOfBirth", v)}
      />
      <SelectField
        id="sex"
        label="Sex"
        value={draft.sex}
        required
        error={errors.sex}
        onChange={(v) => update("sex", v)}
        options={[
          ["male", "Male"],
          ["female", "Female"],
        ]}
      />
      <SelectField
        id="maritalStatus"
        label="Marital status"
        value={draft.maritalStatus}
        required
        error={errors.maritalStatus}
        onChange={(v) => update("maritalStatus", v)}
        options={[
          ["single", "Single"],
          ["married", "Married"],
          ["separated", "Separated"],
          ["divorced", "Divorced"],
          ["widowed", "Widowed"],
        ]}
      />
      <p className="text-sm text-neutral-600 sm:col-span-2">
        Marital status does not automatically determine membership eligibility.
      </p>
    </div>
  );
}

function Contact({ draft, update, email, errors }: ValidatedSectionProps & { email: string }) {
  return (
    <div className="space-y-5">
      <VerifiedApplicantEmail email={email} />
      <TextField
        id="phone"
        label="Primary phone number"
        type="tel"
        value={draft.phone}
        required
        error={errors.phone}
        onChange={(v) => update("phone", v)}
        hint="Include a country code when entering an international number, for example +234."
      />
    </div>
  );
}

export function VerifiedApplicantEmail({ email }: { readonly email: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">
        Verified email address <Required />
      </p>
      <p
        className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5"
        aria-label="Verified email address"
      >
        {email}
      </p>
      <p className="mt-1 text-xs text-neutral-600">
        This comes from your verified sign-in and cannot be changed in this form.
      </p>
    </div>
  );
}

function Addresses({
  draft,
  update,
  updateAddress,
  errors,
}: ValidatedSectionProps & {
  updateAddress: (key: "residential" | "permanent", field: keyof Address, value: string) => void;
}) {
  return (
    <div className="space-y-7">
      <AddressFields
        title="Current residential address"
        prefix="residential"
        address={draft.residential}
        required
        errors={errors}
        update={updateAddress}
      />
      <div className="border-t border-neutral-200 pt-5">
        <Checkbox
          id="permanentSame"
          checked={draft.permanentSame}
          onChange={(v) => update("permanentSame", v)}
          label="Same as residential address"
        />
        {!draft.permanentSame && (
          <div className="mt-5">
            <AddressFields
              title="Permanent address"
              prefix="permanent"
              address={draft.permanent}
              required
              errors={errors}
              update={updateAddress}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-600">
          Proof of address is not required for this application.
        </p>
      </div>
    </div>
  );
}

function AddressFields({
  title,
  prefix,
  address,
  required,
  errors,
  update,
}: {
  title: string;
  prefix: string;
  address: Address;
  required: boolean;
  errors: Errors;
  update: (key: "residential" | "permanent", field: keyof Address, value: string) => void;
}) {
  const fields: [keyof Address, string][] = [
    ["street", "Street or address description"],
    ["area", "Area"],
    ["city", "City or town"],
    ["state", "State"],
    ["country", "Country"],
  ];
  return (
    <fieldset>
      <legend className="mb-4 font-medium">
        {title} <Required />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([field, label]) => (
          <TextField
            key={field}
            id={`${prefix}.${field}`}
            label={label}
            value={address[field]}
            required={required}
            error={errors[`${prefix}.${field}`]}
            onChange={(v) => update(prefix as "residential" | "permanent", field, v)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Sacraments({
  draft,
  updateSacrament,
  setMatrimonyApplicability,
  errors,
}: {
  draft: Draft;
  errors: Errors;
  updateSacrament: (key: SacramentName, value: Sacrament) => void;
  setMatrimonyApplicability: (value: string) => void;
}) {
  const items: [SacramentName, string][] = [
    ["baptism", "Baptism"],
    ["communion", "First Holy Communion"],
    ["confirmation", "Confirmation"],
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600">
        For each, select Received, Not received, or Unknown. Sacramental status is not an automatic
        membership eligibility decision.
      </p>
      {items.map(([key, label]) => (
        <SacramentFields
          key={key}
          id={key}
          label={label}
          value={draft.sacraments[key] as Sacrament}
          error={errors[`sacraments.${key}.status`]}
          update={updateSacrament}
        />
      ))}
      <div className="rounded-lg border border-neutral-200 p-4">
        <SelectField
          id="matrimonyApplicable"
          label="Does Matrimony apply to your circumstances?"
          value={draft.sacraments.matrimonyApplicable}
          required
          error={errors.matrimonyApplicable}
          onChange={setMatrimonyApplicability}
          options={[
            ["yes", "Yes"],
            ["no", "No"],
          ]}
        />
        {draft.sacraments.matrimonyApplicable === "yes" && (
          <div className="mt-5">
            <SacramentFields
              id="matrimony"
              label="Matrimony"
              value={draft.sacraments.matrimony}
              error={errors["sacraments.matrimony.status"]}
              update={updateSacrament}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SacramentFields({
  id,
  label,
  value,
  error,
  update,
}: {
  id: SacramentName;
  label: string;
  value: Sacrament;
  error?: string;
  update: (key: SacramentName, value: Sacrament) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-4">
      <legend className="px-1 font-medium">
        {label} <Required />
      </legend>
      <SelectField
        id={`sacraments.${id}.status`}
        label="Status"
        value={value.status}
        required
        error={error}
        onChange={(status) => update(id, { ...value, status: status as SacramentStatus })}
        options={[
          ["received", "Received"],
          ["not_received", "Not received"],
          ["unknown", "Unknown"],
        ]}
      />
      {value.status === "received" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            id={`sacraments.${id}.date`}
            label="Date received (if known)"
            type="date"
            value={value.date}
            onChange={(date) => update(id, { ...value, date })}
          />
          <TextField
            id={`sacraments.${id}.place`}
            label="Place or parish (if known)"
            value={value.place}
            onChange={(place) => update(id, { ...value, place })}
          />
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-600">Date and place are optional when unavailable.</p>
    </fieldset>
  );
}

function ParishHistory({ draft, update, errors }: ValidatedSectionProps) {
  return (
    <div className="space-y-5">
      <SelectField
        id="currentlyBelongsElsewhere"
        label="Do you currently belong to another Catholic parish?"
        value={draft.currentlyBelongsElsewhere}
        required
        error={errors.currentlyBelongsElsewhere}
        onChange={(v) => update("currentlyBelongsElsewhere", v)}
        options={yesNo}
      />
      {draft.currentlyBelongsElsewhere === "yes" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="currentParish"
            label="Current parish name"
            value={draft.currentParish}
            required
            error={errors.currentParish}
            onChange={(v) => update("currentParish", v)}
          />
          <TextField
            id="currentParishLocation"
            label="Current parish location"
            value={draft.currentParishLocation}
            required
            error={errors.currentParishLocation}
            onChange={(v) => update("currentParishLocation", v)}
          />
        </div>
      )}
      <SelectField
        id="previouslyBelongedElsewhere"
        label="Have you previously belonged to another Catholic parish?"
        value={draft.previouslyBelongedElsewhere}
        required
        error={errors.previouslyBelongedElsewhere}
        onChange={(v) => update("previouslyBelongedElsewhere", v)}
        options={yesNo}
      />
      {draft.previouslyBelongedElsewhere === "yes" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="previousParish"
            label="Previous parish name"
            value={draft.previousParish}
            required
            error={errors.previousParish}
            onChange={(v) => update("previousParish", v)}
          />
          <TextField
            id="previousParishLocation"
            label="Previous parish location"
            value={draft.previousParishLocation}
            required
            error={errors.previousParishLocation}
            onChange={(v) => update("previousParishLocation", v)}
          />
        </div>
      )}
      <SelectField
        id="parishJourney"
        label="Which best describes your connection to this parish?"
        value={draft.parishJourney}
        required
        error={errors.parishJourney}
        onChange={(v) => update("parishJourney", v)}
        options={[
          ["transferring", "Transferring"],
          ["returning", "Returning"],
          ["first_time", "Joining a parish for the first time"],
        ]}
      />
      {draft.previouslyBelongedElsewhere === "no" && (
        <p className="text-sm text-neutral-600">
          You can indicate that you have never belonged to another parish without entering a parish
          name.
        </p>
      )}
      <p className="text-xs text-neutral-600">
        This history does not change the parish configured for CYON Connect intake.
      </p>
    </div>
  );
}

function Occupation({ draft, update }: SectionProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <SelectField
        id="occupationStatus"
        label="Occupation or employment status (optional)"
        value={draft.occupationStatus}
        onChange={(v) => update("occupationStatus", v)}
        options={[
          ["employed", "Employed"],
          ["self_employed", "Self-employed"],
          ["student", "Student"],
          ["unemployed", "Unemployed"],
          ["retired", "Retired"],
          ["homemaker", "Homemaker"],
        ]}
      />
      <TextField
        id="occupationDescription"
        label="Occupation description (optional)"
        value={draft.occupationDescription}
        onChange={(v) => update("occupationDescription", v)}
      />
      <p className="text-sm text-neutral-600 sm:col-span-2">
        Employer and salary details are not requested. Occupation is not a membership condition.
      </p>
    </div>
  );
}

export function MembershipApplicationSocieties({
  draft,
  toggleSociety,
  setNoSocieties,
  setOtherSociety,
  setOtherSocietyText,
}: {
  readonly draft: Draft;
  readonly toggleSociety: (name: string) => void;
  readonly setNoSocieties: (selected: boolean) => void;
  readonly setOtherSociety: (selected: boolean) => void;
  readonly setOtherSocietyText: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Society membership is optional. This Archdiocesan directory is provided as a list of
        organizations, not as confirmation that any has an active chapter at SS Joachim and Anne
        Catholic Church, Ijegun. Select all that apply. See the{" "}
        <a
          className="underline underline-offset-2"
          href="https://lagosarchdiocese.org/about/lay-societies-and-apostolates/"
          target="_blank"
          rel="noreferrer"
        >
          Archdiocesan directory
        </a>
        .
      </p>
      <Checkbox
        id="noSocieties"
        checked={draft.noSocieties}
        onChange={setNoSocieties}
        label="None currently"
      />
      {!draft.noSocieties && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">Societies and apostolates (optional)</legend>
          <ul className="grid gap-3 sm:grid-cols-2">
            {ARCHDIOCESAN_SOCIETY_OPTIONS.map((name, index) => (
              <li key={name}>
                <Checkbox
                  id={`society-${index}`}
                  checked={draft.selectedSocieties.includes(name)}
                  onChange={() => toggleSociety(name)}
                  label={name}
                />
              </li>
            ))}
          </ul>
          <Checkbox
            id="otherSocietySelected"
            checked={draft.otherSocietySelected}
            onChange={setOtherSociety}
            label="Other"
          />
          {draft.otherSocietySelected && (
            <TextField
              id="otherSocietyText"
              label="Other society name (optional)"
              value={draft.otherSocietyText}
              onChange={setOtherSocietyText}
            />
          )}
        </fieldset>
      )}
    </div>
  );
}

function Emergency({ draft, update, errors }: ValidatedSectionProps) {
  return (
    <div className="space-y-5">
      <TextField
        id="emergencyName"
        label="Emergency contact full name"
        value={draft.emergencyName}
        required
        error={errors.emergencyName}
        onChange={(v) => update("emergencyName", v)}
      />
      <TextField
        id="emergencyRelationship"
        label="Relationship to applicant"
        value={draft.emergencyRelationship}
        required
        error={errors.emergencyRelationship}
        onChange={(v) => update("emergencyRelationship", v)}
      />
      <TextField
        id="emergencyPhone"
        label="Emergency contact primary phone"
        type="tel"
        value={draft.emergencyPhone}
        required
        error={errors.emergencyPhone}
        onChange={(v) => update("emergencyPhone", v)}
        hint="Include a country code for international numbers, for example +234."
      />
      <TextField
        id="emergencyAlternativePhone"
        label="Alternative phone (optional)"
        type="tel"
        value={draft.emergencyAlternativePhone}
        error={errors.emergencyAlternativePhone}
        onChange={(v) => update("emergencyAlternativePhone", v)}
      />
      <Checkbox
        id="emergencyConsent"
        checked={draft.emergencyConsent}
        onChange={(v) => update("emergencyConsent", v)}
        label="I have permission to provide these details, and the nominated person may be contacted for the stated emergency purpose."
        error={errors.emergencyConsent}
      />
      <p className="text-xs text-neutral-600">
        Emergency contact details are for emergency use only and are not general parish
        communication contacts.
      </p>
    </div>
  );
}

function School({ draft, update }: SectionProps) {
  return (
    <div className="space-y-4">
      <Checkbox
        id="schoolNotApplicable"
        checked={draft.schoolNotApplicable}
        onChange={(v) => update("schoolNotApplicable", v)}
        label="Not applicable"
      />
      <TextField
        id="school"
        label="Current or most recent school (optional)"
        value={draft.school}
        disabled={draft.schoolNotApplicable}
        onChange={(v) => update("school", v)}
        hint="No educational certificates are requested."
      />
    </div>
  );
}

function PassportPhotoControl({
  draftId,
  photoId,
  busy,
  error,
  onUpload,
  onRemove,
}: {
  readonly draftId: string | null;
  readonly photoId: string | null;
  readonly busy: boolean;
  readonly error: string;
  readonly onUpload: (file: File) => void;
  readonly onRemove: () => void;
}) {
  return (
    <section
      className="mb-6 rounded-lg border border-neutral-200 p-4"
      aria-labelledby="passport-photo-title"
    >
      <h3 id="passport-photo-title" className="font-semibold">
        Passport photograph <Required />
      </h3>
      <p className="mt-1 text-sm text-neutral-600">
        Required before final submission. You may save a draft without a photograph. Accepted files:
        JPEG, PNG or WebP, at least 300 × 300 pixels and up to 4 MiB.
      </p>
      {photoId && draftId ? (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          {/* The image endpoint is authenticated and private; Next's optimizer cannot forward the applicant session. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/membership-applications/photo?draftId=${encodeURIComponent(draftId)}`}
            alt="Passport photograph preview"
            className="h-40 w-32 rounded border border-neutral-300 object-cover"
          />
          <div className="flex flex-wrap gap-3">
            <label className={`${secondaryButton} cursor-pointer`}>
              {busy ? "Saving…" : "Replace photograph"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                aria-label="Replace passport photograph"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onUpload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button type="button" className={secondaryButton} disabled={busy} onClick={onRemove}>
              Remove photograph
            </button>
          </div>
        </div>
      ) : (
        <label className="mt-4 block max-w-md text-sm font-medium">
          Upload passport photograph <Required />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || !draftId}
            aria-required="true"
            className="mt-2 block w-full rounded-md border border-neutral-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-2"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
      {!draftId && (
        <p className="mt-2 text-xs text-neutral-600">
          Save progress to prepare a secure draft upload.
        </p>
      )}
      {busy && (
        <p className="mt-3 text-sm" role="status">
          Saving photograph…
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-neutral-600" role="status">
        {photoId ? "Photograph saved privately with this draft." : "No photograph uploaded yet."}
      </p>
    </section>
  );
}

export function MembershipApplicationReview({
  draft,
  email,
}: {
  draft: MembershipApplicationDraft;
  email: string;
}) {
  const address = (value: Address) =>
    [value.street, value.area, value.city, value.state, value.country].filter(Boolean).join(", ") ||
    "Not provided";
  const sacramentText = (value: Sacrament) =>
    [
      (
        {
          received: "Received",
          not_received: "Not received",
          unknown: "Unknown",
          "": "Not answered",
        } as Record<string, string>
      )[value.status],
      value.status === "received" && value.date ? value.date : "",
      value.status === "received" && value.place ? value.place : "",
    ]
      .filter(Boolean)
      .join(" — ");
  const sacraments = [
    `Baptism: ${sacramentText(draft.sacraments.baptism)}`,
    `First Holy Communion: ${sacramentText(draft.sacraments.communion)}`,
    `Confirmation: ${sacramentText(draft.sacraments.confirmation)}`,
    `Matrimony: ${draft.sacraments.matrimonyApplicable === "no" ? "Not applicable" : sacramentText(draft.sacraments.matrimony)}`,
  ];
  const parishJourney = (
    {
      transferring: "Transferring",
      returning: "Returning",
      first_time: "Joining a parish for the first time",
    } as Record<string, string>
  )[draft.parishJourney];
  const occupation =
    [draft.occupationStatus, draft.occupationDescription].filter(Boolean).join(" — ") ||
    "Not provided";
  const societies = draft.noSocieties
    ? "None currently"
    : [
        ...draft.selectedSocieties,
        ...(draft.otherSocietySelected
          ? [draft.otherSocietyText.trim() ? `Other: ${draft.otherSocietyText.trim()}` : "Other"]
          : []),
      ].join(", ") || "Not provided";
  const emergency = [
    draft.emergencyName,
    draft.emergencyRelationship,
    draft.emergencyPhone,
    draft.emergencyAlternativePhone,
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {[
        ["Name", [draft.firstName, draft.middleName, draft.surname].filter(Boolean).join(" ")],
        ["Date of birth", draft.dateOfBirth],
        ["Sex", draft.sex],
        ["Marital status", draft.maritalStatus],
        ["Verified email", email],
        ["Primary phone", draft.phone],
        ["Residential address", address(draft.residential)],
        [
          "Permanent address",
          draft.permanentSame ? "Same as residential address" : address(draft.permanent),
        ],
        ["Sacraments", sacraments.join("; ")],
        ["Currently belongs to another parish", draft.currentlyBelongsElsewhere],
        [
          "Current parish",
          draft.currentlyBelongsElsewhere === "yes"
            ? `${draft.currentParish}, ${draft.currentParishLocation}`
            : "Not applicable",
        ],
        ["Previously belonged to another parish", draft.previouslyBelongedElsewhere],
        [
          "Previous parish",
          draft.previouslyBelongedElsewhere === "yes"
            ? `${draft.previousParish}, ${draft.previousParishLocation}`
            : "Never belonged to another parish",
        ],
        ["Parish journey", parishJourney],
        ["Occupation", occupation],
        ["Societies", societies],
        ["Emergency contact", emergency],
        [
          "Emergency contact purpose permission",
          draft.emergencyConsent ? "Confirmed" : "Not confirmed",
        ],
        ["School", draft.schoolNotApplicable ? "Not applicable" : draft.school || "Not provided"],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type SectionProps = {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
};
type ValidatedSectionProps = SectionProps & { errors: Errors };
type SacramentName = "baptism" | "communion" | "confirmation" | "matrimony";
const yesNo = [
  ["yes", "Yes"],
  ["no", "No"],
] as const;

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  error,
  type = "text",
  hint,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  type?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label} {required && <Required />}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
        }
        className={`${inputClass} ${error ? "border-red-700" : ""} disabled:bg-neutral-100`}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label} {required && <Required />}
      </label>
      <select
        id={id}
        name={id}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} bg-white ${error ? "border-red-700" : ""}`}
      >
        <option value="">Select an option</option>
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function Checkbox({
  id,
  checked,
  onChange,
  label,
  error,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={Boolean(error)}
          className="mt-1 size-4 accent-neutral-900"
        />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}
function Required() {
  return <span className="text-xs font-medium text-neutral-600">Required</span>;
}
export function validateMembershipApplicationDraft(draft: Draft): Errors {
  return Object.fromEntries(
    steps.flatMap((step) => Object.entries(validateStep(step, draft))),
  ) as Errors;
}
function validateStep(step: Step, draft: Draft): Errors {
  const errors: Errors = {};
  const required = (key: string, value: string, label: string) => {
    if (!value.trim()) errors[key] = `${label} is required.`;
  };
  const phone = (key: string, value: string, label: string, mandatory: boolean) => {
    if (!value.trim() && !mandatory) return;
    if (mandatory && !value.trim()) {
      errors[key] = `${label} is required.`;
      return;
    }
    if (!validPhone(value))
      errors[key] = "Enter a phone number with 7–15 digits and an optional leading +.";
  };
  if (step === "Personal information") {
    required("firstName", draft.firstName, "First name");
    required("surname", draft.surname, "Surname");
    if (!draft.dateOfBirth) errors.dateOfBirth = "Date of birth is required.";
    else if (!validDate(draft.dateOfBirth) || draft.dateOfBirth > localToday())
      errors.dateOfBirth = "Enter a valid date of birth that is not in the future.";
    if (!["male", "female"].includes(draft.sex)) errors.sex = "Select Male or Female.";
    if (!["single", "married", "separated", "divorced", "widowed"].includes(draft.maritalStatus))
      errors.maritalStatus = "Select a marital status.";
  }
  if (step === "Contact information") phone("phone", draft.phone, "Primary phone number", true);
  if (step === "Addresses") {
    for (const [prefix, address] of [
      ["residential", draft.residential],
      ...(!draft.permanentSame ? [["permanent", draft.permanent]] : []),
    ] as [string, Address][])
      for (const [field, value] of Object.entries(address))
        required(`${prefix}.${field}`, value, fieldLabel(field));
  }
  if (step === "Sacraments") {
    for (const [key, item] of [
      ["baptism", draft.sacraments.baptism],
      ["communion", draft.sacraments.communion],
      ["confirmation", draft.sacraments.confirmation],
    ] as const)
      if (!["received", "not_received", "unknown"].includes(item.status))
        errors[`sacraments.${key}.status`] = "Select Received, Not received, or Unknown.";
    if (!["yes", "no"].includes(draft.sacraments.matrimonyApplicable))
      errors.matrimonyApplicable = "Select whether Matrimony applies.";
    if (
      draft.sacraments.matrimonyApplicable === "yes" &&
      !["received", "not_received", "unknown"].includes(draft.sacraments.matrimony.status)
    )
      errors["sacraments.matrimony.status"] = "Select Received, Not received, or Unknown.";
  }
  if (step === "Parish history") {
    if (!["yes", "no"].includes(draft.currentlyBelongsElsewhere))
      errors.currentlyBelongsElsewhere = "Select Yes or No.";
    if (!["yes", "no"].includes(draft.previouslyBelongedElsewhere))
      errors.previouslyBelongedElsewhere = "Select Yes or No.";
    if (draft.currentlyBelongsElsewhere === "yes") {
      required("currentParish", draft.currentParish, "Current parish name");
      required("currentParishLocation", draft.currentParishLocation, "Current parish location");
    }
    if (draft.previouslyBelongedElsewhere === "yes") {
      required("previousParish", draft.previousParish, "Previous parish name");
      required("previousParishLocation", draft.previousParishLocation, "Previous parish location");
    }
    if (!["transferring", "returning", "first_time"].includes(draft.parishJourney))
      errors.parishJourney = "Select the option that best describes your parish journey.";
  }
  if (step === "Emergency contact") {
    required("emergencyName", draft.emergencyName, "Emergency contact full name");
    required("emergencyRelationship", draft.emergencyRelationship, "Relationship");
    phone("emergencyPhone", draft.emergencyPhone, "Emergency contact primary phone", true);
    phone("emergencyAlternativePhone", draft.emergencyAlternativePhone, "Alternative phone", false);
    if (!draft.emergencyConsent)
      errors.emergencyConsent =
        "Confirm permission to provide and use these details for emergency contact.";
  }
  return errors;
}
function validPhone(value: string): boolean {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+?[1-9]\d{6,14}$/.test(normalized);
}
function validDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function localToday(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
function fieldLabel(value: string): string {
  return (
    (
      {
        street: "Street/address description",
        area: "Area",
        city: "City/town",
        state: "State",
        country: "Country",
      } as Record<string, string>
    )[value] ?? value
  );
}
const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2.5 outline-none focus:border-neutral-800 focus:ring-2 focus:ring-neutral-300";
const primaryButton =
  "rounded-md bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";
const secondaryButton =
  "rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50";
