import { parseArgs } from "node:util";
import path from "node:path";
import {
  prepareInitialPlatformAdminManifest,
  writeManifestOutsideRepository,
  type InitialPlatformAdminManifestInputs,
} from "./platform-admin-manifest-preparation";

function requiredValue(values: Record<string, string | boolean | undefined>, name: string): string {
  const value = values[name];
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`Missing or invalid --${name}.`);
  }
  return value;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      "project-ref": { type: "string" },
      "target-auth-user-id": { type: "string" },
      "target-account-id": { type: "string" },
      "target-member-id": { type: "string" },
      "target-org-unit-id": { type: "string" },
      "approver-auth-user-id": { type: "string" },
      "evidence-reference": { type: "string" },
      output: { type: "string" },
    },
    strict: true,
  });

  const inputs: InitialPlatformAdminManifestInputs = {
    project_ref: requiredValue(values, "project-ref"),
    target_auth_user_id: requiredValue(values, "target-auth-user-id"),
    target_account_id: requiredValue(values, "target-account-id"),
    target_member_id: requiredValue(values, "target-member-id"),
    target_org_unit_id: requiredValue(values, "target-org-unit-id"),
    approver_auth_user_id: requiredValue(values, "approver-auth-user-id"),
    evidence_reference: requiredValue(values, "evidence-reference"),
  };
  const output = requiredValue(values, "output");
  const keyBase64 = process.env.CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64;
  if (!keyBase64) throw new Error("Bootstrap key is unavailable in the parent process.");

  const manifest = prepareInitialPlatformAdminManifest(inputs, keyBase64);
  const outputPath = writeManifestOutsideRepository(output, process.cwd(), manifest);
  process.stdout.write(`Initial administrator manifest prepared at ${path.resolve(outputPath)}\n`);
}

try {
  main();
} catch {
  process.stderr.write("Manifest preparation failed. No key or provider details were emitted.\n");
  process.exitCode = 1;
}
