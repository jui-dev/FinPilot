/**
 * Entity identifiers: canonical lowercase UUIDv7 strings.
 *
 * IDs are opaque. UUIDv7's embedded timestamp gives good index locality, but
 * it is NOT a business ordering: financial records are never ordered by
 * comparing IDs. Where FinPilot needs an order (e.g. transactions on the same
 * date) it is modelled explicitly (docs/domain-model.md §2).
 *
 * The domain only knows the IdGenerator abstraction; the implementation is
 * injected from outside the domain (src/server/ids.ts).
 */
declare const entityIdBrand: unique symbol;
export type EntityId = string & { readonly [entityIdBrand]: true };

export interface IdGenerator {
  next(): EntityId;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isEntityId = (value: string): value is EntityId => UUID_V7.test(value);

export function entityId(value: string): EntityId {
  if (!isEntityId(value)) throw new RangeError(`"${value}" is not a canonical lowercase UUIDv7`);
  return value;
}
