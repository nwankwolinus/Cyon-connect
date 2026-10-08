import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  assertSafeForDestructiveOperation,
  UnsafeDatabaseOperationError,
} from "../../infrastructure/database/safety";

type Command = "migrate" | "reset" | "seed";
const [command, ...flags] = process.argv.slice(2) as [Command | undefined, ...string[]];
const dryRun = flags.includes("--dry-run");

function loadLocalEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local is optional; explicit environment variables still apply.
  }
}

function run(file: string, args: string[]) {
  console.log(`> ${file} ${args.join(" ")}`);
  // Fixed, non-user-controlled arguments only; a shell is needed on Windows to run the supabase .cmd shim.
  if (!dryRun)
    execFileSync(file, args, {
      stdio: "inherit",
      shell: process.platform === "win32" && file === "supabase",
    });
}

function main() {
  if (command !== "migrate" && command !== "reset" && command !== "seed") {
    console.error("Usage: tsx scripts/database/run.ts <migrate|reset|seed> [--dry-run]");
    process.exit(2);
  }
  loadLocalEnv();

  if (command === "migrate") {
    // Applies pending migrations to the LOCAL Supabase stack. Remote deployment is a separate, deliberate step.
    run("supabase", ["migration", "up", "--local"]);
    return;
  }

  assertSafeForDestructiveOperation(command, process.env);

  if (command === "reset") {
    // Drops and recreates the local database, re-applies all migrations, then supabase/seed/*.sql.
    run("supabase", ["db", "reset", "--local"]);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url)
    throw new UnsafeDatabaseOperationError("Refusing database seed: DATABASE_URL is not set.");
  const dir = path.resolve("supabase/seed");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) run("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", path.join(dir, f)]);
}

try {
  main();
} catch (e) {
  if (e instanceof UnsafeDatabaseOperationError) {
    console.error(e.message);
    process.exit(3);
  }
  console.error("Database command failed.");
  process.exit(1);
}
