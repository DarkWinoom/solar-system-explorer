import { test, expect, type Page } from "playwright/test";

async function open(page: Page) {
  await page.goto("./");
  await expect(page.locator("#viewport")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#loading-state")).toBeHidden();
}

test("shows the year, advances the simulation, and returns to live time", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator(".topbar #advance-toggle")).toBeVisible();
  await expect(page.locator(".statusbar #advance-toggle")).toHaveCount(0);
  await expect(page.locator("#time-mode")).toHaveCount(0);
  await expect(page.locator("#local-time")).toContainText(
    String(new Date().getFullYear()),
  );
  for (const text of [
    "探索目的地",
    "一颗恒星，八大行星",
    "十个世界",
    "我们的宇宙邻里",
    "更多目的地",
  ]) {
    await expect(page.locator("body")).not.toContainText(text);
  }
  await page.locator("#advance-toggle").click();
  await expect(page.locator("#advance-toggle")).toHaveText("恢复实时");
  await expect(page.locator("#simulation-time")).toHaveAttribute(
    "datetime",
    /T/,
  );
  const first = Date.parse(
    (await page.locator("#simulation-time").getAttribute("datetime"))!,
  );
  await page.waitForTimeout(2000);
  const last = Date.parse(
    (await page.locator("#simulation-time").getAttribute("datetime"))!,
  );
  expect((last - first) / 86400000).toBeGreaterThan(40);
  expect((last - first) / 86400000).toBeLessThan(100);
  expect(
    Math.abs(
      Date.parse(
        (await page.locator("#local-time").getAttribute("datetime"))!,
      ) - Date.now(),
    ),
  ).toBeLessThan(3000);
  await page.locator("#advance-toggle").click();
  await expect(page.locator("#simulation-clock")).toBeHidden();
  await expect(page.locator("#advance-toggle")).toHaveText("模拟推进");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#advance-toggle").click();
  await expect(page.locator("#advance-toggle")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("starts live in overview, selects a sphere, and visits every body", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator(".nav-overview")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const instant = await page.locator("#local-time").getAttribute("datetime");
  expect(Math.abs(Date.parse(instant!) - Date.now())).toBeLessThan(3000);
  const canvas = page.locator("#viewport canvas"),
    bounds = await canvas.boundingBox();
  await canvas.click({
    position: { x: bounds!.width / 2, y: bounds!.height / 2 },
  });
  await expect(page.locator("#card-title")).toHaveText("太阳");
  for (const [id, name] of Object.entries({
    mercury: "水星",
    venus: "金星",
    earth: "地球",
    mars: "火星",
    jupiter: "木星",
    saturn: "土星",
    uranus: "天王星",
    neptune: "海王星",
    moon: "月球",
  })) {
    await page.locator(`.body-option[data-view="${id}"]`).click();
    await expect(page.locator("#card-title")).toHaveText(name);
    await expect(canvas).toHaveAttribute("data-view", id);
    await page.waitForTimeout(1300);
  }
  expect(errors).toEqual([]);
});

test("rapid switching, dragging, and closing details retain the selected target", async ({
  page,
}) => {
  await open(page);
  await page.locator('.body-option[data-view="saturn"]').click();
  await page.locator('.body-option[data-view="moon"]').click();
  await page.locator('.body-option[data-view="earth"]').click();
  await page.waitForTimeout(1400);
  const bounds = await page.locator("#viewport canvas").boundingBox();
  const x = bounds!.x + bounds!.width / 2,
    y = bounds!.y + bounds!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("#card-title")).toHaveText("地球");
  await page.keyboard.press("Escape");
  await expect(page.locator("#body-card")).toBeHidden();
  await expect(page.locator("#viewport canvas")).toHaveAttribute(
    "data-view",
    "earth",
  );
  await page.locator("#reopen").click();
  await expect(page.locator("#body-card")).toBeVisible();
  await page.locator(".back-overview").click();
  await expect(page.locator("#body-card")).toBeHidden();
});

