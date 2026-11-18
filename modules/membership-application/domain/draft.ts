import { z } from "zod";
import { ARCHDIOCESAN_SOCIETY_OPTIONS } from "./society-options";

export type ApplicantApplicationOverview = {
  readonly application: null | {
    readonly id: string;
    readonly reference: string | null;
    readonly status: string;
    readonly submittedAt: string | null;
    readonly createdAt: string;
  };
  readonly draft: null | {
    readonly id: string;
    readonly lastActivityAt: string;
    readonly expiresAt: string;
    readonly activeStep: number;
  };
  readonly expiredDraftDisposed: boolean;
};

const text = (max = 300) => z.string().max(max);
const address = z
  .object({
    street: text(),
    area: text(160),
    city: text(160),
    state: text(160),
    country: text(160),
  })
  .partial()
  .strict();
const sacrament = z
  .object({
    status: z.enum(["", "received", "not_received", "unknown"]),
    date: text(10),
    place: text(200),
  })
  .partial()
  .strict();

/** Partial, strict allowlist for autosaved form state. DOB is intentionally absent. */
export const membershipApplicationDraftPayloadSchema = z
  .object({
    firstName: text(200),
    middleName: text(200),
    surname: text(200),
    sex: z.enum(["", "male", "female"]),
    maritalStatus: z.enum(["", "single", "married", "separated", "divorced", "widowed"]),
    phone: text(32),
    residential: address,
    permanentSame: z.boolean(),
    permanent: address,
    sacraments: z
      .object({
        baptism: sacrament,
        communion: sacrament,
        confirmation: sacrament,
        matrimonyApplicable: z.enum(["", "yes", "no"]),
        matrimony: sacrament,
      })
      .partial()
      .strict(),
    currentlyBelongsElsewhere: z.enum(["", "yes", "no"]),
    previouslyBelongedElsewhere: z.enum(["", "yes", "no"]),
    currentParish: text(200),
    currentParishLocation: text(200),
    previousParish: text(200),
    previousParishLocation: text(200),
    parishJourney: z.enum(["", "transferring", "returning", "first_time"]),
    occupationStatus: z.enum([
      "",
      "employed",
      "self_employed",
      "student",
      "unemployed",
      "retired",
      "homemaker",
    ]),
    occupationDescription: text(300),
    selectedSocieties: z.array(z.enum(ARCHDIOCESAN_SOCIETY_OPTIONS)).max(52),
    noSocieties: z.boolean(),
    otherSocietySelected: z.boolean(),
    otherSocietyText: text(200),
    emergencyName: text(200),
    emergencyRelationship: text(120),
    emergencyPhone: text(32),
    emergencyAlternativePhone: text(32),
    emergencyConsent: z.boolean(),
    schoolNotApplicable: z.boolean(),
    school: text(200),
  })
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.noSocieties &&
      ((value.selectedSocieties?.length ?? 0) > 0 || value.otherSocietySelected)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["noSocieties"],
        message: "Contradictory society selection.",
      });
    }
    if (
      value.selectedSocieties &&
      new Set(value.selectedSocieties).size !== value.selectedSocieties.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedSocieties"],
        message: "Duplicate society selection.",
      });
    }
  });

export type MembershipApplicationDraftPayload = z.infer<
  typeof membershipApplicationDraftPayloadSchema
>;
