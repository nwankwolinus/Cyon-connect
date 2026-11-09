import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareInitialPlatformAdminManifest,
  writeManifestOutsideRepository,
  type InitialPlatformAdminManifestInputs,
} from "@/scripts/security/platform-admin-manifest-preparation";

const now = new Date("2026-10-14T12:00:00.000Z");
const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const inputs: InitialPlatformAdminManifestInputs = {
  project_ref: "bpooqfgadtbyeduapwyi",
  target_auth_user_id: "10000000-0000-4000-8000-000000000002",
  target_account_id: "10000000-0000-4000-8000-000000000003",
  target_member_id: "10000000-0000-4000-8000-000000000004",
  target_org_unit_id: "10000000-0000-4000-8000-000000000005",
  approver_auth_user_id: "10000000-0000-4000-8000-000000000002",
  evidence_reference: "owner-approved-initial-bootstrap",
};
const tempDirs: string[] = [];

function makeTempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "cyon-manifest-prep-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("initial platform admin manifest preparation", () => {
  it("creates the fixed manifest shape and five-minute expiry without including key material", () => {
    const manifest = prepareInitialPlatformAdminManifest(inputs, key.toString("base64"), now);
    expect(manifest).toMatchObject({
      version: "cyon-platform-admin-bootstrap/v1",
      project_ref: inputs.project_ref,
      role: "PLATFORM_ADMIN",
      scope: "platform",
      issued_at: now.toISOString(),
      expires_at: "2026-10-14T12:05:00.000Z",
    });
    expect(Object.keys(manifest)).toHaveLength(14);
    expect("hmac_key_base64" in manifest).toBe(false);
  });

  it("rejects bad project, whitespace-padded required values, and invalid keys", () => {
    expect(() =>
      prepareInitialPlatformAdminManifest(
        { ...inputs, project_ref: "aaaaaaaaaaaaaaaaaaaa" },
        key.toString("base64"),
        now,
      ),
    ).toThrow();
    expect(() =>
      prepareInitialPlatformAdminManifest(
        { ...inputs, evidence_reference: " padded" },
        key.toString("base64"),
        now,
      ),
    ).toThrow();
    expect(() =>
      prepareInitialPlatformAdminManifest(
        { ...inputs, target_auth_user_id: ` ${inputs.target_auth_user_id}` },
        key.toString("base64"),
        now,
      ),
    ).toThrow();
    expect(() =>
      prepareInitialPlatformAdminManifest(
        { ...inputs, target_member_id: "" },
        key.toString("base64"),
        now,
      ),
    ).toThrow();
    expect(() =>
      prepareInitialPlatformAdminManifest(
        { ...inputs, approver_auth_user_id: "10000000-0000-4000-8000-000000000006" },
        key.toString("base64"),
        now,
      ),
    ).toThrow();
    expect(() => prepareInitialPlatformAdminManifest(inputs, "not-base64", now)).toThrow();
    expect(() =>
      prepareInitialPlatformAdminManifest(inputs, Buffer.from("short").toString("base64"), now),
    ).toThrow();
  });

  it("writes only the manifest outside the repository and refuses overwrite", () => {
    const root = makeTempDir();
    const repository = path.join(root, "repository");
    const outputDirectory = path.join(root, "operator-temp");
    mkdirSync(repository);
    const manifest = prepareInitialPlatformAdminManifest(inputs, key.toString("base64"), now);
    const output = path.join(outputDirectory, "manifest.json");
    const written = writeManifestOutsideRepository(output, repository, manifest);
    const contents = readFileSync(written, "utf8");
    expect(JSON.parse(contents)).toEqual(manifest);
    expect(contents).not.toContain(key.toString("base64"));
    expect(() => writeManifestOutsideRepository(output, repository, manifest)).toThrow();
  });

  it("runs the preparation command with explicit inputs and never prints the key", () => {
    const root = makeTempDir();
    const output = path.join(root, "manifest.json");
    const script = path.resolve("scripts/security/prepare-initial-platform-admin-manifest.ts");
    const keyBase64 = key.toString("base64");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        script,
        "--project-ref",
        inputs.project_ref,
        "--target-auth-user-id",
        inputs.target_auth_user_id,
        "--target-account-id",
        inputs.target_account_id,
        "--target-member-id",
        inputs.target_member_id,
        "--target-org-unit-id",
        inputs.target_org_unit_id,
        "--approver-auth-user-id",
        inputs.approver_auth_user_id,
        "--evidence-reference",
        inputs.evidence_reference,
        "--output",
        output,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64: keyBase64 },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Initial administrator manifest prepared");
    expect(`${result.stdout}${result.stderr}`).not.toContain(keyBase64);
    expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
      project_ref: inputs.project_ref,
      target_auth_user_id: inputs.target_auth_user_id,
      evidence_reference: inputs.evidence_reference,
    });
  });

  it("refuses to write the manifest inside the repository", () => {
    const root = makeTempDir();
    const repository = path.join(root, "repository");
    mkdirSync(repository);
    const manifest = prepareInitialPlatformAdminManifest(inputs, key.toString("base64"), now);
    expect(() =>
      writeManifestOutsideRepository(path.join(repository, "manifest.json"), repository, manifest),
    ).toThrow("Manifest output must be outside the repository.");
  });
});
