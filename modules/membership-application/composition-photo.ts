import "server-only";
import { randomUUID } from "node:crypto";
import { resolveOperationalParish } from "@/infrastructure/organization/operational-parish";
import { normalizePassportPhoto, passportPhotoLimits } from "./infrastructure/passport-photo";
import { createSupabasePassportPhotoStorage } from "./infrastructure/supabase-passport-photo-storage";
import { createSupabasePassportPhotoRepository } from "./infrastructure/supabase-passport-photo-repository";
import { createSupabaseApplicantApplicationRepository } from "./infrastructure/supabase-applicant-application-repository";

export { passportPhotoLimits } from "./infrastructure/passport-photo";

async function deletePendingObject(objectPath: string) {
  await createSupabasePassportPhotoStorage().remove(objectPath);
  await createSupabasePassportPhotoRepository().finalizeDeletion(objectPath);
}

export async function uploadApplicantPassportPhoto(input: {
  readonly applicantAuthId: string;
  readonly draftId: string;
  readonly bytes: Buffer;
}) {
  const normalized = await normalizePassportPhoto(input.bytes);
  if (normalized.byteLength > passportPhotoLimits.maxUploadBytes) throw new Error("photo_invalid");
  const parish = await resolveOperationalParish();
  const draft = await createSupabaseApplicantApplicationRepository().getDraft({
    applicantAuthId: input.applicantAuthId,
    parishId: parish.id,
    correlationId: randomUUID(),
  });
  if (!draft || !("draftId" in draft) || draft.draftId !== input.draftId) {
    throw new Error("photo_draft_unavailable");
  }

  const photoId = randomUUID();
  const objectPath = `${input.applicantAuthId}/${input.draftId}/${photoId}.jpg`;
  const storage = createSupabasePassportPhotoStorage();
  await storage.upload(objectPath, normalized);

  try {
    const registered = await createSupabasePassportPhotoRepository().register({
      applicantAuthId: input.applicantAuthId,
      parishId: parish.id,
      draftId: input.draftId,
      photoId,
      objectPath,
      byteSize: normalized.byteLength,
      correlationId: randomUUID(),
    });
    if (registered.previousObjectPath) {
      // Replacement already detached the previous object transactionally. Removal uses
      // the Storage API; a failure leaves only an inaccessible cleanup-queue item.
      await deletePendingObject(registered.previousObjectPath).catch(() => undefined);
    }
    return { photoId };
  } catch {
    await storage.remove(objectPath).catch(() => undefined);
    throw new Error("photo_unavailable");
  }
}

export async function readApplicantPassportPhoto(input: {
  readonly applicantAuthId: string;
  readonly draftId: string;
}): Promise<Buffer | null> {
  const parish = await resolveOperationalParish();
  const photo = await createSupabasePassportPhotoRepository().get({
    applicantAuthId: input.applicantAuthId,
    parishId: parish.id,
    draftId: input.draftId,
    correlationId: randomUUID(),
  });
  if (!photo) return null;
  const bytes = await createSupabasePassportPhotoStorage().download(photo.objectPath);
  // Re-decode on every server read so missing, inaccessible, or corrupted objects fail closed.
  return normalizePassportPhoto(bytes);
}

export async function verifyApplicantPassportPhotoForSubmission(input: {
  readonly applicantAuthId: string;
  readonly parishId: string;
  readonly photoId: string;
}): Promise<boolean> {
  const photo = await createSupabasePassportPhotoRepository().getForSubmission({
    ...input,
    correlationId: randomUUID(),
  });
  if (!photo) return false;
  let bytes: Buffer;
  try {
    bytes = await createSupabasePassportPhotoStorage().download(photo.objectPath);
  } catch {
    return false;
  }
  try {
    await normalizePassportPhoto(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function removeApplicantPassportPhoto(input: {
  readonly applicantAuthId: string;
  readonly draftId: string;
}): Promise<boolean> {
  const parish = await resolveOperationalParish();
  const objectPath = await createSupabasePassportPhotoRepository().remove({
    applicantAuthId: input.applicantAuthId,
    parishId: parish.id,
    draftId: input.draftId,
    correlationId: randomUUID(),
  });
  if (!objectPath) return false;
  await deletePendingObject(objectPath);
  return true;
}
