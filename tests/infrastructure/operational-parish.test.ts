import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { toPublicError } from "@/shared/errors/app-error";
import {
  createOperationalParishResolver,
  OPERATIONAL_PARISH_NAME,
} from "@/infrastructure/organization/operational-parish";

const configuredParishId = "4e784b43-7c94-4dd7-a215-a4f4c6b88070";
const otherParishId = "00000000-0000-4000-8000-000000000099";

function createClient(result: { data: unknown; error: unknown | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
    maybeSingle,
  };
}

const validParishRow = {
  id: configuredParishId,
  unit_type: "parish",
  name: OPERATIONAL_PARISH_NAME,
};

describe("operational parish resolver", () => {
  it("resolves exactly the configured canonical parish using a narrow read", async () => {
    const db = createClient({ data: validParishRow, error: null });
    const resolve = createOperationalParishResolver({
      getClient: () => db.client,
      getConfiguredParishId: () => configuredParishId,
    });

    await expect(resolve()).resolves.toEqual({
      id: configuredParishId,
      type: "parish",
      name: OPERATIONAL_PARISH_NAME,
    });
    expect(db.from).toHaveBeenCalledWith("org_units");
    expect(db.select).toHaveBeenCalledWith("id,unit_type,name");
    expect(db.eq).toHaveBeenCalledWith("id", configuredParishId);
    expect(db.maybeSingle).toHaveBeenCalledOnce();
  });

  it("fails closed when the server configuration is missing", async () => {
    const getClient = vi.fn();
    const resolve = createOperationalParishResolver({
      getClient: getClient as never,
      getConfiguredParishId: () => undefined,
    });

    await expect(resolve()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Operational parish is unavailable.",
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it("fails closed for a malformed configured identifier", async () => {
    const getClient = vi.fn();
    const resolve = createOperationalParishResolver({
      getClient: getClient as never,
      getConfiguredParishId: () => "not-a-uuid",
    });

    await expect(resolve()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Operational parish is unavailable.",
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it("fails closed when no organization matches the configured identifier", async () => {
    const db = createClient({ data: null, error: null });
    const resolve = createOperationalParishResolver({
      getClient: () => db.client,
      getConfiguredParishId: () => configuredParishId,
    });

    await expect(resolve()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Operational parish is unavailable.",
    });
  });

  it.each([
    { label: "wrong unit type", row: { ...validParishRow, unit_type: "deanery" } },
    { label: "different parish name", row: { ...validParishRow, name: "Another Parish" } },
    { label: "mismatched row identifier", row: { ...validParishRow, id: otherParishId } },
    { label: "multiple rows", row: [validParishRow, { ...validParishRow, id: otherParishId }] },
  ])("fails closed for $label", async ({ row }) => {
    const db = createClient({ data: row, error: null });
    const resolve = createOperationalParishResolver({
      getClient: () => db.client,
      getConfiguredParishId: () => configuredParishId,
    });

    await expect(resolve()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Operational parish is unavailable.",
    });
  });

  it("fails closed when the database reports an ambiguous maybeSingle result", async () => {
    const db = createClient({ data: null, error: { code: "PGRST116", message: "multiple rows" } });
    const resolve = createOperationalParishResolver({
      getClient: () => db.client,
      getConfiguredParishId: () => configuredParishId,
    });

    await expect(resolve()).rejects.toMatchObject({
      category: "infrastructure",
      publicMessage: "Operational parish is unavailable.",
    });
  });

  it("does not allow an extra applicant-supplied parish argument to override configuration", async () => {
    const db = createClient({ data: validParishRow, error: null });
    const resolve = createOperationalParishResolver({
      getClient: () => db.client,
      getConfiguredParishId: () => configuredParishId,
    });

    await (resolve as (untrustedParishId?: string) => Promise<unknown>)(otherParishId);
    expect(db.eq).toHaveBeenCalledWith("id", configuredParishId);
    expect(db.eq).not.toHaveBeenCalledWith("id", otherParishId);
  });

  it("does not expose invalid configuration or database details in public errors", async () => {
    const secretConfigValue = "private-config-value";
    const db = createClient({
      data: null,
      error: { message: "private database detail" },
    });
    const resolve = createOperationalParishResolver({
      getClient: () => db.client,
      getConfiguredParishId: () => secretConfigValue,
    });

    try {
      await resolve();
      throw new Error("expected resolver to fail");
    } catch (error) {
      const publicError = toPublicError(error);
      expect(publicError).toEqual({
        category: "infrastructure",
        message: "Operational parish is unavailable.",
      });
      expect(JSON.stringify(publicError)).not.toContain(secretConfigValue);
      expect(JSON.stringify(publicError)).not.toContain("private database detail");
    }
  });
});
