import { v7 } from "uuid";

import { entityId, type IdGenerator } from "@/domain/ids";

/** Production IdGenerator: RFC 9562 UUIDv7 from the `uuid` package. */
export const uuidV7Generator: IdGenerator = {
  next: () => entityId(v7()),
};
