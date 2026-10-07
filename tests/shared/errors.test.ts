import { describe, expect, it } from "vitest";
import { AppError, ERROR_CATEGORIES, toPublicError } from "@/shared/errors/app-error";
import { errorResponse, httpStatusFor } from "@/shared/http/error-response";

describe("error conventions", () => {
  it("passes through AppError public messages", () => {
    expect(toPublicError(new AppError("authorization", "Not allowed."))).toEqual({
      category: "authorization",
      message: "Not allowed.",
    });
  });

  it("hides internal error detail", () => {
    const out = toPublicError(new Error("connection string postgres://user:pw@host/db"));
    expect(out).toEqual({ category: "internal", message: "Something went wrong." });
  });

  it("maps every category to a distinct sensible HTTP status", () => {
    const statuses = ERROR_CATEGORIES.map(httpStatusFor);
    expect(new Set(statuses).size).toBe(ERROR_CATEGORIES.length);
    expect(httpStatusFor("authentication")).toBe(401);
    expect(httpStatusFor("authorization")).toBe(403);
    expect(httpStatusFor("infrastructure")).toBe(503);
  });

  it("error responses carry correlation id and never leak cause or details", async () => {
    const err = new AppError("infrastructure", "Service unavailable.", {
      cause: new Error("password=hunter2 host=db.internal"),
      details: { sql: "select * from secrets" },
    });
    const res = errorResponse(err, "corr-12345678");
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(res.headers.get("x-correlation-id")).toBe("corr-12345678");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(text).not.toMatch(/hunter2|db\.internal|select/);
  });
});