test("language selection persists and a third language appears without changing menu code", async ({
  page,
}) => {
  await open(page);
  await page.locator("#language-trigger").click();
  await page
    .getByRole("menuitemradio", { name: "English", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#scene-title")).toHaveText("Our solar system");
  await page.reload();
  await expect(page.locator("#scene-title")).toHaveText("Our solar system");
  await page.evaluate(() =>
    window.appI18n.registerLocale(
      "ja-JP",
      { ui: { overview: "太陽系" } },
      { label: "日本語" },
    ),
  );
  await page.locator("#language-trigger").click();
  await page
    .getByRole("menuitemradio", { name: "日本語", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");
  await expect(page.locator(".nav-overview")).toContainText("太陽系");
  await expect(page.locator("#scene-title")).toHaveText("Our solar system");
  await page.locator("#language-trigger").click();
  await page
    .getByRole("menuitemradio", { name: "Follow system", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("custom music controls load audio only on request and support keyboard volume", async ({
  page,
}) => {
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/audio\/.*\.(ogg|mp3)(\?|$)/.test(request.url()))
      audioRequests.push(request.url());
  });
  await open(page);
  expect(audioRequests).toHaveLength(0);
  await page.locator("#audio-trigger").click();
  const slider = page.getByRole("slider", { name: "音量" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "5");
  await page.getByRole("button", { name: "播放音乐", exact: true }).click();
  await expect(page.locator("#audio-trigger")).toHaveClass(/is-playing/, {
    timeout: 15000,
  });
  expect(audioRequests.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "静音", exact: true }).click();
  await expect(page.locator("#audio-trigger")).not.toHaveClass(/is-playing/);
  expect(await page.locator("select,input,audio[controls]").count()).toBe(0);
});

test("off-screen arrows switch to their destinations", async ({ page }) => {
  await open(page);
  await page.locator('.body-option[data-view="earth"]').click();
  await page.waitForTimeout(1400);
  const arrow = page.locator(".direction:visible").first();
  const id = await arrow.getAttribute("data-direction");
  await arrow.click();
  await expect(page.locator("#viewport canvas")).toHaveAttribute(
    "data-view",
    id!,
  );
  await expect(page.locator(`.body-option[data-view="${id}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("mobile, tablet and desktop keep readable text and accessible card controls", async ({
  page,
}) => {
  await open(page);
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.body-option[data-view="earth"]').click();
    await page.waitForTimeout(1400);
    await expect(page.locator("#close-card")).toBeInViewport();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      smallText: [...document.querySelectorAll("body *")]
        .filter(
          (element) =>
            element.getClientRects().length &&
            [...element.childNodes].some(
              (node) => node.nodeType === 3 && node.textContent?.trim(),
            ) &&
            parseFloat(getComputedStyle(element).fontSize) < 14,
        )
        .map((element) => element.tagName),
    }));
    expect(layout).toEqual({ overflow: false, smallText: [] });
    await page.locator("#body-card").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.locator("#close-card")).toBeInViewport();
    await page.locator("#close-card").click();
    await expect(page.locator("#body-card")).toBeHidden();
    await page.locator(".nav-overview").click();
  }
});

test("a texture failure leaves navigation usable", async ({ page }) => {
  await page.route("**/textures/2k_mars.webp", (route) => route.abort());
  await open(page);
  await expect(page.locator("#scene-message")).toContainText("部分表面细节");
  await page.locator('.body-option[data-view="mars"]').click();
  await expect(page.locator("#card-title")).toHaveText("火星");
});

test("a graphics failure shows a localized reload action", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("./");
  await expect(page.locator("#scene-message")).toContainText("WebGL 2", {
    timeout: 15000,
  });
  await page.locator("#language-trigger").click();
  await page
    .getByRole("menuitemradio", { name: "English", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reload", exact: true }),
  ).toBeVisible();
});
