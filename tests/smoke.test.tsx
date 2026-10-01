import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SetupRequired } from "@/components/shell/setup-required";
import { HOME_PATH, SECTIONS, sectionHref } from "@/components/shell/navigation";

describe("smoke", () => {
  it("makes / home: the Overview, the first section", () => {
    expect(HOME_PATH).toBe("/");
    expect(sectionHref(SECTIONS[0]!)).toBe(HOME_PATH);
  });

  it("resolves the @/ alias and renders a page that needs no database", () => {
    expect(renderToStaticMarkup(<SetupRequired problem="no_database" />)).toContain(
      "npm run db:reset",
    );
  });
});
