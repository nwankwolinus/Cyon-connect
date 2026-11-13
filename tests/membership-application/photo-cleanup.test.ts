import { describe, expect, it, vi } from "vitest";
import {
  PASSPORT_PHOTO_CLEANUP_BATCH_SIZE,
  PASSPORT_PHOTO_CLEANUP_CLAIM_LEASE_MS,
  PASSPORT_PHOTO_CLEANUP_CONCURRENCY,
  PASSPORT_PHOTO_CLEANUP_MAX_RUNTIME_MS,
  PASSPORT_PHOTO_CLEANUP_OPERATION_TIMEOUT_MS,
  processPassportPhotoCleanupBatch,
  type PassportPhotoCleanupJob,
} from "@/modules/membership-application/application/process-passport-photo-cleanup";

const job = (overrides: Partial<PassportPhotoCleanupJob> = {}): PassportPhotoCleanupJob => ({
  photoId: "33333333-3333-4333-8333-333333333333",
  applicantAuthId: "11111111-1111-4111-8111-111111111111",
  sourceDraftId: "22222222-2222-4222-8222-222222222222",
  objectPath:
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg",
  reason: "draft_expired",
  sourceExpiresAt: "2026-11-01T00:00:00.000Z",
  queuedAt: "2026-11-01T00:00:01.000Z",
  claimToken: "44444444-4444-4444-8444-444444444444",
  ...overrides,
});

