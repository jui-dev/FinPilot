// Captures the README screenshots (docs/screenshots) from a production server on port 3100
// started with a fresh demo database: DATABASE_PATH=./data/shots.sqlite npm run db:reset,
// npm run build, DATABASE_PATH=./data/shots.sqlite npx next start --port 3100.
// Usage: node scripts/readme-screenshots.mjs [name ...]
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3100";
const OUT = "docs/screenshots";
const only = process.argv.slice(2);

const browser = await chromium.launch();

async function shot(name, { path, width = 1280, height = 800, scale = 1.5, act, full = false }) {
  if (only.length && !only.includes(name)) return;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "*{caret-color:transparent!important}" });
  if (act) await act(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await page.close();
  console.log("saved", name);
}

await shot("overview", { path: "/" });
await shot("available", { path: "/available" });
await shot("cash-flow", { path: "/cash-flow" });
await shot("activity", {
  path: "/activity",
  act: async (page) => {
    await page.locator('main a[href*="tx="]').nth(1).click();
    await page.getByRole("dialog").waitFor();
  },
});
await shot("quick-add", {
  path: "/",
  act: async (page) => {
    await page.getByRole("button", { name: /^Add/ }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.type("1250");
  },
});
await shot("accounts", { path: "/accounts" });
await shot("commitments", { path: "/commitments" });
await shot("set-aside", { path: "/set-aside" });
await shot("trends", { path: "/trends" });
await shot("calendar", { path: "/calendar" });
await shot("phone-overview", { path: "/", width: 390, height: 844, scale: 2 });
await shot("phone-available", { path: "/available", width: 390, height: 844, scale: 2 });
await shot("phone-quick-add", {
  path: "/activity",
  width: 390,
  height: 844,
  scale: 2,
  act: async (page) => {
    await page.getByRole("button", { name: /^Add/ }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.type("450");
  },
});

await browser.close();
