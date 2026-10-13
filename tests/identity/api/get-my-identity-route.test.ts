import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/identity/me/route";
import { AppError } from "@/shared/errors/app-error";
import type { GetMyIdentityResult } from "@/modules/identity/application/get-my-identity";
import type { IdentityContextLookup } from "@/modules/identity/application/ports";

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn<() => Promise<string | null>>(),
  findByAuthUserId: vi.fn<(authUserId: string) => Promise<unknown>>(),
}));

vi.mock("@/modules/identity/infrastructure/supabase-trusted-authenticated-user", () => ({
  createSupabaseTrustedAuthenticatedUser: () => ({ getAuthUserId: mocks.getAuthUserId }),
}));

vi.mock("@/modules/identity/infrastructure/supabase-identity-context-reader", () => ({
  createSupabaseIdentityContextReader: () => ({ findByAuthUserId: mocks.findByAuthUserId }),
}));

const authUserId = "verified-caller-id";
const activeLookup: IdentityContextLookup = {
  kind: "found",
  account: {
    id: "account-id",
    authUserId,
    memberId: "member-id",
    accountStatus: "active",
  },
  member: {
    id: "member-id",
    membershipStatus: "active",
    homeParish: { id: "parish-id", type: "parish" },
  },
};
const permitted: GetMyIdentityResult = {
  kind: "permitted",
  identity: {
    account: { id: "account-id", status: "active" },
    member: { id: "member-id", status: "active" },
    homeOrganization: { id: "parish-id", type: "parish" },
  },
};

const call = (url = "http://app/api/identity/me") => GET(new Request(url));

beforeEach(() => {
  mocks.getAuthUserId.mockResolvedValue(authUserId);
  mocks.findByAuthUserId.mockResolvedValue(activeLookup);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.getAuthUserId.mockReset();
  mocks.findByAuthUserId.mockReset();
});

describe("GET /api/identity/me", () => {
  it("returns only the approved identity context", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ identity: permitted.identity });
    expect(mocks.findByAuthUserId).toHaveBeenCalledWith(authUserId);
  });

  it("returns 401 without querying identity when no user is authenticated", async () => {
    mocks.getAuthUserId.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { category: "authentication", message: "Authentication required." },
    });
    expect(mocks.findByAuthUserId).not.toHaveBeenCalled();
  });

  it("returns 403 for denied identity context without identity details", async () => {
    mocks.findByAuthUserId.mockResolvedValue({ kind: "access_denied" });

    const response = await call();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { category: "authorization", message: "Identity context access denied." },
    });
  });

  it("returns a generic 404 for missing or inconsistent identity links", async () => {
    mocks.findByAuthUserId.mockResolvedValue({ kind: "inconsistent_links" });

    const response = await call();

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { category: "not_found", message: "Identity context unavailable." },
    });
  });

  it.each(["Auth provider detail", "SQL relation detail"])(
    "returns a generic 503 and does not expose %s",
    async (sensitiveDetail) => {
      mocks.getAuthUserId.mockRejectedValue(
        new AppError("infrastructure", "Authentication service unavailable.", {
          cause: new Error(sensitiveDetail),
        }),
      );

      const response = await call();
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(body).not.toContain(sensitiveDetail);
      expect(body).toContain("Authentication service unavailable.");
      expect(mocks.findByAuthUserId).not.toHaveBeenCalled();
    },
  );

  it("does not disclose database provider errors", async () => {
    mocks.findByAuthUserId.mockRejectedValue(
      new AppError("infrastructure", "Identity context unavailable.", {
        cause: new Error("private database detail"),
      }),
    );

    const response = await call();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("private database detail");
    expect(body).not.toContain("account-id");
  });

  it("does not substitute a caller-supplied query identity for the verified user", async () => {
    const response = await call("http://app/api/identity/me?userId=another-person");

    expect(response.status).toBe(200);
    expect(mocks.getAuthUserId).toHaveBeenCalledOnce();
    expect(mocks.findByAuthUserId).toHaveBeenCalledWith(authUserId);
  });
});
