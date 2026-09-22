import { describe, expect, it } from "vitest";

import { entityId, isEntityId } from "@/domain/ids";
import { uuidV7Generator } from "@/server/ids";

describe("IDs", () => {
  it("generates canonical lowercase UUIDv7 values", () => {
    const id = uuidV7Generator.next();
    expect(isEntityId(id)).toBe(true);
    expect(id[14]).toBe("7");
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidV7Generator.next()));
    expect(ids.size).toBe(10_000);
  });

  it.each([
    "01a0c8b7-cf15-4609-9dd1-ad0e99972688", // v4
    "01A0C8B7-CF15-7609-9DD1-AD0E99972688", // uppercase
    "01a0c8b7-cf15-7609-cdd1-ad0e99972688", // wrong variant
    "not-an-id",
  ])("rejects %s", (value) => {
    expect(isEntityId(value)).toBe(false);
    expect(() => entityId(value)).toThrow(RangeError);
  });

  // Deliberately no ordering assertions: IDs are opaque and never a business
  // ordering of financial records (docs/domain-model.md §2).
});
