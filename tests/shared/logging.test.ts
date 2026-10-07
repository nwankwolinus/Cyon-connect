import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "@/shared/logging/logger";
import { getCorrelationId } from "@/shared/http/correlation";

describe("log redaction", () => {
  it("redacts credentials and personal/content fields, including nested", () => {
    const out = redact({
      userId: "u1",
      password: "p",
      accessToken: "t",
      SUPABASE_SERVICE_ROLE_KEY: "k",
      email: "a@b.c",
      messageContent: "hi",
      nested: { authorization: "Bearer x", ok: 1 },
    }) as Record<string, unknown>;
    expect(out.userId).toBe("u1");
    expect(out.password).toBe(REDACTED);
    expect(out.accessToken).toBe(REDACTED);
    expect(out.SUPABASE_SERVICE_ROLE_KEY).toBe(REDACTED);
    expect(out.email).toBe(REDACTED);
    expect(out.messageContent).toBe(REDACTED);
    expect(out.nested).toEqual({ authorization: REDACTED, ok: 1 });
  });
});

describe("correlation id", () => {
  it("reuses a well-formed inbound id and replaces malformed ones", () => {
    const good = new Request("http://x", { headers: { "x-correlation-id": "abc-12345678" } });
    const bad = new Request("http://x", { headers: { "x-correlation-id": "<script>" } });
    expect(getCorrelationId(good)).toBe("abc-12345678");
    expect(getCorrelationId(bad)).not.toBe("<script>");
    expect(getCorrelationId(new Request("http://x"))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
