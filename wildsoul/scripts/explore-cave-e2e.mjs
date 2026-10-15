import { strict as assert } from "node:assert";
import { launchBrowser, gameURL } from "./browser-env.mjs";

// Proves the bridge and marked forest trail actually connect to a usable cave.
// All position changes come from camera rotation and physical keyboard movement.
const browser = await launchBrowser();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 500 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const position = () =>
    page
      .locator("#hud")
      .evaluate((el) => [
        Number(el.dataset.playerX),
        Number(el.dataset.playerZ),
      ]);
  async function face(x, z) {
    const [px, pz] = await position();
    const yaw = -Math.atan2(x - px, pz - z);
    const canvas = page.locator("#world-canvas");
    const current = Number(await canvas.getAttribute("data-camera-yaw"));
    const rect = await canvas.boundingBox();
    assert.ok(rect);
    const mx = rect.x + rect.width * 0.45;
    const my = rect.y + rect.height * 0.52;
    await page.mouse.move(mx, my);
    await page.mouse.down();
    await page.mouse.move(mx + (current - yaw) / (0.0042 * 0.7), my, {
      steps: 5,
    });
    await page.mouse.up();
    assert.ok(
      Math.abs(Number(await canvas.getAttribute("data-camera-yaw")) - yaw) <
        0.1,
    );
  }
  async function walk(x, z, radius) {
    await face(x, z);
    await page.keyboard.down("Shift");
    await page.keyboard.down("w");
    let lastDistance = Infinity;
    let stalls = 0;
    try {
      for (let tick = 0; tick < 65; tick++) {
        await page.waitForTimeout(650);
        const [px, pz] = await position();
        const distance = Math.hypot(x - px, z - pz);
        if (distance < radius) return;
        stalls = Math.abs(distance - lastDistance) < 0.05 ? stalls + 1 : 0;
        lastDistance = distance;
        if (stalls >= 8) break;
      }
      throw new Error(
        `Forest trail blocked on way to ${x},${z} at ${await position()}`,
      );
    } finally {
      await page.keyboard.up("w");
      await page.keyboard.up("Shift");
    }
  }
  await page.goto(gameURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /begin your journey/i }).click();
  await page.getByRole("button", { name: /choose tidewisp/i }).click();
  for (const [x, z, radius] of [
    [3, -5, 2],
    [8, -7, 2],
    [15, -7, 2],
    [19, -8, 1.6],
    [24, -15, 1.3],
    [24, -21, 1],
    [28, -23, 1.6],
  ]) {
    await walk(x, z, radius);
    console.log(`Walked to ${x},${z}: ${await position()}`);
  }
  assert.match(await page.locator("#region-label").innerText(), /ECHO CAVE/);
  await page.getByRole("button", { name: /explore echo cave/i }).waitFor();
  if (process.env.CAPTURE_CAVE_SCREENSHOT) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: "store/cave-exploration.png" });
  }
  await page.getByRole("button", { name: /explore echo cave/i }).click();
  assert.match(
    await page.locator(".dialogue-box").innerText(),
    /A PLACE BETWEEN ROOTS/,
  );
  await page.getByRole("button", { name: /continue exploring/i }).click();
  assert.ok(
    (
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("vesperglen.save.v1")),
      )
    ).visited.includes("cave"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: crossed bridge, followed open forest trail into Echo Cave, interacted, saved discovery; no browser errors",
  );
} finally {
  await browser.close();
}
