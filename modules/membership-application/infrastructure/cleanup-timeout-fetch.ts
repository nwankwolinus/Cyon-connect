/** Adds a hard network timeout while preserving any caller-provided abort signal. */
export function createCleanupTimeoutFetch(
  timeoutMs: number,
  parentSignal?: AbortSignal,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  return (resource, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signals = [timeout, parentSignal, init?.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    const signal = signals.length === 1 ? signals[0]! : AbortSignal.any(signals);
    return baseFetch(resource, { ...init, signal });
  };
}
