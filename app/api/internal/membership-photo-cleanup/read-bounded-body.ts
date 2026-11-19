import { readBoundedRequestBody as readSharedBoundedRequestBody } from "@/infrastructure/http/read-bounded-request-body";

/** Reads at most `maximumBytes` into memory and cancels immediately on overflow. */
export async function readBoundedRequestBody(
  request: Request,
  maximumBytes: number,
): Promise<string | null> {
  const result = await readSharedBoundedRequestBody(request, maximumBytes);
  return result.kind === "ok" ? result.text : null;
}
