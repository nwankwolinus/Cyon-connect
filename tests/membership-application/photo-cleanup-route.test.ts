import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(async () => ({
    kind: "processed" as const,
    counts: { claimed: 0, completed: 0, failed: 0, blocked: 0 },
  })),
}));

vi.mock("@/modules/membership-application/composition-photo-cleanup", () => ({
  runMembershipPhotoCleanup: mocks.run,
}));

import { POST } from "@/app/api/internal/membership-photo-cleanup/route";

const url = "http://localhost:3000/api/internal/membership-photo-cleanup";
const requestId = "8c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946";
const timestamp = "1800000000";
const headers = {
  "content-type": "application/json",
  "x-cyon-cleanup-timestamp": timestamp,
  "x-cyon-cleanup-request-id": requestId,
  "x-cyon-cleanup-signature": "a".repeat(64),
};
const bodyObject = { timestamp, requestId };

function requestWithBody(body: string, extraHeaders: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { ...headers, ...extraHeaders },
    body,
  });
}

function streamedRequest(chunks: Uint8Array[], extraHeaders: Record<string, string> = {}) {
  let index = 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]!);
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
    headers: { ...headers, ...extraHeaders },
    body: stream,
    duplex: "half",
  } as RequestInit);
  return { request, canceled: () => canceled };
}

function paddedBody(length: number): string {
  const body = JSON.stringify(bodyObject);
  return body + " ".repeat(length - Buffer.byteLength(body));
}

describe("internal passport-photo cleanup endpoint body boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a body below the limit", async () => {
    const response = await POST(requestWithBody(JSON.stringify(bodyObject)));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it("accepts a valid body exactly at the 1 KiB limit", async () => {
    const body = paddedBody(1024);
    const response = await POST(requestWithBody(body, { "content-length": "1024" }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it("rejects an oversized body with no Content-Length and cancels the stream", async () => {
    const { request, canceled } = streamedRequest([
      new Uint8Array(600),
      new Uint8Array(500),
      new Uint8Array(20),
    ]);
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(canceled()).toBe(true);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("does not trust a falsely small Content-Length", async () => {
    const { request, canceled } = streamedRequest(
      [new Uint8Array(700), new Uint8Array(400), new Uint8Array(10)],
      { "content-length": "1" },
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(canceled()).toBe(true);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects an excessive declared length before reading the body", async () => {
    const { request, canceled } = streamedRequest([new Uint8Array(2_000)], {
      "content-length": "2048",
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(canceled()).toBe(true);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON only after bounded reading", async () => {
    const response = await POST(requestWithBody("{"));
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects an interrupted request stream safely", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.error(new Error("synthetic stream interruption"));
      },
    });
    const request = new Request(url, {
      method: "POST",
      headers,
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
