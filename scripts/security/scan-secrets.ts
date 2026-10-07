/* Scans git-tracked and untracked-but-not-ignored files. Exit 1 on findings. Never prints values. */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { findSecrets, type Finding } from "./secret-patterns";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(
    (f) =>
      f &&
      f !== "package-lock.json" &&
      !f.startsWith("tests/") &&
      !f.endsWith("secret-patterns.ts"),
  );

const findings: Finding[] = [];
for (const f of files) {
  try {
    if (statSync(f).size > 1_000_000) continue;
    findings.push(...findSecrets(readFileSync(f, "utf8"), f));
  } catch {
    // unreadable or deleted file: skip
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found (values not shown):");
  for (const x of findings) console.error(`  ${x.file}:${x.line}  [${x.rule}]`);
  process.exit(1);
}
console.log(`secrets:scan OK (${files.length} files checked)`);
