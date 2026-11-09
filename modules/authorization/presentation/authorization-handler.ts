import { AppError, errorResponse } from "@/shared/http/error-response";
import { CORRELATION_HEADER, getCorrelationId } from "@/shared/http/correlation";
import type { GetMyPlatformAdminResult } from "../application/get-my-platform-admin";

export function createCurrentPlatformAdminHandler(
  getMyPlatformAdmin: () => Promise<GetMyPlatformAdminResult>,
) {
  return async (request: Request): Promise<Response> => {
    const correlationId = getCorrelationId(request);
    try {
      const result = await getMyPlatformAdmin();
      if (result.kind === "permitted") {
        return Response.json(
          { authorization: { platformAdmin: true } },
          {
            status: 200,
            headers: { "cache-control": "no-store", [CORRELATION_HEADER]: correlationId },
          },
        );
      }
      if (result.kind === "unauthenticated") {
        return errorResponse(
          new AppError("authentication", "Authentication required."),
          correlationId,
        );
      }
      return errorResponse(
        new AppError("authorization", "Platform access unavailable."),
        correlationId,
      );
    } catch {
      return errorResponse(
        new AppError("infrastructure", "Authorization service unavailable."),
        correlationId,
      );
    }
  };
}
