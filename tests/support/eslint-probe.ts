import { ESLint, type Linter } from "eslint";

let eslint: ESLint | undefined;

/**
 * Lints `code` with the real project ESLint config as if it lived at
 * `filePath` (default: inside src/domain) and returns the messages from the
 * given architecture rules.
 */
export async function architectureViolations(
  code: string,
  filePath = "src/domain/__probe__.ts",
  rules: ReadonlySet<string> = ARCHITECTURE_RULES,
): Promise<Linter.LintMessage[]> {
  eslint ??= new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId && rules.has(m.ruleId));
}

export const ARCHITECTURE_RULES: ReadonlySet<string> = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "no-restricted-globals",
  "no-restricted-properties",
]);
