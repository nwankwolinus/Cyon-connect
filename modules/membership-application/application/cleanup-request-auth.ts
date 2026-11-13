import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const bodySchema = z
  .object({ timestamp: z.string().regex(/^\d{10}$/), requestId: z.string().uuid() })
  .strict();

export type VerifiedCleanupRequest = {
  readonly requestId: string;
  readonly acceptedUntil: string;
};

export function verifyCleanupRequest(input: {
  readonly body: string;
  readonly timestamp: string | null;
  readonly requestId: string | null;
  readonly signature: string | null;
  readonly secret: string;
  readonly nowMs?: number;
}): VerifiedCleanupRequest | null {
  if (!input.timestamp || !input.requestId || !input.signature) return null;
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(JSON.parse(input.body));
    if (!parsed.success) return null;
    body = parsed.data;
  } catch {
    return null;
  }
  if (body.timestamp !== input.timestamp || body.requestId !== input.requestId) return null;
  if (!/^[0-9a-f]{64}$/i.test(input.signature)) return null;
  const timestamp = Number(input.timestamp);
  const now = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300) {
    return null;
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.requestId}`, "utf8")
    .digest();
  const supplied = Buffer.from(input.signature, "hex");
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(expected, supplied))
    return null;
  return {
    requestId: body.requestId,
    acceptedUntil: new Date((timestamp + 300) * 1000).toISOString(),
  };
}

/** Consume only after cryptographic verification; the store must enforce a unique request ID. */
export async function verifyAndConsumeCleanupRequest(input: {
  readonly body: string;
  readonly timestamp: string | null;
  readonly requestId: string | null;
  readonly signature: string | null;
  readonly secret: string;
  readonly nowMs?: number;
  readonly consume: (requestId: string, acceptedUntil: string) => Promise<boolean>;
}): Promise<boolean> {
  const verified = verifyCleanupRequest(input);
  if (!verified) return false;
  return input.consume(verified.requestId, verified.acceptedUntil);
}
