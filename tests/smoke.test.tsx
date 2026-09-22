import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("smoke", () => {
  it("resolves the @/ alias and renders the placeholder page", () => {
    expect(renderToStaticMarkup(<Home />)).toContain("FinPilot");
  });
});
