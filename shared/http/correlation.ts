export const CORRELATION_HEADER = "x-correlation-id";

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Reuses a well-formed inbound id (so traces can span clients), otherwise mints a new one. */
export function getCorrelationId(request: Request): string {
  const inbound = request.headers.get(CORRELATION_HEADER);
  return inbound && SAFE_ID.test(inbound) ? inbound : crypto.randomUUID();
}
