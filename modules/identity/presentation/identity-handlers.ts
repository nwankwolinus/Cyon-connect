import { AppError, errorResponse } from "@/shared/http/error-response";
import { CORRELATION_HEADER, getCorrelationId } from "@/shared/http/correlation";
import type { Logger } from "@/shared/logging/logger";
import { describeError } from "@/shared/logging/logger";
import type { GetMyIdentity } from "@/modules/identity/application/get-my-identity";

const NO_STORE = { "cache-control": "no-store" };

/** Maps the read-only application outcome to the API response without exposing identity internals. */
export function createGetMyIdentityHandler(getMyIdentity: GetMyIdentity, logger: Logger) {
  return async function getMyIdentityHandler(request: Request): Promise<Response> {
    const correlationId = getCorrelationId(request);
    try {
      const result = await getMyIdentity();
      if (result.kind === "permitted") {
        return Response.json(
          { identity: result.identity },
          {
            status: 200,
            headers: { ...NO_STORE, [CORRELATION_HEADER]: correlationId },
          },
        );
      }

      if (result.kind === "unauthenticated") {
        return errorResponse(
          new AppError("authentication", "Authentication required."),
          correlationId,
        );
      }

      if (result.kind === "access_denied") {
        return errorResponse(
          new AppError("authorization", "Identity context access denied."),
          correlationId,
        );
      }

      return errorResponse(
        new AppError("not_found", "Identity context unavailable."),
        correlationId,
      );
    } catch (error) {
      logger.error("identity context request failed", {
        correlationId,
        ...describeError(error),
      });
      return errorResponse(error, correlationId);
    }
  };
}
