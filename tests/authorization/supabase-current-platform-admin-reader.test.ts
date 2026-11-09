import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseCurrentPlatformAdminReader } from "@/modules/authorization/infrastructure/supabase-current-platform-admin-reader";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/infrastructure/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));

afterEach(() => mocks.rpc.mockReset());

describe("Supabase current platform-admin reader", () => {
  it("calls only the signed-in caller-scoped RPC without accepting a user ID", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const reader = createSupabaseCurrentPlatformAdminReader();
    await expect(reader.isCurrentUserPlatformAdmin()).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("current_user_is_platform_admin");
  });

  it("converts provider errors and malformed results to a generic failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("private SQL detail") });
    const reader = createSupabaseCurrentPlatformAdminReader();
    await expect(reader.isCurrentUserPlatformAdmin()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Authorization service unavailable.",
    });
    mocks.rpc.mockResolvedValue({ data: "true", error: null });
    await expect(reader.isCurrentUserPlatformAdmin()).rejects.toMatchObject({
      category: "infrastructure",
    });
  });
});
