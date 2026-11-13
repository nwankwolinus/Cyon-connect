import { describe, expect, it, vi } from "vitest";
import { createCleanupTimeoutFetch } from "@/modules/membership-application/infrastructure/cleanup-timeout-fetch";

describe("cleanup timeout fetch", () => {
  it("passes a signal that is aborted when the worker operation is cancelled", async () => {
    const parent = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_resource, init) => {
      expect(init?.signal?.aborted).toBe(false);
      return new Response(null, { status: 204 });
    });
    const request = createCleanupTimeoutFetch(1_000, parent.signal, fetchMock);

    await request("https://storage.example.test/object");
    parent.abort();

    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("bounds a storage request independently of the worker signal", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_resource, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const request = createCleanupTimeoutFetch(5, undefined, fetchMock);

    await expect(request("https://storage.example.test/object")).rejects.toBeDefined();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
