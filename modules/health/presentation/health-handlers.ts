import { errorResponse } from "@/shared/http/error-response";
import { CORRELATION_HEADER, getCorrelationId } from "@/shared/http/correlation";
import type { Logger } from "@/shared/logging/logger";
import type { CheckReadiness } from "@/modules/health/application/check-readiness";

const NO_STORE = { "cache-control": "no-store" };

/** Liveness: the process is up. Deliberately touches NO infrastructure and reads NO configuration. */
export function livenessHandler(): Response {
  return Response.json({ status: "ok" }, { headers: NO_STORE });
}

/** Readiness: required infrastructure is reachable. 200 when ready, 503 otherwise. */
export function createReadinessHandler(checkReadiness: CheckReadiness, logger: Logger) {
  return async function readinessHandler(request: Request): Promise<Response> {
    const correlationId = getCorrelationId(request);
    try {
      const report = await checkReadiness();
      if (report.status !== "ready") {
        logger.warn("service not ready", {
          correlationId,
          down: report.checks.filter((c) => c.status === "down").map((c) => c.name),
        });
      }
      return Response.json(report, {
        status: report.status === "ready" ? 200 : 503,
        headers: { ...NO_STORE, [CORRELATION_HEADER]: correlationId },
      });
    } catch (e) {
      logger.error("readiness check crashed", { correlationId, errorName: e instanceof Error ? e.name : "NonError" });
      return errorResponse(e, correlationId);
    }
  };
}
