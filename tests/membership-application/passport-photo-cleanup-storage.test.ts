import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn() }));

vi.mock("@/infrastructure/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    storage: {
      from: () => ({ remove: mocks.remove }),
    },
  }),
}));

import { createSupabasePassportPhotoStorage } from "@/modules/membership-application/infrastructure/supabase-passport-photo-storage";

describe("private passport Storage cleanup adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats the exact missing-object response as idempotent success", async () => {
    mocks.remove.mockResolvedValue({ data: [], error: null });
    const storage = createSupabasePassportPhotoStorage();
    await expect(storage.removeForCleanup("applicant/draft/photo.jpg")).resolves.toBe("deleted");

    mocks.remove.mockResolvedValue({
      data: null,
      error: { status: 404, code: "NoSuchKey" },
    });
    await expect(storage.removeForCleanup("applicant/draft/photo.jpg")).resolves.toBe(
      "already_absent",
    );
  });

  it("does not confuse missing buckets or permission failures with an absent object", async () => {
    const storage = createSupabasePassportPhotoStorage();
    mocks.remove.mockResolvedValue({
      data: null,
      error: { status: 404, code: "NoSuchBucket" },
    });
    await expect(storage.removeForCleanup("applicant/draft/photo.jpg")).rejects.toThrow(
      "photo_unavailable",
    );
    mocks.remove.mockResolvedValue({
      data: null,
      error: { status: 403, code: "AccessDenied" },
    });
    await expect(storage.removeForCleanup("applicant/draft/photo.jpg")).rejects.toThrow(
      "photo_unavailable",
    );
  });
});
