/**
 * Error conventions (FR-SEC-026): errors returned to clients must not disclose credentials,
 * tokens, database paths or restricted-record information. Internal detail goes to server logs.
 */
export type AppErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_FAILED" | "CONFLICT" | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly publicMessage: string,
    options?: { cause?: unknown },
  ) {
    super(publicMessage, options);
    this.name = "AppError";
  }
}

export function toPublicError(err: unknown): { code: AppErrorCode; message: string } {
  if (err instanceof AppError) return { code: err.code, message: err.publicMessage };
  return { code: "INTERNAL", message: "Something went wrong." };
}
