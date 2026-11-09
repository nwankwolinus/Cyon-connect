import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/authorization/me/route";

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn<() => Promise<string | null>>(),
  isCurrentUserPlatformAdmin: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/infrastructure/supabase/trusted-authenticated-user", () => ({
  createTrustedAuthenticatedUser: () => ({ getAuthUserId: mocks.getAuthUserId }),
}));
vi.mock("@/modules/authorization/infrastructure/supabase-current-platform-admin-reader", () => ({
  createSupabaseCurrentPlatformAdminReader: () => ({
    isCurrentUserPlatformAdmin: mocks.isCurrentUserPlatformAdmin,
  }),
}));

const call = (url = "http://app/api/authorization/me") => GET(new Request(url));

beforeEach(() => {
  mocks.getAuthUserId.mockResolvedValue("verified-caller-id");
  mocks.isCurrentUserPlatformAdmin.mockResolvedValue(true);
});

afterEach(() => {
  mocks.getAuthUserId.mockReset();
  mocks.isCurrentUserPlatformAdmin.mockReset();
});

describe("GET /api/authorization/me", () => {
  it("returns only the current caller's platform-admin boolean", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ authorization: { platformAdmin: true } });
    expect(mocks.getAuthUserId).toHaveBeenCalledOnce();
    expect(mocks.isCurrentUserPlatformAdmin).toHaveBeenCalledOnce();
  });

  it("does not evaluate privileges for an unauthenticated caller", async () => {
    mocks.getAuthUserId.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.isCurrentUserPlatformAdmin).not.toHaveBeenCalled();
  });

  it("denies an ordinary authenticated caller without exposing details", async () => {
    mocks.isCurrentUserPlatformAdmin.mockResolvedValue(false);
    const response = await call("http://app/api/authorization/me?userId=another-person");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { category: "authorization", message: "Platform access unavailable." },
    });
    expect(mocks.isCurrentUserPlatformAdmin).toHaveBeenCalledOnce();
  });

  it("returns a generic infrastructure error rather than granting access", async () => {
    mocks.isCurrentUserPlatformAdmin.mockRejectedValue(new Error("private SQL detail"));
    const response = await call();
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).not.toContain("private SQL detail");
    expect(body).not.toContain("verified-caller-id");
  });
});
