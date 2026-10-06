import { describe, expect, it } from "vitest";
import { AppError, toPublicError } from "@/lib/errors";

describe("error conventions", () => {
  it("passes through AppError public messages", () => {
    expect(toPublicError(new AppError("FORBIDDEN", "Not allowed."))).toEqual({
      code: "FORBIDDEN",
      message: "Not allowed.",
    });
  });

  it("hides internal error detail", () => {
    const out = toPublicError(new Error("connection string postgres://user:pw@host/db"));
    expect(out.message).toBe("Something went wrong.");
  });
});
