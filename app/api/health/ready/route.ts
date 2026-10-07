import { createReadinessRoute } from "@/modules/health/composition";

export const dynamic = "force-dynamic";

/** GET /api/health/ready : readiness (required infrastructure reachable). 200 or 503. */
export const GET = createReadinessRoute();
