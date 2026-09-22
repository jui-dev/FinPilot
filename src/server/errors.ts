/**
 * Service error model.
 *
 * - LedgerRuleError: a business rejection (future date, wrong category kind, …).
 *   Thrown inside a repository write script so the whole transaction rolls back;
 *   services turn it into a failed ServiceResult.
 * - LedgerIntegrityError: a database constraint fired. The domain rules should
 *   have prevented it, so it indicates a bug and is thrown, never returned.
 */
export class LedgerRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LedgerRuleError";
  }
}

export class LedgerIntegrityError extends Error {
  constructor(
    readonly sqliteCode: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LedgerIntegrityError";
  }
}

export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export const succeeded = <T>(value: T): ServiceResult<T> => ({ ok: true, value });

/** Finds a SQLite constraint error, including one wrapped by Drizzle as `cause`. */
function sqliteConstraint(error: unknown): { code: string; message: string } | undefined {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) {
      return { code, message: (e as Error).message };
    }
  }
  return undefined;
}

/** Runs a synchronous repository script and maps its outcome to a ServiceResult. */
export function runScript<T>(script: () => T): ServiceResult<T> {
  try {
    return succeeded(script());
  } catch (error) {
    if (error instanceof LedgerRuleError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    const constraint = sqliteConstraint(error);
    if (constraint) {
      throw new LedgerIntegrityError(constraint.code, constraint.message, { cause: error });
    }
    throw error;
  }
}
