import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const boundaryRules = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "MemberExpression[object.name='process'][property.name='env']",
      message: "Environment variables are read only in infrastructure/ (domain, application and shared must not).",
    },
  ],
  "no-restricted-globals": ["error", "window", "document", "localStorage", "sessionStorage", "navigator"],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        { group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*", "@supabase/*", "server-only"], message: "Domain/application/shared code must not import frameworks or Supabase (see docs/architecture/MODULE_GUIDE.md)." },
        { group: ["@/infrastructure/*", "@/app/*"], message: "Domain/application/shared code must not import infrastructure or app code." },
      ],
    },
  ],
};

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Fast editor feedback; dependency-cruiser (npm run arch:check) is the authoritative gate.
  { files: ["modules/*/domain/**/*.ts", "modules/*/application/**/*.ts", "shared/**/*.ts"], rules: boundaryRules },
];

export default config;
