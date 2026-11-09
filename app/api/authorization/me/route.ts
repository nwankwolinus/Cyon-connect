import { createCurrentPlatformAdminRoute } from "@/modules/authorization/composition";

export const dynamic = "force-dynamic";

/** GET /api/authorization/me: caller-scoped platform administrator check. */
export const GET = createCurrentPlatformAdminRoute();
