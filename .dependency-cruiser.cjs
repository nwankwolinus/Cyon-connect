/**
 * Architecture rules (see docs/architecture/MODULE_GUIDE.md). Run with `npm run arch:check`.
 * Paths are relative to the repository root. Violations are errors and fail CI.
 *
 * Module layout:  modules/<name>/{domain,application,infrastructure,presentation}/ + composition.ts
 * Dependency flow: presentation -> application -> domain <- (ports) <- infrastructure; composition wires them.
 */
const FRAMEWORKS = "(^|/)node_modules/(next|react|react-dom|@supabase/[^/]+|server-only)(/|$)";
const ANY_LAYER_OF_ANY_MODULE = "^modules/[^/]+/(domain|application|infrastructure|presentation)/";
const COMPOSITION = "^modules/[^/]+/composition\\.ts$";
const SERVER_ONLY_FILES =
  "^infrastructure/supabase/(admin|server)\\.ts$|^infrastructure/config/server\\.ts$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-isolation",
      severity: "error",
      comment:
        "Domain code must not depend on application, infrastructure, presentation, app, composition or tooling.",
      from: { path: "^modules/[^/]+/domain/" },
      to: {
        path: `^modules/[^/]+/(application|infrastructure|presentation)/|${COMPOSITION}|^infrastructure/|^app/|^components/|^scripts/|^tests/`,
      },
    },
    {
      name: "domain-no-frameworks",
      severity: "error",
      comment: "Domain must not import Next.js, React, Supabase or server-only.",
      from: { path: "^modules/[^/]+/domain/" },
      to: { path: FRAMEWORKS },
    },
    {
      name: "application-isolation",
      severity: "error",
      comment:
        "Application depends on domain and ports only; never on infrastructure, presentation, app or composition.",
      from: { path: "^modules/[^/]+/application/" },
      to: {
        path: `^modules/[^/]+/(infrastructure|presentation)/|${COMPOSITION}|^infrastructure/|^app/|^components/|^scripts/|^tests/`,
      },
    },
    {
      name: "application-no-frameworks",
      severity: "error",
      comment: "Application must not import Next.js, React or Supabase.",
      from: { path: "^modules/[^/]+/application/" },
      to: { path: FRAMEWORKS },
    },
    {
      name: "presentation-isolation",
      severity: "error",
      comment:
        "Presentation talks to application only (plus shared and the browser-safe Supabase/public config).",
      from: { path: "^modules/[^/]+/presentation/" },
      to: {
        path: `^modules/[^/]+/(domain|infrastructure)/|${COMPOSITION}|^infrastructure/|^app/|(^|/)node_modules/@supabase/`,
        pathNot: "^infrastructure/(supabase/browser|config/public)\\.ts$",
      },
    },
    {
      name: "module-infrastructure-no-upward",
      severity: "error",
      comment:
        "Infrastructure adapters must not depend on presentation, composition, app or components.",
      from: { path: "^modules/[^/]+/infrastructure/" },
      to: { path: `^modules/[^/]+/presentation/|${COMPOSITION}|^app/|^components/` },
    },
    {
      name: "global-infrastructure-no-business",
      severity: "error",
      comment: "Global infrastructure/ must not know about business modules, routes or components.",
      from: { path: "^infrastructure/" },
      to: { path: "^(modules|app|components)/" },
    },
    {
      name: "shared-kernel-pure",
      severity: "error",
      comment:
        "shared/ is a small, pure kernel: no modules, infrastructure, app, components or frameworks.",
      from: { path: "^shared/" },
      to: { path: `^(modules|infrastructure|app|components|scripts)/|${FRAMEWORKS}` },
    },
    {
      name: "no-cross-module-internals",
      severity: "error",
      comment: "A module may not import another module's internals or composition root.",
      from: { path: "^modules/([^/]+)/" },
      to: { path: `${ANY_LAYER_OF_ANY_MODULE}|${COMPOSITION}`, pathNot: "^modules/$1/" },
    },
    {
      name: "app-via-module-entrypoints",
      severity: "error",
      comment:
        "Routes use a module's presentation or composition root, never its domain/application/infrastructure directly.",
      from: { path: "^app/" },
      to: { path: "^modules/[^/]+/(domain|application|infrastructure)/" },
    },
    {
      name: "privileged-clients-restricted",
      severity: "error",
      comment:
        "Service-role/server Supabase clients and server config may only be used by infrastructure adapters and composition roots.",
      from: {
        pathNot:
          "^(modules/[^/]+/(infrastructure/|composition\\.ts$)|infrastructure/|tests/|scripts/)",
      },
      to: { path: SERVER_ONLY_FILES },
    },
    {
      name: "no-server-clients-from-tsx",
      severity: "error",
      comment: "React component files (.tsx) must never import server-only clients/config.",
      from: { path: "\\.tsx$" },
      to: { path: SERVER_ONLY_FILES },
    },
    {
      name: "no-tests-in-production-code",
      severity: "error",
      from: { path: "^(app|modules|shared|infrastructure|components)/" },
      to: { path: "^tests/" },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    exclude: { path: "(^|/)(\\.next|coverage)/" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
