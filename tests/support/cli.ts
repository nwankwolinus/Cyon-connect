import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
// Run tsx through Node directly: node_modules/.bin/tsx is a shell script on POSIX and a .cmd shim on Windows,
// neither of which spawnSync can execute portably.
const TSX_CLI = path.join(root, "node_modules/tsx/dist/cli.mjs");

/** Variables that influence the database safety guard; removed so the host environment cannot leak into tests. */
const GUARDED = [
  "APP_ENV",
  "NODE_ENV",
  "DATABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "CYON_ALLOW_REMOTE_DESTRUCTIVE",
];

export function runTsx(
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
): SpawnSyncReturns<string> {
  const base: Record<string, string | undefined> = { ...process.env };
  for (const key of GUARDED) delete base[key];
  return spawnSync(process.execPath, [TSX_CLI, path.join(root, script), ...args], {
    cwd: root,
    env: { ...base, ...env } as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}
