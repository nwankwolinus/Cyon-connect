/**
 * Lightweight secret detector used by `npm run secrets:scan` (fast local/CI first line).
 * Gitleaks (see .gitleaks.toml and CI) is the thorough scanner. Findings never include the secret value.
 */
export interface Finding {
  file: string;
  line: number;
  rule: string;
}

const PLACEHOLDER = /placeholder|your[-_ ]|example|changeme|xxxx|<[^>]+>|\.\.\./i;

const RULES: Array<{ rule: string; re: RegExp; allow?: RegExp }> = [
  { rule: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { rule: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { rule: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { rule: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    rule: "postgres-url-with-password",
    re: /postgres(?:ql)?:\/\/[^:\s/]+:([^@\s]{4,})@/,
    // Local development databases (Supabase CLI defaults) are not secrets.
    allow: /@(127\.0\.0\.1|localhost)(:|\/)/,
  },
  {
    rule: "service-role-assignment",
    re: /SERVICE_ROLE_KEY\s*[=:]\s*["']?(?!process\.env)([A-Za-z0-9._-]{20,})/,
  },
];

export function findSecrets(text: string, file: string): Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((lineText, i) => {
    for (const { rule, re, allow } of RULES) {
      const m = re.exec(lineText);
      if (m && !PLACEHOLDER.test(lineText) && !(allow && allow.test(lineText))) {
        findings.push({ file, line: i + 1, rule });
      }
    }
  });
  return findings;
}
