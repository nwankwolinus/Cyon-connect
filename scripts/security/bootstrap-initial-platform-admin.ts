import { readFileSync } from "node:fs";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";
import { getSupabaseUrl } from "@/infrastructure/config/public";
import {
  decodeBootstrapKey,
  parseInitialPlatformAdminManifest,
  PLATFORM_ADMIN_BOOTSTRAP_PROJECT_REF,
  signPlatformAdminManifest,
} from "./platform-admin-bootstrap-manifest";

function loadNonKeyEnvironment(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Explicitly supplied environment variables are supported when no local env file exists.
  }
}

function projectRefFromUrl(value: string): string {
  const url = new URL(value);
  const [projectRef] = url.hostname.split(".");
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || !projectRef) {
    throw new Error("Bootstrap target must be a hosted Supabase project.");
  }
  return projectRef;
}

async function main(): Promise<void> {
  // Capture credentials before loading .env.local; neither secret may be sourced from that file.
  const operatorKeyBase64 = process.env.CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64;
  const operatorServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!operatorKeyBase64 || !operatorServiceRoleKey) {
    throw new Error("Operator bootstrap credentials are unavailable in the parent process.");
  }
  loadNonKeyEnvironment();
  if (process.env.APP_ENV !== "development" && process.env.APP_ENV !== "test") {
    throw new Error("Initial administrator bootstrap is restricted to development/test.");
  }

  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("Usage: npm run bootstrap:initial-admin -- <manifest.json>");

  const manifest = parseInitialPlatformAdminManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  const projectRef = projectRefFromUrl(getSupabaseUrl());
  if (projectRef !== PLATFORM_ADMIN_BOOTSTRAP_PROJECT_REF || manifest.project_ref !== projectRef) {
    throw new Error("Bootstrap target does not match the approved development project.");
  }

  const key = decodeBootstrapKey(operatorKeyBase64);
  try {
    const mac = signPlatformAdminManifest(manifest, key);
    const { data, error } = await createAdminSupabaseClient().rpc(
      "bootstrap_initial_platform_admin",
      { p_manifest: manifest, p_mac_hex: mac },
    );
    if (error || data !== true) throw new Error("Bootstrap was rejected.");
    process.stdout.write("Initial platform administrator bootstrap completed.\n");
  } finally {
    key.fill(0);
  }
}

void main().catch(() => {
  process.stderr.write(
    "Initial platform administrator bootstrap failed. No provider details were emitted.\n",
  );
  process.exitCode = 1;
});
