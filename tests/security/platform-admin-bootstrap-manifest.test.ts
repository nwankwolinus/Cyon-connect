import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canonicalPlatformAdminManifest,
  decodeBootstrapKey,
  parseInitialPlatformAdminManifest,
  PLATFORM_ADMIN_MANIFEST_FIELD_ORDER,
  PLATFORM_ADMIN_PERMISSION_CEILING,
  signPlatformAdminManifest,
  verifyPlatformAdminManifest,
  type InitialPlatformAdminManifest,
} from "@/scripts/security/platform-admin-bootstrap-manifest";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const now = new Date("2026-10-14T12:00:00.000Z");
const manifest: InitialPlatformAdminManifest = {
  version: "cyon-platform-admin-bootstrap/v1",
  project_ref: "bpooqfgadtbyeduapwyi",
  operation_id: "10000000-0000-4000-8000-000000000001",
  target_auth_user_id: "10000000-0000-4000-8000-000000000002",
  target_account_id: "10000000-0000-4000-8000-000000000003",
  target_member_id: "10000000-0000-4000-8000-000000000004",
  target_org_unit_id: "10000000-0000-4000-8000-000000000005",
  role: "PLATFORM_ADMIN",
  scope: "platform",
  permission_ceiling: PLATFORM_ADMIN_PERMISSION_CEILING,
  issued_at: "2026-10-14T12:00:00.000Z",
  expires_at: "2026-10-14T12:05:00.000Z",
  approver_auth_user_id: "10000000-0000-4000-8000-000000000002",
  evidence_reference: "owner-approved-initial-bootstrap",
};

describe("initial platform admin bootstrap manifest", () => {
  it("matches SQL field order and four-byte network-order UTF-8 length prefixes", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261014090000_platform_admin_bootstrap.sql",
      ),
      "utf8",
    );
    const fieldsBlock = migration.match(/v_fields\s*:=\s*array\[([\s\S]*?)\];/i)?.[1];
    expect(fieldsBlock).toBeDefined();
    const sqlFieldOrder = [...fieldsBlock!.matchAll(/p_manifest\s*->>\s*'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(sqlFieldOrder).toEqual(PLATFORM_ADMIN_MANIFEST_FIELD_ORDER);

    const unicodeManifest = { ...manifest, evidence_reference: "owner-approved-évidence" };
    const parsed = parseInitialPlatformAdminManifest(unicodeManifest);
    const payload = canonicalPlatformAdminManifest(parsed);
    let offset = 0;
    for (const field of PLATFORM_ADMIN_MANIFEST_FIELD_ORDER) {
      const value = parsed[field];
      const expectedBytes = Buffer.from(value, "utf8");
      expect(payload.subarray(offset, offset + 4).readUInt32BE()).toBe(expectedBytes.length);
      offset += 4;
      expect(payload.subarray(offset, offset + expectedBytes.length)).toEqual(expectedBytes);
      offset += expectedBytes.length;
    }
    expect(offset).toBe(payload.length);

    // PostgreSQL int4send emits the same four-byte network-order representation.
    const signature = signPlatformAdminManifest(parsed, key, now);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyPlatformAdminManifest(parsed, signature, key, now)).toBe(true);
  });

  it("signs and verifies the exact accepted evidence reference", () => {
    const accepted = { ...manifest, evidence_reference: "owner-approved-initial-bootstrap" };
    const signature = signPlatformAdminManifest(accepted, key, now);
    expect(verifyPlatformAdminManifest(accepted, signature, key, now)).toBe(true);
    expect(() =>
      parseInitialPlatformAdminManifest({ ...accepted, evidence_reference: " padded" }),
    ).toThrow();
    expect(() =>
      parseInitialPlatformAdminManifest({ ...accepted, evidence_reference: "padded " }),
    ).toThrow();
    expect(() =>
      parseInitialPlatformAdminManifest({ ...accepted, evidence_reference: "invalid\u0000text" }),
    ).toThrow();
    expect(() =>
      parseInitialPlatformAdminManifest({ ...accepted, evidence_reference: "invalid\ud800text" }),
    ).toThrow();
    expect(() =>
      parseInitialPlatformAdminManifest({ ...accepted, evidence_reference: "😀".repeat(101) }),
    ).not.toThrow();
    expect(() =>
      parseInitialPlatformAdminManifest({ ...accepted, evidence_reference: "😀".repeat(201) }),
    ).toThrow();
  });

  it("rejects altered payload, expiry, environment, or a non-matching approver", () => {
    const signature = signPlatformAdminManifest(manifest, key, now);
    expect(
      verifyPlatformAdminManifest(
        { ...manifest, target_auth_user_id: "10000000-0000-4000-8000-000000000006" },
        signature,
        key,
        now,
      ),
    ).toBe(false);
    expect(
      verifyPlatformAdminManifest(manifest, signature, key, new Date("2026-10-14T12:06:00.000Z")),
    ).toBe(false);
    expect(
      verifyPlatformAdminManifest(
        { ...manifest, project_ref: "aaaaaaaaaaaaaaaaaaaa" },
        signature,
        key,
        now,
      ),
    ).toBe(false);
    expect(() =>
      signPlatformAdminManifest(
        { ...manifest, approver_auth_user_id: "10000000-0000-4000-8000-000000000006" },
        key,
        now,
      ),
    ).toThrow("Invalid initial platform administrator manifest.");
  });

  it("requires at least 32 bytes of base64-encoded key material", () => {
    expect(() => decodeBootstrapKey(Buffer.from("short").toString("base64"))).toThrow(
      "Bootstrap key is unavailable.",
    );
    expect(decodeBootstrapKey(key.toString("base64"))).toEqual(key);
    expect(() => decodeBootstrapKey(`${key.toString("base64")} `)).toThrow();
  });
});
