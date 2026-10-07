/* After `next build`: fail if the browser bundle contains privileged credentials. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(".next/static");
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|css|map|html|json)$/.test(n)) out.push(p);
  }
  return out;
}

let files: string[];
try {
  files = walk(dir);
} catch {
  console.error("No .next/static directory. Run `npm run build` first.");
  process.exit(2);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const problems: string[] = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (text.includes("SUPABASE_SERVICE_ROLE_KEY"))
    problems.push(`${f}: references SUPABASE_SERVICE_ROLE_KEY`);
  if (serviceKey && serviceKey.length > 8 && text.includes(serviceKey))
    problems.push(`${f}: contains the service-role key value`);
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role === "service_role") problems.push(`${f}: contains a service_role JWT`);
    } catch {
      // not a decodable JWT payload
    }
  }
}

if (problems.length > 0) {
  console.error("Client bundle leak detected:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`security:bundle-scan OK (${files.length} client files checked)`);
