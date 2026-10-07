import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";
import { createConsoleLogger } from "@/infrastructure/logging/console-logger";
import { createCheckReadiness } from "./application/check-readiness";
import { createSupabaseDatabaseProbe } from "./infrastructure/supabase-database-probe";
import { createReadinessHandler } from "./presentation/health-handlers";

/**
 * Composition root for the health module: the ONLY place that wires application ports to
 * infrastructure adapters. Server-side; imported by app/ route handlers.
 */
export function createReadinessRoute() {
  const logger = createConsoleLogger({ module: "health" });
  const checkReadiness = createCheckReadiness({
    probes: [createSupabaseDatabaseProbe(createAdminSupabaseClient)],
    logger,
  });
  return createReadinessHandler(checkReadiness, logger);
}
