/**
 * Guard for destructive database operations (reset, seed). Pure and dependency-free so that
 * CLI scripts and tests can use it. Fails CLOSED: anything not clearly local/dev/test is refused.
 */
export type DestructiveOperation = "reset" | "seed";

export class UnsafeDatabaseOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDatabaseOperationError";
  }
}

const SAFE_ENVIRONMENTS = new Set(["development", "test"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);
export const REMOTE_OVERRIDE_VARIABLE = "CYON_ALLOW_REMOTE_DESTRUCTIVE";
export const REMOTE_OVERRIDE_VALUE = "yes-this-is-not-production";

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function assertSafeForDestructiveOperation(
  operation: DestructiveOperation,
  env: Record<string, string | undefined>,
): void {
  const refuse = (why: string): never => {
    throw new UnsafeDatabaseOperationError(`Refusing database ${operation}: ${why}`);
  };

  const appEnv = env.APP_ENV;
  if (!appEnv) refuse("APP_ENV is not set. Set APP_ENV=development (or test) explicitly.");
  if (appEnv === "production") refuse("APP_ENV=production. This is never allowed.");
  if (!SAFE_ENVIRONMENTS.has(appEnv as string)) {
    refuse(`APP_ENV=${appEnv} is not development or test.`);
  }
  if (env.NODE_ENV === "production") refuse("NODE_ENV=production. This is never allowed.");

  const targets = [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL, env.DATABASE_URL].filter(
    (v): v is string => Boolean(v),
  );
  const remote = targets.filter((t) => {
    const host = hostOf(t);
    return host === null || !LOCAL_HOSTS.has(host);
  });
  if (remote.length > 0 && env[REMOTE_OVERRIDE_VARIABLE] !== REMOTE_OVERRIDE_VALUE) {
    refuse(
      `target is not a local database. Set ${REMOTE_OVERRIDE_VARIABLE}=${REMOTE_OVERRIDE_VALUE} only for a disposable non-production project.`,
    );
  }
}
