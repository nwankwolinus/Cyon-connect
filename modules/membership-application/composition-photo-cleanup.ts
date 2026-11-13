import "server-only";
import { createConsoleLogger } from "@/infrastructure/logging/console-logger";
import { getMembershipPhotoCleanupSecret } from "./composition";
import { verifyAndConsumeCleanupRequest } from "./application/cleanup-request-auth";
import { processPassportPhotoCleanupBatch } from "./application/process-passport-photo-cleanup";
import { createSupabasePassportPhotoStorage } from "./infrastructure/supabase-passport-photo-storage";
import { createSupabasePhotoCleanupRepository } from "./infrastructure/supabase-photo-cleanup-repository";
import { createCleanupTimeoutFetch } from "./infrastructure/cleanup-timeout-fetch";

const logger = createConsoleLogger({ module: "membership-photo-cleanup" });

type Invocation = {
  readonly body: string;
  readonly timestamp: string | null;
  readonly requestId: string | null;
  readonly signature: string | null;
};

export type PhotoCleanupInvocationResult =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "processed";
      readonly counts: Awaited<ReturnType<typeof processPassportPhotoCleanupBatch>>;
    };

export async function runMembershipPhotoCleanup(
  input: Invocation,
): Promise<PhotoCleanupInvocationResult> {
  let secret: string | undefined;
  try {
    secret = getMembershipPhotoCleanupSecret();
  } catch {
    return { kind: "unavailable" };
  }
  if (!secret) return { kind: "unavailable" };
  try {
    const repository = createSupabasePhotoCleanupRepository();
    const authorized = await verifyAndConsumeCleanupRequest({
      ...input,
      secret,
      consume: (requestId, acceptedUntil) =>
        repository.consumeRequest(requestId, acceptedUntil, AbortSignal.timeout(15_000)),
    });
    if (!authorized) return { kind: "unauthorized" };

    const counts = await processPassportPhotoCleanupBatch({
      repository,
      storage: {
        remove: (path, signal) =>
          createSupabasePassportPhotoStorage(
            createCleanupTimeoutFetch(12_000, signal),
          ).removeForCleanup(path),
      },
      logger,
    });
    return { kind: "processed", counts };
  } catch {
    logger.error("passport photo cleanup batch could not be completed", {
      category: "worker_unavailable",
    });
    return { kind: "unavailable" };
  }
}
