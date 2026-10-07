export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/** Keys whose values must never reach logs (credentials, personal data, message/financial content). */
const SENSITIVE_KEY =
  /pass(word)?|token|secret|key|authorization|cookie|session|e-?mail|phone|content|body|iban|account_?number/i;

export const REDACTED = "[REDACTED]";

/** Recursively redacts sensitive keys. Depth-limited so hostile structures cannot hang logging. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

/** For failures: a log-safe summary of an unknown thrown value (name only, no message/stack). */
export function describeError(err: unknown): { errorName: string } {
  return { errorName: err instanceof Error ? err.name : "NonError" };
}
