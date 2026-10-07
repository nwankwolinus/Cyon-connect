import { AppError, type ErrorCategory, toPublicError } from "@/shared/errors/app-error";
import { CORRELATION_HEADER } from "./correlation";

const STATUS: Record<ErrorCategory, number> = {
  validation: 400,
  authentication: 401,
  authorization: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
  infrastructure: 503,
  internal: 500,
};

export function httpStatusFor(category: ErrorCategory): number {
  return STATUS[category];
}

/** Standard error envelope. Contains the public message and correlation id only. */
export function errorResponse(err: unknown, correlationId: string): Response {
  const publicError = toPublicError(err);
  return Response.json(
    { error: { category: publicError.category, message: publicError.message, correlationId } },
    {
      status: httpStatusFor(publicError.category),
      headers: { "cache-control": "no-store", [CORRELATION_HEADER]: correlationId },
    },
  );
}

export { AppError };
