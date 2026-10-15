import { strict as assert } from "node:assert";
import { launchBrowser, gameURL } from "./browser-env.mjs";

const url = gameURL;
const browser = await launchBrowser();
const issues = [];
const watch = (page) => {
  page.on("pageerror", (e) => issues.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") issues.push(`console: ${m.text()}`);
  });
};
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 640 },
  });
  watch(page);
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  assert.equal(response?.status(), 200, "static build must load");
  await page.getByRole("button", { name: /begin your journey/i }).waitFor();
  assert.equal(
    await page
      .locator("#world-canvas")
      .evaluate((canvas) => !!canvas.getContext("webgl2")),
    true,
    "WebGL2 renderer must initialize",
  );
  results.push("Browser build and actual WebGL2 canvas load");
  await page.getByRole("button", { name: /begin your journey/i }).click();
  await page.getByRole("button", { name: /choose bristlebloom/i }).click();
  assert.equal(await page.locator("#hud").isVisible(), true);
  assert.equal(
    await page
      .locator("#hud-currency")
      .innerText()
      .then((t) => t.includes("90")),
    true,
  );
  results.push("Starter selection enters explorable 3D world");
  const beforeX = Number(
    await page.locator("#hud").getAttribute("data-player-x"),
  );
  await page.keyboard.down("d");
  try {
    await page.waitForFunction(
      (x) =>
        Number(document.querySelector("#hud")?.getAttribute("data-player-x")) >
        x + 0.08,
      beforeX,
      { timeout: 24000 },
    );
  } finally {
    await page.keyboard.up("d");
  }
  results.push("D key physically moves the player across the terrain");
  const canvas = page.locator("#world-canvas");
  const yaw = Number(await canvas.getAttribute("data-camera-yaw"));
  const area = await canvas.boundingBox();
  assert.ok(area);
  await page.mouse.move(area.x + 390, area.y + 320);
  await page.mouse.down();
  await page.mouse.move(area.x + 490, area.y + 340, { steps: 4 });
  await page.mouse.up();
  assert.ok(
    Math.abs(Number(await canvas.getAttribute("data-camera-yaw")) - yaw) > 0.1,
    "drag changes camera yaw",
  );
  results.push("Pointer drag rotates the follow camera");
  await page.getByRole("button", { name: /open companions/i }).click();
  await page.getByRole("heading", { name: /the companions/i }).waitFor();
  await page.getByRole("button", { name: /field guide/i }).click();
  assert.ok((await page.locator(".field-card").count()) >= 1);
  await page.getByRole("button", { name: /close panel/i }).click();
  await page.getByRole("button", { name: /open bag/i }).click();
  assert.ok((await page.getByText("Wisp Vial").count()) > 0);
  await page.getByRole("button", { name: /close panel/i }).click();
  await page.getByRole("button", { name: /open journal/i }).click();
  assert.ok((await page.getByText("The First Light").count()) > 0);
  await page.getByRole("button", { name: /close panel/i }).click();
  results.push(
    "Companions, field guide, bag and quest journal render interactive UI",
  );
  await page.getByRole("button", { name: /pause menu/i }).click();
  await page.getByRole("button", { name: /save journey now/i }).click();
  const saved = await page.evaluate(() =>
    localStorage.getItem("vesperglen.save.v1"),
  );
  assert.ok(saved && JSON.parse(saved).party[0].speciesId === "bristlebloom");
  await page.getByRole("button", { name: /save & return to title/i }).click();
  await page.getByRole("button", { name: /continue journey/i }).click();
  assert.equal(await page.locator("#hud").isVisible(), true);
  results.push("Save → title → continue restores the playable journey");

  const mobile = await browser.newPage({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  watch(mobile);
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  await mobile.getByRole("button", { name: /begin your journey/i }).click();
  await mobile.getByRole("button", { name: /choose tidewisp/i }).click();
  assert.equal(await mobile.locator("#joystick").isVisible(), true);
  assert.equal(
    await mobile.getByRole("button", { name: /interact/i }).isVisible(),
    true,
  );
  await mobile.getByRole("button", { name: /open companions/i }).click();
  assert.equal(await mobile.locator(".panel").isVisible(), true);
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    true,
    "no horizontal overflow",
  );
  results.push(
    "Touch-sized joystick/action buttons and mobile collection panel fit phone viewport",
  );
  assert.deepEqual(issues, [], "no blocking browser console/page errors");
  results.push("No blocking page errors or console errors in tested flows");
  console.log(results.map((r, i) => `PASS ${i + 1}: ${r}`).join("\n"));
} finally {
  await browser.close();
}
