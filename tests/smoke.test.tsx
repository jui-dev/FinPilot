import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import Root from "@/app/page";
import { SetupRequired } from "@/components/shell/setup-required";
import { HOME_PATH } from "@/components/shell/navigation";

const redirects: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirects.push(path);
  },
}));

describe("smoke", () => {
  it("sends / to the current home destination (the Overview takes over in Stage 10)", () => {
    Root();
    expect(redirects).toEqual([HOME_PATH]);
  });

  it("resolves the @/ alias and renders a page that needs no database", () => {
    expect(renderToStaticMarkup(<SetupRequired problem="no_database" />)).toContain(
      "npm run db:reset",
    );
  });
});
