import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  verifyAndConsumeCleanupRequest,
  verifyCleanupRequest,
} from "@/modules/membership-application/application/cleanup-request-auth";

describe("scheduled cleanup request authentication", () => {
  const secret = "synthetic-test-secret-with-at-least-32-random-bytes";

  function signed(nowMs: number) {
    const timestamp = String(Math.floor(nowMs / 1000));
    const requestId = randomUUID();
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${requestId}`)
      .digest("hex");
    return {
      body: JSON.stringify({ timestamp, requestId }),
      timestamp,
      requestId,
      signature,
      secret,
      nowMs,
    };
  }

  it("accepts a valid, fresh signed invocation", () => {
    const input = signed(1_800_000_000_000);
    expect(verifyCleanupRequest(input)).toMatchObject({ requestId: input.requestId });
    expect(verifyCleanupRequest(input)?.acceptedUntil).toBe(
      new Date((Number(input.timestamp) + 300) * 1000).toISOString(),
    );
  });

  it("rejects missing, altered, stale and malformed signatures or bodies", () => {
    const input = signed(1_800_000_000_000);
    expect(verifyCleanupRequest({ ...input, signature: null })).toBeNull();
    expect(verifyCleanupRequest({ ...input, signature: "0".repeat(64) })).toBeNull();
    expect(verifyCleanupRequest({ ...input, nowMs: input.nowMs + 301_000 })).toBeNull();
    expect(verifyCleanupRequest({ ...input, body: "{}" })).toBeNull();
    expect(
      verifyCleanupRequest({
        ...input,
        body: JSON.stringify({ ...JSON.parse(input.body), extra: true }),
      }),
    ).toBeNull();
  });

  it("does not yield a consumable request for an invalid signature", () => {
    const input = signed(1_800_000_000_000);
    expect(verifyCleanupRequest({ ...input, signature: "0".repeat(64) })).toBeNull();
  });

  it("consumes a valid request once and rejects a replay", async () => {
    const input = signed(1_800_000_000_000);
    const consumed = new Set<string>();
    const consume = async (id: string) => {
      if (consumed.has(id)) return false;
      consumed.add(id);
      return true;
    };
    const verify = () => verifyAndConsumeCleanupRequest({ ...input, consume });
    await expect(verify()).resolves.toBe(true);
    await expect(verify()).resolves.toBe(false);
  });

  it("allows only one concurrent copy of a signed request ID", async () => {
    const input = signed(1_800_000_000_000);
    const consumed = new Set<string>();
    const consume = async (id: string) => {
      if (consumed.has(id)) return false;
      consumed.add(id);
      await Promise.resolve();
      return true;
    };
    const outcomes = await Promise.all([
      verifyAndConsumeCleanupRequest({ ...input, consume }),
      verifyAndConsumeCleanupRequest({ ...input, consume }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("does not consume a request ID when the signature is invalid or expired", async () => {
    const input = signed(1_800_000_000_000);
    const consume = vi.fn(async () => true);
    await expect(
      verifyAndConsumeCleanupRequest({ ...input, signature: "0".repeat(64), consume }),
    ).resolves.toBe(false);
    await expect(
      verifyAndConsumeCleanupRequest({ ...input, nowMs: input.nowMs + 301_000, consume }),
    ).resolves.toBe(false);
    expect(consume).not.toHaveBeenCalled();
  });
});
