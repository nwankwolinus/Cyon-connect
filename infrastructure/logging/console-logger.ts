import { type Logger, type LogFields, redact } from "@/shared/logging/logger";

type Level = "debug" | "info" | "warn" | "error";

/** Structured JSON-line logger with automatic redaction. Base fields (e.g. correlationId) are merged in. */
export function createConsoleLogger(base: LogFields = {}): Logger {
  const write = (level: Level, message: string, fields: LogFields = {}) => {
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...(redact({ ...base, ...fields }) as LogFields),
    });
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
  };
}
