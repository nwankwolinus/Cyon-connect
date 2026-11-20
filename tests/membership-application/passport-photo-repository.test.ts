import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/infrastructure/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { createSupabasePassportPhotoRepository } from "@/modules/membership-application/infrastructure/supabase-passport-photo-repository";

afterEach(() => vi.clearAllMocks());

describe("passport photo registration repository", () => {
  it("returns the photo ID and authoritative draft timestamp from registration RPC", async () => {
    const draftUpdatedAt = "2026-11-20T10:15:00.000Z";
    mocks.rpc.mockResolvedValueOnce({
      data: {
        photoId: "44444444-4444-4444-8444-444444444444",
        previousObjectPath: null,
        draftUpdatedAt,
      },
      error: null,
    });

    const result = await createSupabasePassportPhotoRepository().register({
      applicantAuthId: "11111111-1111-4111-8111-111111111111",
      parishId: "22222222-2222-4222-8222-222222222222",
      draftId: "33333333-3333-4333-8333-333333333333",
      photoId: "44444444-4444-4444-8444-444444444444",
      objectPath:
        "11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg",
      byteSize: 1024,
      correlationId: "55555555-5555-4555-8555-555555555555",
    });

    expect(result).toEqual({
      photoId: "44444444-4444-4444-8444-444444444444",
      previousObjectPath: null,
      draftUpdatedAt,
    });
  });

  it("fails closed if the RPC omits its authoritative draft timestamp", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { photoId: "photo-id", previousObjectPath: null },
      error: null,
    });

    await expect(
      createSupabasePassportPhotoRepository().register({
        applicantAuthId: "11111111-1111-4111-8111-111111111111",
        parishId: "22222222-2222-4222-8222-222222222222",
        draftId: "33333333-3333-4333-8333-333333333333",
        photoId: "photo-id",
        objectPath: "path",
        byteSize: 1,
        correlationId: "55555555-5555-4555-8555-555555555555",
      }),
    ).rejects.toThrow("photo_unavailable");
  });
});
