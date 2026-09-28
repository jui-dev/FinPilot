import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SetupRequired } from "@/components/shell/setup-required";
import { HOME_PATH, PRIMARY_NAV } from "@/components/shell/navigation";

describe("smoke", () => {
  it("makes / home (Attention, and later the Overview) without making it a destination", () => {
    expect(HOME_PATH).toBe("/");
    expect(PRIMARY_NAV.map((i) => i.href)).not.toContain("/");
  });

  it("resolves the @/ alias and renders a page that needs no database", () => {
    expect(renderToStaticMarkup(<SetupRequired problem="no_database" />)).toContain(
      "npm run db:reset",
    );
  });
});
