/**
 * Application error model shared by every module (FR-SEC-026).
 * `publicMessage` is safe to show to clients. `cause` and `details` are for server logs only.
 */
export const ERROR_CATEGORIES = [
  "validation",
  "authentication",
  "authorization",
  "not_found",
  "conflict",
  "business_rule",
  "infrastructure",
  "internal",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export class AppError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    public readonly publicMessage: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(publicMessage, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.details = options?.details;
  }
  /** Server-side diagnostic detail. Never serialised to clients. */
  public readonly details?: Record<string, unknown>;
}

export interface PublicError {
  category: ErrorCategory;
  message: string;
}

/** Converts anything thrown into a client-safe shape. Unknown errors never leak detail. */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof AppError) return { category: err.category, message: err.publicMessage };
  return { category: "internal", message: "Something went wrong." };
}
