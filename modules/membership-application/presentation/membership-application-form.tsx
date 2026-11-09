"use client";

import React, { useReducer, useState, type FormEvent } from "react";

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
  | { readonly type: "mark-reviewed" };

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

export function MembershipApplicationForm({ verifiedEmail }: { readonly verifiedEmail: string }) {
  const [formState, dispatch] = useReducer(
    membershipApplicationFormReducer,
    undefined,
    createInitialMembershipApplicationFormState,
  );
  const { draft, stepIndex, reviewed } = formState;
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const step = steps[stepIndex] ?? "Personal information";
  const fieldErrors = errors;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    dispatch({ type: "update-field", field: key, value });
  }
  function updateAddress(key: "residential" | "permanent", field: keyof Address, value: string) {
    dispatch({ type: "update-address", address: key, field, value });
  }
  function updateSacrament(key: SacramentName, value: Sacrament) {
    dispatch({ type: "update-sacrament", sacrament: key, value });
  }
  function updateMatrimonyApplicability(value: string) {
    dispatch({ type: "update-matrimony-applicability", value });
  }
  function toggleSociety(name: string) {
    dispatch({ type: "toggle-society", name });
  }
  function setNoSocieties(selected: boolean) {
    dispatch({ type: "set-no-societies", selected });
  }
  function setOtherSociety(selected: boolean) {
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
    dispatch({ type: "set-step", stepIndex: stepIndex + 1 });
  }

  function finishReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    dispatch({ type: "mark-reviewed" });
    setNotice(
      "Your information is complete for review in this session. It has not been submitted or saved.",
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-neutral-700">CYON CONNECT</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Membership application</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Complete each section, then review your information. This form currently keeps entries
            only in this page session; it does not submit or save an application.
          </p>
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

      <form onSubmit={finishReview} noValidate>
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
          {step === "Review" && <MembershipApplicationReview draft={draft} email={verifiedEmail} />}
          {notice && (
            <p role="status" className="mt-5 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
              {notice}
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
                setNotice("");
                dispatch({ type: "set-step", stepIndex: stepIndex - 1 });
              }}
              disabled={stepIndex === 0}
              className={secondaryButton}
            >
              Back
            </button>
            {stepIndex < steps.length - 1 ? (
              <button type="button" onClick={next} className={primaryButton}>
                Continue
              </button>
            ) : (
              <button type="submit" className={primaryButton}>
                {reviewed ? "Review again" : "Review information"}
              </button>
            )}
          </div>
        </fieldset>
      </form>
      <p className="mt-4 text-xs text-neutral-500">
        Your verified email is displayed from your signed-in Auth identity. Parish intake is set by
        CYON Connect, not by this form. No membership record, account, or application is created
        here.
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
