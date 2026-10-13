import { createGetMyIdentityRoute } from "@/modules/identity/composition";

export const dynamic = "force-dynamic";

/** GET /api/identity/me: current caller's approved identity context. */
export const GET = createGetMyIdentityRoute();
