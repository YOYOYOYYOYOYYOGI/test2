import { strict as assert } from "node:assert";
import { launchBrowser, gameURL } from "./browser-env.mjs";

// End-to-end acceptance test: every transition is driven through rendered browser UI
// and real keyboard/camera movement, not a backdoor teleport or mocked game state.
const browser = await launchBrowser();
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 720, height: 500 },
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const position = () =>
    page
      .locator("#hud")
      .evaluate((el) => [
        Number(el.dataset.playerX),
        Number(el.dataset.playerZ),
      ]);
  async function walk(keys, [x, z], radius, limit = 85) {
    for (const key of keys) await page.keyboard.down(key);
    try {
      for (let i = 0; i < limit; i++) {
        await page.waitForTimeout(800);
        const [px, pz] = await position();
        if (Math.hypot(px - x, pz - z) < radius) return;
      }
      throw new Error(
        `Could not walk to ${x},${z}; last position ${await position()}`,
      );
    } finally {
      for (const key of [...keys].reverse()) await page.keyboard.up(key);
    }
  }
  async function face(yaw) {
    const canvas = page.locator("#world-canvas");
    const current = Number(await canvas.getAttribute("data-camera-yaw"));
    const rect = await canvas.boundingBox();
    assert.ok(rect);
    const fromX = rect.x + rect.width * 0.45,
      y = rect.y + rect.height * 0.52;
    const delta = (current - yaw) / (0.0042 * 0.7); // the default camera sensitivity
    await page.mouse.move(fromX, y);
    await page.mouse.down();
    await page.mouse.move(fromX + delta, y, { steps: 5 });
    await page.mouse.up();
    assert.ok(
      Math.abs(Number(await canvas.getAttribute("data-camera-yaw")) - yaw) <
        0.1,
    );
  }
  await page.goto(gameURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /begin your journey/i }).click();
  await page.getByRole("button", { name: /choose cinderkin/i }).click();
  await walk(["Shift", "a"], [-18, 12.5], 2.9, 40);
  await page.keyboard.press("e");
  await page.getByRole("button", { name: /accept the first light/i }).click();
  console.log("PASS: reached Orla physically and accepted The First Light");
  const [rx, rz] = await position();
  await face(-Math.atan2(-7 - rx, rz + 2));
  await walk(["Shift", "w"], [-7, -2], 2.1, 65);
  await page.keyboard.press("e");
  await page.getByRole("button", { name: /ember dash/i }).click();
  assert.ok(
    !(await page.locator(".combat-opponent .hp-caption").innerText()).includes(
      "53 / 53",
    ),
    "selected move must damage the wildling",
  );
  console.log(
    "PASS: entered wild encounter and resolved a move in the browser",
  );
  await page.getByRole("button", { name: /vials/i }).click();
  await page.evaluate(() => {
    Math.random = () => 0.999;
  }); // deterministic failed capture
  await page.getByRole("button", { name: /Wisp Vial/i }).click();
  assert.ok(
    (await page.locator(".combat-log").innerText()).includes("broke free"),
  );
  await page.evaluate(() => {
    Math.random = () => 0.01;
  }); // deterministic successful capture
  await page.getByRole("button", { name: /Lumen Vial/i }).click();
  assert.ok(
    (await page.locator(".battle-finale").innerText()).includes("CAPTURED"),
  );
  await page.getByRole("button", { name: /return to the vale/i }).click();
  console.log(
    "PASS: failed capture continues, successful capture adds a friend and consumes vials",
  );
  // Walk back using the same camera vector in reverse; no teleporting or scripted interaction.
  await walk(["Shift", "s"], [-18, 12.5], 2.8, 85);
  await page.keyboard.press("e");
  assert.ok(
    (await page.locator(".dialogue-box").innerText()).includes(
      "The valley knows your name",
    ),
  );
  await page.getByRole("button", { name: /continue exploring/i }).click();
  await page.getByRole("button", { name: /open journal/i }).click();
  assert.ok(
    (await page.locator(".reward-box").innerText()).includes("CLAIMED"),
  );
  await page.getByRole("button", { name: /close panel/i }).click();
  console.log(
    "PASS: walked back to Orla, completed quest, reward marked claimed",
  );
  const [tx, tz] = await position();
  await face(-Math.atan2(-2 - tx, tz + 18));
  await walk(["Shift", "w"], [-2, -18], 2.75, 100);
  await page.keyboard.press("e");
  await page.getByRole("button", { name: /challenge rowan/i }).click();
  await page.evaluate(() => {
    Math.random = () => 0.5;
  }); // stable damage, no critical hits
  for (
    let i = 0;
    i < 9 && !(await page.locator(".battle-finale").count());
    i++
  ) {
    await page.getByRole("button", { name: /ember dash/i }).click();
  }
  assert.ok((await page.locator(".battle-finale").innerText()).includes("WON"));
  await page.getByRole("button", { name: /return to the vale/i }).click();
  await page.getByRole("button", { name: /open companions/i }).click();
  assert.equal(await page.locator(".creature-row").count(), 2);
  await page.getByRole("button", { name: /close panel/i }).click();
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("vesperglen.save.v1")),
  );
  assert.equal(data.quest, "done");
  assert.equal(data.flags.trainerWon, true);
  assert.equal(data.party.length, 2);
  assert.ok(data.gold >= 270);
  assert.equal(data.bag.wispVial, 4); // one failed vial
  assert.equal(data.bag.lumenVial, 1); // one used and one trainer reward
  assert.deepEqual(errors, []);
  console.log(
    "PASS: trainer victory, XP, one-time reward, party, inventory, quest and save consistent",
  );
  console.log("PASS: no blocking browser errors throughout complete adventure");
} finally {
  await browser.close();
}
