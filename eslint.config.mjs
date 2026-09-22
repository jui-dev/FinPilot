import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * src/domain is the framework-free financial core (docs/tech-stack.md §1).
 * It may import only other domain modules and approved pure libraries.
 * Anything else (Next.js, React, persistence, Node built-ins, outer layers,
 * or any newly added package) is rejected by default.
 */
const DOMAIN_ALLOWED_PACKAGES = ["zod", "date-fns", "@date-fns/tz"];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const allowedPackages = DOMAIN_ALLOWED_PACKAGES.map(escapeRegex).join("|");

const DOMAIN_BOUNDARY_MESSAGE =
  "src/domain must stay framework-free: import only './…' modules, '@/domain/…', " +
  `or approved pure libraries (${DOMAIN_ALLOWED_PACKAGES.join(", ")}). See docs/tech-stack.md §1.`;

const domainBoundary = {
  files: ["src/domain/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // Allowlist: same-or-child relative paths, the @/domain alias, approved packages.
            regex: `^(?!\\./|@/domain(/|$)|(${allowedPackages})(/|$))`,
            message: DOMAIN_BOUNDARY_MESSAGE,
          },
        ],
      },
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
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  domainBoundary,
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
