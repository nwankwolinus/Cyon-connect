import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseApplicantSessionReader } from "@/modules/applicant-auth/infrastructure/supabase-applicant-session";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock("@/infrastructure/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));

describe("Supabase applicant session reader", () => {
  beforeEach(() => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("returns the verified Auth email and confirmation timestamp from getUser", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user",
          email: "verified@example.test",
          email_confirmed_at: "2026-11-08T10:00:00Z",
        },
      },
      error: null,
    });
    await expect(createSupabaseApplicantSessionReader().getCurrentAuthUser()).resolves.toEqual({
      id: "auth-user",
      email: "verified@example.test",
      emailConfirmedAt: "2026-11-08T10:00:00Z",
    });
  });

  it("does not substitute an email when the verified Auth response has none", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user", email: null, email_confirmed_at: "now" } },
      error: null,
    });
    await expect(createSupabaseApplicantSessionReader().getCurrentAuthUser()).resolves.toEqual({
      id: "auth-user",
      email: "",
      emailConfirmedAt: "now",
    });
  });
});
