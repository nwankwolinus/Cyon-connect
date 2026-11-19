export type BoundedRequestBodyResult =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "too_large" }
  | { readonly kind: "invalid" };

const textDecoder = new TextDecoder("utf-8", { fatal: true });

/** Reads at most `maximumBytes` and cancels immediately on invalid length or overflow. */
export async function readBoundedRequestBody(
  request: Request,
  maximumBytes: number,
): Promise<BoundedRequestBodyResult> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || !request.body) {
    return { kind: "invalid" };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) {
      await cancelRequestBody(request);
      return { kind: "invalid" };
    }
    if (Number(declaredLength) > maximumBytes) {
      await cancelRequestBody(request);
      return { kind: "too_large" };
    }
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { kind: "invalid" };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength > maximumBytes - total) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too_large" };
      }
      total += result.value.byteLength;
      chunks.push(result.value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { kind: "ok", text: textDecoder.decode(bytes) };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
}

async function cancelRequestBody(request: Request): Promise<void> {
  await request.body?.cancel().catch(() => undefined);
}
