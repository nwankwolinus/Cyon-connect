export const PASSPORT_PHOTO_CLEANUP_BATCH_SIZE = 10;
export const PASSPORT_PHOTO_CLEANUP_CONCURRENCY = 4;
export const PASSPORT_PHOTO_CLEANUP_OPERATION_TIMEOUT_MS = 15_000;
export const PASSPORT_PHOTO_CLEANUP_CLAIM_LEASE_MS = 300_000;
// The SQL claim lease is five minutes; stop after three minutes to leave two minutes
// for runtime shutdown and lease recovery before another worker can claim the rows.
export const PASSPORT_PHOTO_CLEANUP_MAX_RUNTIME_MS = 180_000;

export type PassportPhotoCleanupJob = {
  readonly photoId: string;
  readonly applicantAuthId: string;
  readonly sourceDraftId: string;
  readonly objectPath: string;
  readonly reason: "draft_expired" | "replaced" | "applicant_removed" | "legacy_pending";
  readonly sourceExpiresAt: string | null;
  readonly queuedAt: string;
  readonly claimToken: string;
};

export interface PassportPhotoCleanupRepository {
  consumeRequest(requestId: string, acceptedUntil: string, signal: AbortSignal): Promise<boolean>;
  claim(limit: number, signal: AbortSignal): Promise<readonly PassportPhotoCleanupJob[]>;
  complete(photoId: string, claimToken: string, signal: AbortSignal): Promise<boolean>;
  fail(
    photoId: string,
    claimToken: string,
    category: "invalid_object_path" | "storage_unavailable",
    permanent: boolean,
    signal: AbortSignal,
  ): Promise<boolean>;
}

export interface PassportPhotoCleanupStorage {
  remove(objectPath: string, signal: AbortSignal): Promise<"deleted" | "already_absent">;
}

export interface PassportPhotoCleanupLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export type PassportPhotoCleanupCounts = {
  readonly claimed: number;
  readonly completed: number;
  readonly failed: number;
  readonly blocked: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasAuthoritativeProvenance(job: PassportPhotoCleanupJob): boolean {
  if (
    !uuid.test(job.photoId) ||
    !uuid.test(job.applicantAuthId) ||
    !uuid.test(job.sourceDraftId) ||
    !uuid.test(job.claimToken) ||
    job.objectPath !== `${job.applicantAuthId}/${job.sourceDraftId}/${job.photoId}.jpg`
  ) {
    return false;
  }
  if (job.reason !== "draft_expired") return true;
  if (!job.sourceExpiresAt) return false;
  const expires = Date.parse(job.sourceExpiresAt);
  const queued = Date.parse(job.queuedAt);
  return Number.isFinite(expires) && Number.isFinite(queued) && expires <= queued;
}

async function withConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  action: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        await action(values[index]!);
      }
    }),
  );
}

async function withOperationTimeout<T>(input: {
  readonly deadline: AbortSignal;
  readonly timeoutMs: number;
  readonly operation: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  if (input.deadline.aborted) throw new Error("photo_cleanup_deadline_exceeded");
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("photo_cleanup_operation_timeout")),
    input.timeoutMs,
  );
  const signal = AbortSignal.any([input.deadline, controller.signal]);
  let abortListener: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () =>
        reject(
          input.deadline.aborted
            ? new Error("photo_cleanup_deadline_exceeded")
            : new Error("photo_cleanup_operation_timeout"),
        );
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    return await Promise.race([input.operation(signal), aborted]);
  } finally {
    clearTimeout(timer);
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

export async function processPassportPhotoCleanupBatch(input: {
  readonly repository: PassportPhotoCleanupRepository;
  readonly storage: PassportPhotoCleanupStorage;
  readonly logger: PassportPhotoCleanupLogger;
  readonly maxRuntimeMs?: number;
  readonly operationTimeoutMs?: number;
}): Promise<PassportPhotoCleanupCounts> {
  const maxRuntimeMs = input.maxRuntimeMs ?? PASSPORT_PHOTO_CLEANUP_MAX_RUNTIME_MS;
  const operationTimeoutMs =
    input.operationTimeoutMs ?? PASSPORT_PHOTO_CLEANUP_OPERATION_TIMEOUT_MS;
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(
    () => deadlineController.abort(new Error("photo_cleanup_deadline_exceeded")),
    maxRuntimeMs,
  );
  deadlineTimer.unref?.();
  const bounded = <T>(operation: (signal: AbortSignal) => Promise<T>) =>
    withOperationTimeout({
      deadline: deadlineController.signal,
      timeoutMs: operationTimeoutMs,
      operation,
    });

  try {
    const jobs = await bounded((signal) =>
      input.repository.claim(PASSPORT_PHOTO_CLEANUP_BATCH_SIZE, signal),
    );
    if (jobs.length > PASSPORT_PHOTO_CLEANUP_BATCH_SIZE) {
      throw new Error("photo_cleanup_batch_limit_exceeded");
    }
    const counts = { claimed: jobs.length, completed: 0, failed: 0, blocked: 0 };

    await withConcurrency(jobs, PASSPORT_PHOTO_CLEANUP_CONCURRENCY, async (job) => {
      if (!hasAuthoritativeProvenance(job)) {
        counts.blocked += 1;
        await bounded((signal) =>
          input.repository.fail(job.photoId, job.claimToken, "invalid_object_path", true, signal),
        );
        input.logger.error("passport photo cleanup job blocked", {
          category: "invalid_object_path",
        });
        return;
      }

      try {
        // Supabase Storage remove is idempotent; exact NoSuchKey is normalized to
        // already_absent by the Storage adapter, while all other errors are retried.
        await bounded((signal) => input.storage.remove(job.objectPath, signal));
      } catch {
        if (deadlineController.signal.aborted) throw new Error("photo_cleanup_deadline_exceeded");
        counts.failed += 1;
        await bounded((signal) =>
          input.repository.fail(job.photoId, job.claimToken, "storage_unavailable", false, signal),
        );
        input.logger.warn("passport photo cleanup will retry", {
          category: "storage_unavailable",
        });
        return;
      }

      try {
        const completed = await bounded((signal) =>
          input.repository.complete(job.photoId, job.claimToken, signal),
        );
        if (!completed) {
          counts.failed += 1;
          input.logger.warn("passport photo cleanup completion was not confirmed", {
            category: "completion_not_confirmed",
          });
          return;
        }
        counts.completed += 1;
      } catch {
        if (deadlineController.signal.aborted) throw new Error("photo_cleanup_deadline_exceeded");
        counts.failed += 1;
        // Leave the claim leased. A later run repeats the idempotent deletion after
        // lease expiry; the stale token cannot complete a subsequently reclaimed row.
        input.logger.error("passport photo cleanup completion failed", {
          category: "completion_unavailable",
        });
      }
    });

    input.logger.info("passport photo cleanup batch finished", counts);
    return counts;
  } finally {
    clearTimeout(deadlineTimer);
  }
}
