/** Readiness vocabulary. Pure domain: no framework, SDK or environment access. */
export type DependencyStatus = "up" | "down";
export type ReadinessStatus = "ready" | "not_ready";

export interface DependencyCheck {
  readonly name: string;
  readonly status: DependencyStatus;
  readonly latencyMs: number;
}

export interface ReadinessReport {
  readonly status: ReadinessStatus;
  readonly checks: readonly DependencyCheck[];
}

/** Ready only if at least one dependency was checked and every one is up (fail closed). */
export function buildReadinessReport(checks: readonly DependencyCheck[]): ReadinessReport {
  const ready = checks.length > 0 && checks.every((c) => c.status === "up");
  return { status: ready ? "ready" : "not_ready", checks };
}