function fixture(jobs: PassportPhotoCleanupJob[] = [job()]) {
  return {
    jobs,
    consumeRequest: vi.fn(async () => true),
    claim: vi.fn(async (_limit: number) => jobs.splice(0)),
    complete: vi.fn(async (_photoId: string, _claimToken: string, _signal: AbortSignal) => true),
    fail: vi.fn(
      async (
        _photoId: string,
        _claimToken: string,
        _category: "invalid_object_path" | "storage_unavailable",
        _permanent: boolean,
        _signal: AbortSignal,
      ) => true,
    ),
    storageRemove: vi.fn(
      async (_path: string, _signal?: AbortSignal): Promise<"deleted" | "already_absent"> =>
        "deleted",
    ),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("passport photo cleanup worker", () => {
  it("deletes expired-draft objects through Storage and completes only after confirmation", async () => {
    const f = fixture();
    const result = await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
    });
    expect(f.claim).toHaveBeenCalledOnce();
    expect(f.claim.mock.calls[0]?.[0]).toBe(PASSPORT_PHOTO_CLEANUP_BATCH_SIZE);
    expect(f.storageRemove.mock.calls[0]?.[0]).toBe(job().objectPath);
    expect(f.complete.mock.calls[0]?.slice(0, 2)).toEqual([job().photoId, job().claimToken]);
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, blocked: 0 });
  });

  it("treats an already absent object as cleanable", async () => {
    const f = fixture();
    f.storageRemove.mockResolvedValue("already_absent");
    const result = await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
    });
    expect(f.complete).toHaveBeenCalledOnce();
    expect(result.completed).toBe(1);
  });

  it("leaves transient Storage failures pending and retryable", async () => {
    const f = fixture();
    f.storageRemove.mockRejectedValue(new Error("synthetic storage outage"));
    const result = await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
    });
    expect(f.fail.mock.calls[0]?.slice(0, 4)).toEqual([
      job().photoId,
      job().claimToken,
      "storage_unavailable",
      false,
    ]);
    expect(f.complete).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("recovers when Storage deletion succeeds but the database completion response fails", async () => {
    const first = job();
    const retry = job({ claimToken: "55555555-5555-4555-8555-555555555555" });
    let claims = 0;
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error("database connection lost"))
      .mockResolvedValueOnce(true);
    const repository = {
      consumeRequest: vi.fn(async () => true),
      claim: vi.fn(async () => (claims++ === 0 ? [first] : [retry])),
      complete,
      fail: vi.fn(async () => true),
    };
    const remove = vi.fn().mockResolvedValueOnce("deleted").mockResolvedValueOnce("already_absent");
    const deps = {
      repository,
      storage: { remove },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    const firstRun = await processPassportPhotoCleanupBatch(deps);
    expect(firstRun.failed).toBe(1);
    expect(repository.fail).not.toHaveBeenCalled();
    const retryRun = await processPassportPhotoCleanupBatch(deps);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(retryRun.completed).toBe(1);
  });

  it("rejects malformed object paths without calling Storage", async () => {
    const malformed = job({ objectPath: "other-bucket/someone-elses-file.jpg" });
    const f = fixture([malformed]);
    const result = await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
    });
    expect(f.storageRemove).not.toHaveBeenCalled();
    expect(f.fail.mock.calls[0]?.slice(0, 4)).toEqual([
      malformed.photoId,
      malformed.claimToken,
      "invalid_object_path",
      true,
    ]);
    expect(result.blocked).toBe(1);
  });

  it("rejects expiry jobs whose database expiry evidence is inconsistent", async () => {
    const malformed = job({ sourceExpiresAt: "2026-11-02T00:00:00.000Z" });
    const f = fixture([malformed]);
    await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
    });
    expect(f.storageRemove).not.toHaveBeenCalled();
    expect(f.fail.mock.calls[0]?.slice(0, 4)).toEqual([
      malformed.photoId,
      malformed.claimToken,
      "invalid_object_path",
      true,
    ]);
  });

  it("processes only bounded claims and rejects an adapter that violates the limit", async () => {
    const f = fixture(Array.from({ length: PASSPORT_PHOTO_CLEANUP_BATCH_SIZE + 1 }, () => job()));
    await expect(
      processPassportPhotoCleanupBatch({
        repository: f,
        storage: { remove: f.storageRemove },
        logger: f.logger,
      }),
    ).rejects.toThrow("photo_cleanup_batch_limit_exceeded");
    expect(f.claim).toHaveBeenCalledOnce();
    expect(f.claim.mock.calls[0]?.[0]).toBe(10);
    expect(f.storageRemove).not.toHaveBeenCalled();
  });

  it("does not process one claimed object twice when workers overlap", async () => {
    let leased = false;
    const leaseTokenA = job();
    const repository = {
      consumeRequest: vi.fn(async () => true),
      claim: vi.fn(async () => {
        if (leased) return [];
        leased = true;
        return [leaseTokenA];
      }),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => true),
    };
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const remove = vi.fn(async () => {
      await barrier;
      return "deleted" as const;
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const first = processPassportPhotoCleanupBatch({ repository, storage: { remove }, logger });
    const second = await processPassportPhotoCleanupBatch({
      repository,
      storage: { remove },
      logger,
    });
    release();
    await first;
    expect(second.claimed).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("uses per-operation timeouts and a hard deadline with margin before lease expiry", async () => {
    expect(PASSPORT_PHOTO_CLEANUP_MAX_RUNTIME_MS).toBeLessThan(
      PASSPORT_PHOTO_CLEANUP_CLAIM_LEASE_MS - 60_000,
    );
    expect(PASSPORT_PHOTO_CLEANUP_CONCURRENCY).toBe(4);
    expect(PASSPORT_PHOTO_CLEANUP_BATCH_SIZE).toBe(10);

    const f = fixture();
    let observedSignal: AbortSignal | undefined;
    f.storageRemove.mockImplementation(
      (_path: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          observedSignal = signal;
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const result = await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
      operationTimeoutMs: 5,
      maxRuntimeMs: 100,
    });
    expect(observedSignal?.aborted).toBe(true);
    expect(result.failed).toBe(1);
    expect(f.fail.mock.calls[0]?.[2]).toBe("storage_unavailable");
    expect(PASSPORT_PHOTO_CLEANUP_OPERATION_TIMEOUT_MS).toBeLessThan(
      PASSPORT_PHOTO_CLEANUP_MAX_RUNTIME_MS,
    );
  });

  it("never exceeds the four-object deletion concurrency limit", async () => {
    const jobs = Array.from({ length: 10 }, (_, index) => {
      const photoId = `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`;
      return job({
        photoId,
        objectPath: `11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/${photoId}.jpg`,
      });
    });
    const f = fixture(jobs);
    let current = 0;
    let maximum = 0;
    f.storageRemove.mockImplementation(async () => {
      current += 1;
      maximum = Math.max(maximum, current);
      await new Promise((resolve) => setTimeout(resolve, 1));
      current -= 1;
      return "deleted";
    });
    const result = await processPassportPhotoCleanupBatch({
      repository: f,
      storage: { remove: f.storageRemove },
      logger: f.logger,
    });
    expect(result.completed).toBe(10);
    expect(maximum).toBeLessThanOrEqual(4);
  });

  it("aborts a hung operation at the overall worker deadline so the claim can expire", async () => {
    const f = fixture();
    let observedSignal: AbortSignal | undefined;
    f.storageRemove.mockImplementation(
      (_path: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          observedSignal = signal;
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    await expect(
      processPassportPhotoCleanupBatch({
        repository: f,
        storage: { remove: f.storageRemove },
        logger: f.logger,
        operationTimeoutMs: 100,
        maxRuntimeMs: 5,
      }),
    ).rejects.toThrow("photo_cleanup_deadline_exceeded");
    expect(observedSignal?.aborted).toBe(true);
  });
});
