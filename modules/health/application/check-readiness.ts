import type { Logger } from "@/shared/logging/logger";
import { describeError } from "@/shared/logging/logger";
import { buildReadinessReport, type DependencyCheck, type ReadinessReport } from "@/modules/health/domain/readiness";
import type { InfrastructureProbe } from "./ports";

export type { ReadinessReport, DependencyCheck } from "@/modules/health/domain/readiness";

export type CheckReadiness = () => Promise<ReadinessReport>;

export interface CheckReadinessDeps {
  probes: readonly InfrastructureProbe[];
  logger: Logger;
  timeoutMs?: number;
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 3000;

/** Use case: run every probe with a timeout. Failure detail goes to logs (name only), never to the report. */
export function createCheckReadiness(deps: CheckReadinessDeps): CheckReadiness {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? Date.now;

  async function runProbe(probe: InfrastructureProbe): Promise<DependencyCheck> {
    const started = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        probe.check(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("TimeoutError")), timeoutMs);
        }),
      ]);
      return { name: probe.name, status: "up", latencyMs: now() - started };
    } catch (e) {
      deps.logger.warn("readiness probe failed", { dependency: probe.name, ...describeError(e) });
      return { name: probe.name, status: "down", latencyMs: now() - started };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async () => buildReadinessReport(await Promise.all(deps.probes.map(runProbe)));
}
