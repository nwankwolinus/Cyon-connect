import { NextResponse } from "next/server";

// Liveness probe only. Reveals no configuration or secrets.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
