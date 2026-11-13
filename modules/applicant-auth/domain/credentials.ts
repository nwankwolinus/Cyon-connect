import { z } from "zod";

const email = z.string().trim().email().max(254);
const password = z.string().min(8).max(128);

export const registrationSchema = z.object({
  email,
  password,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const recoveryRequestSchema = z.object({ email });
export const passwordUpdateSchema = z.object({ password });

export type RegistrationInput = z.infer<typeof registrationSchema>;
