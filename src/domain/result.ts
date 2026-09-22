/** Outcome of parsing untrusted input. Parsers return this instead of throwing. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const parsed = <T>(value: T): ParseResult<T> => ({ ok: true, value });

export const parseError = <T>(error: string): ParseResult<T> => ({ ok: false, error });
