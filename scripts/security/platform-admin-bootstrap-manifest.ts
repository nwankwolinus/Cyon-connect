import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PLATFORM_ADMIN_PERMISSION_CEILING =
  "platform.authorization.assignment.read,platform.authorization.assignment.grant,platform.authorization.assignment.revoke,platform.security_audit.read";

export const PLATFORM_ADMIN_BOOTSTRAP_PROJECT_REF = "bpooqfgadtbyeduapwyi";

function isPostgresTextValue(value: string): boolean {
  if (value.includes("\u0000")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

const manifestSchema = z
  .object({
    version: z.literal("cyon-platform-admin-bootstrap/v1"),
    project_ref: z.string().regex(/^[a-z0-9]{20}$/),
    operation_id: z.string().uuid(),
    target_auth_user_id: z.string().uuid(),
    target_account_id: z.string().uuid(),
    target_member_id: z.string().uuid(),
    target_org_unit_id: z.string().uuid(),
    role: z.literal("PLATFORM_ADMIN"),
    scope: z.literal("platform"),
    permission_ceiling: z.literal(PLATFORM_ADMIN_PERMISSION_CEILING),
    issued_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    approver_auth_user_id: z.string().uuid(),
    evidence_reference: z
      .string()
      .min(1)
      .refine((value) => Array.from(value).length <= 200, "Must contain at most 200 characters.")
      .refine((value) => value === value.trim(), "Must not have leading or trailing whitespace.")
      .refine(isPostgresTextValue, "Must be representable as PostgreSQL text."),
  })
  .strict();

export type InitialPlatformAdminManifest = z.infer<typeof manifestSchema>;

export const PLATFORM_ADMIN_MANIFEST_FIELD_ORDER = [
  "version",
  "project_ref",
  "operation_id",
  "target_auth_user_id",
  "target_account_id",
  "target_member_id",
  "target_org_unit_id",
  "role",
  "scope",
  "permission_ceiling",
  "issued_at",
  "expires_at",
  "approver_auth_user_id",
  "evidence_reference",
] as const satisfies readonly (keyof InitialPlatformAdminManifest)[];

export function parseInitialPlatformAdminManifest(value: unknown): InitialPlatformAdminManifest {
  return manifestSchema.parse(value);
}

/** Length-prefixed UTF-8 fields avoid JSON canonicalization ambiguity across Node and PostgreSQL. */
export function canonicalPlatformAdminManifest(manifest: InitialPlatformAdminManifest): Buffer {
  const parsed = parseInitialPlatformAdminManifest(manifest);
  const values = PLATFORM_ADMIN_MANIFEST_FIELD_ORDER.map((field) => parsed[field]);
  const chunks: Buffer[] = [];
  for (const value of values) {
    const bytes = Buffer.from(value, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    chunks.push(length, bytes);
  }
  return Buffer.concat(chunks);
}

function validateManifest(parsed: InitialPlatformAdminManifest, now: Date): boolean {
  const issued = new Date(parsed.issued_at);
  const expires = new Date(parsed.expires_at);
  return (
    issued.toISOString() === parsed.issued_at &&
    expires.toISOString() === parsed.expires_at &&
    issued.getTime() <= now.getTime() + 60_000 &&
    expires.getTime() > now.getTime() &&
    expires.getTime() > issued.getTime() &&
    expires.getTime() - issued.getTime() <= 15 * 60_000 &&
    parsed.target_auth_user_id === parsed.approver_auth_user_id
  );
}

export function verifyPlatformAdminManifest(
  manifest: InitialPlatformAdminManifest,
  macHex: string,
  key: Buffer,
  now = new Date(),
): boolean {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success || key.length < 32 || !/^[0-9a-f]{64}$/.test(macHex)) return false;
  if (!validateManifest(parsed.data, now)) return false;
  const expected = createHmac("sha256", key)
    .update(canonicalPlatformAdminManifest(parsed.data))
    .digest();
  const supplied = Buffer.from(macHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function signPlatformAdminManifest(
  manifest: InitialPlatformAdminManifest,
  key: Buffer,
  now = new Date(),
): string {
  const parsed = parseInitialPlatformAdminManifest(manifest);
  if (key.length < 32 || !validateManifest(parsed, now)) {
    throw new Error("Invalid initial platform administrator manifest.");
  }
  return createHmac("sha256", key).update(canonicalPlatformAdminManifest(parsed)).digest("hex");
}

export function decodeBootstrapKey(keyBase64: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(keyBase64)) {
    throw new Error("Bootstrap key must be base64 encoded.");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length < 32 || key.toString("base64") !== keyBase64) {
    key.fill(0);
    throw new Error("Bootstrap key is unavailable.");
  }
  return key;
}
