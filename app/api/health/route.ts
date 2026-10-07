import { livenessHandler } from "@/modules/health/presentation/health-handlers";

export const dynamic = "force-dynamic";

/** GET /api/health : liveness (process is running). */
export function GET() {
  return livenessHandler();
}
