const textDecoder = new TextDecoder("utf-8", { fatal: true });

/** Reads at most `maximumBytes` into memory and cancels immediately on overflow. */
export async function readBoundedRequestBody(
  request: Request,
  maximumBytes: number,
): Promise<string | null> {
  if (!request.body || !Number.isSafeInteger(maximumBytes) || maximumBytes < 0) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return textDecoder.decode(bytes);
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}
