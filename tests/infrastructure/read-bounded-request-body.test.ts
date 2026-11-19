import { describe, expect, it } from "vitest";
import { readBoundedRequestBody } from "@/infrastructure/http/read-bounded-request-body";

const url = "http://localhost/request";

function streamedRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  failure = false,
) {
  let index = 0;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]!);
        else if (failure) controller.error(new Error("synthetic stream interruption"));
        else controller.close();
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(url, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit);
  return { request, canceled: () => canceled };
}

describe("readBoundedRequestBody", () => {
  it("reads a valid body below the byte limit", async () => {
    const request = new Request(url, { method: "POST", body: '{"ok":true}' });
    await expect(readBoundedRequestBody(request, 32)).resolves.toEqual({
      kind: "ok",
      text: '{"ok":true}',
    });
  });

  it("accepts a body exactly at the byte limit", async () => {
    const request = new Request(url, { method: "POST", body: "1234" });
    await expect(readBoundedRequestBody(request, 4)).resolves.toEqual({
      kind: "ok",
      text: "1234",
    });
  });

  it("rejects and cancels an oversized stream without Content-Length", async () => {
    const { request, canceled } = streamedRequest([new Uint8Array(4), new Uint8Array(2)]);
    await expect(readBoundedRequestBody(request, 5)).resolves.toEqual({ kind: "too_large" });
    expect(canceled()).toBe(true);
  });

  it("does not trust a misleadingly small Content-Length", async () => {
    const { request, canceled } = streamedRequest([new Uint8Array(4), new Uint8Array(2)], {
      "content-length": "1",
    });
    await expect(readBoundedRequestBody(request, 5)).resolves.toEqual({ kind: "too_large" });
    expect(canceled()).toBe(true);
  });

  it("rejects an excessive declared Content-Length before reading", async () => {
    const { request, canceled } = streamedRequest([new Uint8Array(1)], {
      "content-length": "6",
    });
    await expect(readBoundedRequestBody(request, 5)).resolves.toEqual({ kind: "too_large" });
    expect(canceled()).toBe(true);
  });

  it("rejects malformed UTF-8 and interrupted streams", async () => {
    const malformed = streamedRequest([new Uint8Array([0xc3, 0x28])]);
    await expect(readBoundedRequestBody(malformed.request, 8)).resolves.toEqual({
      kind: "invalid",
    });

    const interrupted = streamedRequest([new TextEncoder().encode("{")], {}, true);
    await expect(readBoundedRequestBody(interrupted.request, 8)).resolves.toEqual({
      kind: "invalid",
    });
  });
});
