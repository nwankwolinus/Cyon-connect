import { z } from "zod";
import { ARCHDIOCESAN_SOCIETY_OPTIONS } from "./society-options";
import { isValidDateOnly, normalizePhoneNumber } from "@/shared/membership-application-validation";

const shortText = (max = 200) => z.string().trim().max(max);
const requiredText = (max = 200) => z.string().trim().min(1).max(max);
const addressSchema = z
  .object({
    street: requiredText(300),
    area: requiredText(160),
    city: requiredText(160),
    state: requiredText(160),
    country: requiredText(160),
  })
  .strict();
const addressDraftSchema = z
  .object({
    street: shortText(300),
    area: shortText(160),
    city: shortText(160),
    state: shortText(160),
    country: shortText(160),
  })
  .strict();
const phoneSchema = z
  .string()
  .transform(normalizePhoneNumber)
  .pipe(z.string().regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid phone number."));
const sacramentSchema = z
  .object({
    status: z.enum(["received", "not_received", "unknown"]),
    date: shortText(10),
    place: shortText(200),
  })
  .strict();
const dateOnly = z.string().refine(isValidDateOnly, "Enter a valid date.");

/** Untrusted browser payload. DOB is validated here but is removed before persistence. */
export const membershipApplicationSubmissionSchema = z
  .object({
    firstName: requiredText(),
    middleName: shortText(),
    surname: requiredText(),
    dateOfBirth: dateOnly,
    sex: z.enum(["male", "female"]),
    maritalStatus: z.enum(["single", "married", "separated", "divorced", "widowed"]),
    phone: phoneSchema,
    residential: addressSchema,
    permanentSame: z.boolean(),
    permanent: addressDraftSchema,
    sacraments: z
      .object({
        baptism: sacramentSchema,
        communion: sacramentSchema,
        confirmation: sacramentSchema,
        matrimonyApplicable: z.enum(["yes", "no"]),
        matrimony: z
          .object({
            status: z.enum(["", "received", "not_received", "unknown"]),
            date: shortText(10),
            place: shortText(200),
          })
          .strict(),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.matrimonyApplicable === "yes" && !value.matrimony.status) {
          ctx.addIssue({ code: "custom", path: ["matrimony", "status"], message: "Required." });
        }
        for (const [name, sacrament] of [
          ["baptism", value.baptism],
          ["communion", value.communion],
          ["confirmation", value.confirmation],
          ["matrimony", value.matrimony],
        ] as const) {
          if (sacrament.date && !dateOnly.safeParse(sacrament.date).success) {
            ctx.addIssue({
              code: "custom",
              path: [name, "date"],
              message: "Enter a valid date.",
            });
          }
        }
      }),
    currentlyBelongsElsewhere: z.enum(["yes", "no"]),
    previouslyBelongedElsewhere: z.enum(["yes", "no"]),
    currentParish: shortText(),
    currentParishLocation: shortText(),
    previousParish: shortText(),
    previousParishLocation: shortText(),
    parishJourney: z.enum(["transferring", "returning", "first_time"]),
    occupationStatus: z.enum([
      "",
      "employed",
      "self_employed",
      "student",
      "unemployed",
      "retired",
      "homemaker",
    ]),
    occupationDescription: shortText(300),
    selectedSocieties: z
      .array(
        z
          .string()
          .refine((value) =>
            ARCHDIOCESAN_SOCIETY_OPTIONS.includes(
              value as (typeof ARCHDIOCESAN_SOCIETY_OPTIONS)[number],
            ),
          ),
      )
      .max(52),
    noSocieties: z.boolean(),
    otherSocietySelected: z.boolean(),
    otherSocietyText: shortText(200),
    emergencyName: requiredText(),
    emergencyRelationship: requiredText(),
    emergencyPhone: phoneSchema,
    emergencyAlternativePhone: z.union([z.literal(""), phoneSchema]),
    emergencyConsent: z.literal(true),
    schoolNotApplicable: z.boolean(),
    school: shortText(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.permanentSame && Object.values(value.permanent).some((part) => !part.trim())) {
      ctx.addIssue({ code: "custom", path: ["permanent"], message: "Required when different." });
    }
    if (
      value.currentlyBelongsElsewhere === "yes" &&
      (!value.currentParish || !value.currentParishLocation)
    ) {
      ctx.addIssue({ code: "custom", path: ["currentParish"], message: "Required." });
    }
    if (
      value.previouslyBelongedElsewhere === "yes" &&
      (!value.previousParish || !value.previousParishLocation)
    ) {
      ctx.addIssue({ code: "custom", path: ["previousParish"], message: "Required." });
    }
    if (new Set(value.selectedSocieties).size !== value.selectedSocieties.length) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedSocieties"],
        message: "Duplicate selection.",
      });
    }
    if (value.noSocieties && (value.selectedSocieties.length > 0 || value.otherSocietySelected)) {
      ctx.addIssue({ code: "custom", path: ["noSocieties"], message: "Contradictory selection." });
    }
    if (value.otherSocietySelected && !value.otherSocietyText.trim()) {
      ctx.addIssue({ code: "custom", path: ["otherSocietyText"], message: "Required." });
    }
  });

