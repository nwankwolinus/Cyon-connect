/** Normalize the punctuation and spacing accepted by applicant phone inputs. */
export function normalizePhoneNumber(value: string): string {
  return value.trim().replace(/[\s().-]/g, "");
}

export function isValidPhoneNumber(value: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(normalizePhoneNumber(value));
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Keep a newer server version when an older in-flight response arrives later. */
export function acceptDraftUpdatedAt(
  current: string | null,
  requestVersion: string | null,
  responseVersion: string,
): string | null {
  return current === requestVersion ? responseVersion : current;
}

/** Serialize operations that mutate an applicant's draft and its concurrency token. */
export function enqueueDraftMutation<T>(
  queue: { current: Promise<void> },
  operation: () => Promise<T>,
): Promise<T> {
  const queuedOperation = queue.current.catch(() => undefined).then(operation);
  queue.current = queuedOperation.then(
    () => undefined,
    () => undefined,
  );
  return queuedOperation;
}
