import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  decodeBootstrapKey,
  parseInitialPlatformAdminManifest,
  PLATFORM_ADMIN_BOOTSTRAP_PROJECT_REF,
  PLATFORM_ADMIN_PERMISSION_CEILING,
  signPlatformAdminManifest,
  type InitialPlatformAdminManifest,
} from "./platform-admin-bootstrap-manifest";

export type InitialPlatformAdminManifestInputs = Pick<
  InitialPlatformAdminManifest,
  | "project_ref"
  | "target_auth_user_id"
  | "target_account_id"
  | "target_member_id"
  | "target_org_unit_id"
  | "approver_auth_user_id"
  | "evidence_reference"
>;

const MANIFEST_TTL_MS = 5 * 60_000;

export function prepareInitialPlatformAdminManifest(
  inputs: InitialPlatformAdminManifestInputs,
  keyBase64: string,
  now = new Date(),
): InitialPlatformAdminManifest {
  if (inputs.project_ref !== PLATFORM_ADMIN_BOOTSTRAP_PROJECT_REF) {
    throw new Error("Manifest project is not approved for initial administrator bootstrap.");
  }

  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + MANIFEST_TTL_MS).toISOString();
  const manifest = parseInitialPlatformAdminManifest({
    version: "cyon-platform-admin-bootstrap/v1",
    project_ref: inputs.project_ref,
    operation_id: randomUUID(),
    target_auth_user_id: inputs.target_auth_user_id,
    target_account_id: inputs.target_account_id,
    target_member_id: inputs.target_member_id,
    target_org_unit_id: inputs.target_org_unit_id,
    role: "PLATFORM_ADMIN",
    scope: "platform",
    permission_ceiling: PLATFORM_ADMIN_PERMISSION_CEILING,
    issued_at: issuedAt,
    expires_at: expiresAt,
    approver_auth_user_id: inputs.approver_auth_user_id,
    evidence_reference: inputs.evidence_reference,
  });

  const key = decodeBootstrapKey(keyBase64);
  try {
    // Validate exact bootstrap constraints; discard the MAC rather than persist or print it.
    signPlatformAdminManifest(manifest, key, now);
    return manifest;
  } finally {
    key.fill(0);
  }
}

export function writeManifestOutsideRepository(
  outputPath: string,
  repositoryRoot: string,
  manifest: InitialPlatformAdminManifest,
): string {
  const repo = realpathSync(repositoryRoot);
  const requestedPath = path.resolve(outputPath);
  const assertOutsideRepository = (target: string): void => {
    const relativeToRepo = path.relative(repo, target);
    if (
      relativeToRepo === "" ||
      (!relativeToRepo.startsWith(`..${path.sep}`) &&
        relativeToRepo !== ".." &&
        !path.isAbsolute(relativeToRepo))
    ) {
      throw new Error("Manifest output must be outside the repository.");
    }
  };
  assertOutsideRepository(requestedPath);
  const parentDirectory = path.dirname(requestedPath);
  mkdirSync(parentDirectory, { recursive: true });
  const realParent = realpathSync(parentDirectory);
  const realOutputPath = path.join(realParent, path.basename(requestedPath));
  assertOutsideRepository(realOutputPath);

  writeFileSync(realOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return realOutputPath;
}