export type MembershipApplicationSubmissionDraft = z.infer<
  typeof membershipApplicationSubmissionSchema
>;

/** Normalized persisted payload; deliberately contains no DOB or eligibility result. */
export function toPersistedApplicationPayload(
  draft: MembershipApplicationSubmissionDraft,
  verifiedEmail: string,
) {
  const sacrament = (value: z.infer<typeof sacramentSchema>) => ({
    status: value.status,
    date: value.status === "received" ? value.date || null : null,
    place: value.status === "received" ? value.place || null : null,
  });
  return {
    identity: {
      firstName: draft.firstName,
      middleName: draft.middleName || null,
      surname: draft.surname,
      sex: draft.sex,
      maritalStatus: draft.maritalStatus,
    },
    contact: { verifiedEmail, primaryPhone: draft.phone },
    addresses: {
      residential: draft.residential,
      permanentSameAsResidential: draft.permanentSame,
      permanent: draft.permanentSame ? null : draft.permanent,
    },
    sacraments: {
      baptism: sacrament(draft.sacraments.baptism),
      firstHolyCommunion: sacrament(draft.sacraments.communion),
      confirmation: sacrament(draft.sacraments.confirmation),
      matrimony:
        draft.sacraments.matrimonyApplicable === "yes"
          ? sacrament({
              ...draft.sacraments.matrimony,
              status: draft.sacraments.matrimony.status as "received" | "not_received" | "unknown",
            })
          : null,
    },
    parishHistory: {
      currentlyBelongsElsewhere: draft.currentlyBelongsElsewhere === "yes",
      currentParish:
        draft.currentlyBelongsElsewhere === "yes"
          ? { name: draft.currentParish, location: draft.currentParishLocation }
          : null,
      previouslyBelongedElsewhere: draft.previouslyBelongedElsewhere === "yes",
      previousParish:
        draft.previouslyBelongedElsewhere === "yes"
          ? { name: draft.previousParish, location: draft.previousParishLocation }
          : null,
      journey: draft.parishJourney,
    },
    occupation: {
      status: draft.occupationStatus || null,
      description: draft.occupationDescription || null,
    },
    societies: draft.noSocieties
      ? []
      : [
          ...draft.selectedSocieties,
          ...(draft.otherSocietySelected ? [`Other: ${draft.otherSocietyText.trim()}`] : []),
        ],
    emergencyContact: {
      fullName: draft.emergencyName,
      relationship: draft.emergencyRelationship,
      primaryPhone: draft.emergencyPhone,
      alternativePhone: draft.emergencyAlternativePhone || null,
      purposeAcknowledged: true,
    },
    school: draft.schoolNotApplicable ? null : draft.school || null,
  };
}
