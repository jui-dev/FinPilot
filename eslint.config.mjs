import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * src/domain is the framework-free, deterministic financial core
 * (docs/tech-stack.md §1). Two protections apply to it:
 *
 * 1. Import boundary — only other domain modules and approved pure libraries.
 *    Anything else (Next.js, React, persistence, Node built-ins, outer layers,
 *    or any newly added package) is rejected by default.
 * 2. Determinism — no ambient current time or randomness. "Today" comes from
 *    the injected Clock; deterministic date construction from explicit values
 *    (new Date(x), Date.UTC, Date.parse, pure date-fns functions) stays allowed.
 *
 * Inline eslint-disable comments are ignored inside src/domain: an exception
 * requires a change to this file, not a local suppression.
 */
const DOMAIN_ALLOWED_PACKAGES = ["zod", "date-fns"];

/** date-fns functions that read the current time (derived from date-fns 4.4.0 source). */
const DATE_FNS_NOW_DEPENDENT = [
  "constructNow",
  "endOfToday",
  "endOfTomorrow",
  "endOfYesterday",
  "formatDistanceToNow",
  "formatDistanceToNowStrict",
  "isFuture",
  "isPast",
  "isThisHour",
  "isThisISOWeek",
  "isThisMinute",
  "isThisMonth",
  "isThisQuarter",
  "isThisSecond",
  "isThisWeek",
  "isThisYear",
  "isToday",
  "isTomorrow",
  "isYesterday",
  "startOfToday",
  "startOfTomorrow",
  "startOfYesterday",
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const allowedPackages = DOMAIN_ALLOWED_PACKAGES.map(escapeRegex).join("|");

const DOMAIN_BOUNDARY_MESSAGE =
  "src/domain must stay framework-free: import only './…' modules, '@/domain/…', " +
  `or approved pure libraries (${DOMAIN_ALLOWED_PACKAGES.join(", ")}). See docs/tech-stack.md §1.`;

const AMBIENT_MESSAGE =
  "src/domain must be deterministic: take 'today' from the injected Clock and never read " +
  "ambient time or randomness. Constructing dates from explicit values is fine.";

const domainRules = {
  files: ["src/domain/**/*.{ts,tsx}"],
  linterOptions: {
    noInlineConfig: true,
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "date-fns",
            importNames: DATE_FNS_NOW_DEPENDENT,
            message: AMBIENT_MESSAGE,
          },
        ],
        patterns: [
          {
            // Allowlist: same-or-child relative paths, the @/domain alias, approved packages.
            regex: `^(?!\\./|@/domain(/|$)|(${allowedPackages})(/|$))`,
            message: DOMAIN_BOUNDARY_MESSAGE,
          },
          {
            regex: `^date-fns/(fp/)?(${DATE_FNS_NOW_DEPENDENT.join("|")})$`,
            message: AMBIENT_MESSAGE,
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      { name: "crypto", message: AMBIENT_MESSAGE },
      { name: "performance", message: AMBIENT_MESSAGE },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "ImportExpression",
        message: `Dynamic import() is not allowed in src/domain. ${DOMAIN_BOUNDARY_MESSAGE}`,
      },
      {
        selector: "CallExpression[callee.name='require']",
        message: `require() is not allowed in src/domain. ${DOMAIN_BOUNDARY_MESSAGE}`,
      },
      {
        selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
        message: AMBIENT_MESSAGE,
      },
      {
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
        message: AMBIENT_MESSAGE,
      },
      {
        selector: "CallExpression[callee.name='Date']",
        message: AMBIENT_MESSAGE,
      },
      {
        selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
        message: AMBIENT_MESSAGE,
      },
      {
        selector: "MemberExpression[object.name='Temporal'][property.name='Now']",
        message: AMBIENT_MESSAGE,
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  domainRules,
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
