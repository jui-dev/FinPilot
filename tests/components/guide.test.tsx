import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  exampleAvailable,
  GUIDE_AVAILABLE_EXAMPLE,
  GUIDE_STEPS,
  GUIDE_WORDS,
} from "@/components/guide/content";
import { GuideHero, GuideSteps, GuideWhere, GuideWords } from "@/components/guide/guide-sections";
import { AvailableExample } from "@/components/guide/illustrations";
import {
  currentSection,
  GUIDE_PATH,
  menuTabCurrent,
  SECTIONS,
} from "@/components/shell/navigation";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const pages = SECTIONS.flatMap((s) => s.pages.map((p) => p.href));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);

/**
 * The Guide restates the product; it computes nothing of the person's. What
 * can drift is where it points, so every way out must be a page that exists.
 */
describe("the Guide", () => {
  it("sits outside the sections, with the Menu tab current on phones", () => {
    expect(GUIDE_PATH).toBe("/guide");
    expect(currentSection(GUIDE_PATH)).toBeUndefined();
    expect(menuTabCurrent(GUIDE_PATH)).toBe(true);
  });

  it("walks through six steps, each leading to a page in the navigation or to Quick Add", () => {
    expect(GUIDE_STEPS.map((s) => s.title)).toEqual([
      "Add your accounts",
      "Record as you go",
      "Verify a balance",
      "Add your commitments",
      "Set money aside",
      "Read Available",
    ]);
    for (const step of GUIDE_STEPS) {
      if ("href" in step.link.to) expect(pages).toContain(step.link.to.href);
      else expect(step.link.to.quickAdd).toBe(true);
    }
  });

  it("links only to pages that exist, and lists every page with its description", () => {
    const where = renderToStaticMarkup(<GuideWhere />);
    expect(hrefs(where).sort()).toEqual([...pages].sort());
    for (const section of SECTIONS) {
      for (const page of section.pages)
        expect(text(where)).toContain(`${page.label} · ${page.description}`);
    }
    const steps = renderToStaticMarkup(<GuideSteps />);
    for (const href of hrefs(steps)) {
      expect(href.startsWith("#step-") || pages.includes(href)).toBe(true);
    }
    // Quick Add opens in place: a button, not a link.
    expect(text(steps)).toContain("Open Quick Add");
    expect(steps).toMatch(/<button[^>]*>.*?Open Quick Add/);
  });

  it("anchors each step for the row of steps above them", () => {
    const steps = renderToStaticMarkup(<GuideSteps />);
    for (let n = 1; n <= GUIDE_STEPS.length; n++) {
      expect(steps).toContain(`id="step-${n}"`);
      expect(steps).toContain(`href="#step-${n}"`);
    }
  });

  it("states the four parts in order, Available last", () => {
    const hero = text(renderToStaticMarkup(<GuideHero />));
    expect(hero).toMatch(/How FinPilot works/);
    const order = ["Record", "Verify", "Understand", "Available"].map((w) =>
      hero.indexOf(` ${w} `),
    );
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
  });

  it("works its Available example out exactly, and says it is an example", () => {
    const e = GUIDE_AVAILABLE_EXAMPLE;
    expect(exampleAvailable()).toBe(e.inAccounts - e.owedOnCards - e.dueSoon - e.setAside);
    const shown = text(renderToStaticMarkup(<AvailableExample />));
    expect(shown).toContain("৳1,20,000");
    expect(shown).toContain("Available ৳44,500");
    expect(shown).toContain("An example, not your numbers.");
  });

  it("explains each word once", () => {
    const words = text(renderToStaticMarkup(<GuideWords />));
    expect(new Set(GUIDE_WORDS.map((w) => w.term)).size).toBe(GUIDE_WORDS.length);
    for (const word of GUIDE_WORDS) expect(words).toContain(word.term);
  });
});
