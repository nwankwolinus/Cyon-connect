import { describe, expect, it } from "vitest";
import {
  acceptDraftUpdatedAt,
  enqueueDraftMutation,
  isValidDateOnly,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "@/shared/membership-application-validation";

describe("membership submission validation and draft version primitives", () => {
  it("normalizes supported phone formatting and rejects malformed values", () => {
    expect(normalizePhoneNumber(" +234 (801) 234-5678 ")).toBe("+2348012345678");
    expect(isValidPhoneNumber("+234 (801) 234-5678")).toBe(true);
    expect(isValidPhoneNumber("not a phone")).toBe(false);
  });

  it("validates date-only values exactly", () => {
    expect(isValidDateOnly("2024-02-29")).toBe(true);
    expect(isValidDateOnly("2024-02-30")).toBe(false);
    expect(isValidDateOnly("2024-2-09")).toBe(false);
  });

  it("does not replace a newer timestamp with an older in-flight response", () => {
    expect(acceptDraftUpdatedAt("photo-version", "before-photo", "autosave-old-version")).toBe(
      "photo-version",
    );
    expect(acceptDraftUpdatedAt("save-version", "save-version", "next-version")).toBe(
      "next-version",
    );
    expect(acceptDraftUpdatedAt(null, "before-reset", "obsolete-version")).toBeNull();
  });

  it("serializes photo registration after an in-flight autosave and before later saves", async () => {
    const queue = { current: Promise.resolve() };
    let completeAutosave!: () => void;
    const autosaveBarrier = new Promise<void>((resolve) => {
      completeAutosave = resolve;
    });
    const completed: string[] = [];
    const autosave = enqueueDraftMutation(queue, async () => {
      await autosaveBarrier;
      completed.push("autosave");
    });
    const photoRegistration = enqueueDraftMutation(queue, async () => {
      completed.push("photo");
    });
    const laterAutosave = enqueueDraftMutation(queue, async () => {
      completed.push("later-autosave");
    });

    await Promise.resolve();
    expect(completed).toEqual([]);
    completeAutosave();
    await Promise.all([autosave, photoRegistration, laterAutosave]);
    expect(completed).toEqual(["autosave", "photo", "later-autosave"]);
  });
});
