import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __FARKLE_FAST: boolean; __FARKLE_QUEUE: number[] };
    w.__FARKLE_FAST = true;
    w.__FARKLE_QUEUE = [];
  });
});

async function queue(page: Page, faces: number[]): Promise<void> {
  await page.evaluate((next) => {
    const w = window as unknown as { __FARKLE_QUEUE: number[] };
    w.__FARKLE_QUEUE.push(...next);
  }, faces);
}

async function startMatch(page: Page, playerNames: string[]): Promise<void> {
  await page.goto("/");
  for (let i = 2; i < playerNames.length; i += 1) {
    await page.getByTestId("add-player").click();
  }
  for (let i = 0; i < playerNames.length; i += 1) {
    await page.getByTestId("player-name").nth(i).fill(playerNames[i]);
  }
  await page.getByTestId("start-game").click();
  await queue(page, playerNames.map((_, index) => (index === 0 ? 6 : 1)));
  await page.getByTestId("roll-off-button").click();
  await expect(page.getByTestId("roll-off-result")).toContainText(`${playerNames[0]} rolled the high die`);
  await page.getByTestId("begin-play").click();
  await expect(page.getByTestId("current-player")).toContainText(playerNames[0]);
}

async function waitSelect(page: Page): Promise<void> {
  await expect(page.locator("main")).toHaveAttribute("data-phase", "select");
  await expect(page.locator("main")).toHaveAttribute("data-rolling", "false");
}

async function selectAll(page: Page): Promise<void> {
  const dice = page.getByTestId("dice-tray").getByTestId("die");
  const count = await dice.count();
  for (let i = 0; i < count; i += 1) await dice.nth(i).click();
}

test("setup requires a name for every player", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("setup-error")).toContainText("name");
  await page.getByTestId("add-player").click();
  await expect(page.getByTestId("player-name")).toHaveCount(3);
});

test("highlights scoring dice, commits on roll or bank, and shakes on a Farkle", async ({ page }) => {
  await startMatch(page, ["Ada", "Bo"]);

  await queue(page, [1, 1, 1, 2, 3, 4]);
  await page.getByTestId("roll-button").click();
  await waitSelect(page);

  const tray = page.getByTestId("dice-tray");
  await expect(tray.getByTestId("die")).toHaveCount(6);
  await expect(tray.locator("[data-hint='true']")).toHaveCount(3);
  await expect(tray.locator("[data-selected='true']")).toHaveCount(0);
  await expect(tray.locator("[data-value='2']")).toHaveAttribute("data-hint", "false");
  await expect(page.getByTestId("turn-score")).toHaveText("0");
  await expect(page.getByTestId("select-scoring")).toBeEnabled();
  await page.screenshot({ path: "/tmp/farkle-shots/hints.png" });

  await tray.locator("[data-value='1']").first().click();
  await tray.locator("[data-value='2']").click();
  await expect(page.getByTestId("selection-points")).toContainText("doesn't score");
  await expect(page.getByTestId("roll-button")).toBeDisabled();
  await expect(page.getByTestId("bank-button")).toBeDisabled();
  await expect(page.getByTestId("turn-score")).toHaveText("0");
  await tray.locator("[data-selected='true']").nth(0).click();
  await tray.locator("[data-selected='true']").nth(0).click();

  await page.getByTestId("select-scoring").click();
  await expect(tray.locator("[data-selected='true']")).toHaveCount(3);
  await expect(page.getByTestId("selection-points")).toContainText("Worth 300");
  await expect(page.getByTestId("select-scoring")).toBeDisabled();
  await expect(page.getByTestId("turn-score")).toHaveText("0");
  await expect(page.getByTestId("commit-note")).toBeVisible();
  await page.screenshot({ path: "/tmp/farkle-shots/selected.png" });

  await tray.locator("[data-selected='true']").nth(2).click();
  await tray.locator("[data-selected='true']").nth(1).click();
  await expect(tray.locator("[data-selected='true']")).toHaveCount(1);
  await expect(page.getByTestId("selection-points")).toContainText("Worth 100");
  await expect(page.getByTestId("bank-button")).toBeDisabled();
  await expect(page.getByTestId("select-scoring")).toBeEnabled();

  await queue(page, [5, 2, 3, 4, 6]);
  await page.getByTestId("roll-button").click();
  await waitSelect(page);
  await expect(page.getByTestId("turn-score")).toHaveText("100");
  await expect(page.getByTestId("held-die")).toHaveAttribute("data-value", "1");

  await tray.locator("[data-value='5']").click();
  await expect(page.getByTestId("selection-points")).toContainText("Worth 50");
  await expect(page.getByTestId("turn-score")).toHaveText("100");
  await expect(page.getByTestId("bank-button")).toBeDisabled();
  await expect(page.getByTestId("bank-reason")).toContainText("500");

  await queue(page, [1, 1, 1, 1]);
  await page.getByTestId("roll-button").click();
  await waitSelect(page);
  await expect(page.getByTestId("turn-score")).toHaveText("150");
  const ones = tray.locator("[data-value='1']");
  await expect(ones).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) await ones.nth(i).click();
  await expect(page.getByTestId("selection-points")).toContainText("1,000");
  await expect(page.getByTestId("turn-score")).toHaveText("150");
  await expect(page.getByTestId("bank-button")).toContainText("1,150");
  await page.getByTestId("bank-button").click();

  await expect(page.locator("[data-name='Ada'] [data-testid='score-value']")).toHaveText("1,150");
  await expect(page.getByTestId("current-player")).toContainText("Bo");
  await page.screenshot({ path: "/tmp/farkle-shots/banked.png" });

  await queue(page, [2, 3, 4, 6, 2, 3]);
  await page.getByTestId("roll-button").click();
  const overlay = page.getByTestId("farkle-overlay");
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId("farkle-word")).toHaveText("FARKLE");
  const viewport = page.viewportSize();
  const overlayBox = await overlay.boundingBox();
  const wordBox = await page.getByTestId("farkle-word").boundingBox();
  expect(viewport).not.toBeNull();
  expect(overlayBox!.width).toBeGreaterThan(viewport!.width * 0.95);
  expect(overlayBox!.height).toBeGreaterThan(viewport!.height * 0.95);
  expect(wordBox!.width).toBeGreaterThan(viewport!.width * 0.5);
  const animation = await page.getByTestId("farkle-shake").evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toContain("farkle-shake");
  await expect(page.locator("[data-name='Bo'] [data-testid='score-value']")).toHaveText("0");
  await expect(page.locator("[data-name='Ada'] [data-testid='score-value']")).toHaveText("1,150");
  await page.screenshot({ path: "/tmp/farkle-shots/farkle.png" });
  await page.getByTestId("farkle-continue").click();
  await expect(page.getByTestId("current-player")).toContainText("Ada");

  await page.getByTestId("rules-button").click();
  const modal = page.getByTestId("rules-modal");
  await expect(modal).toBeVisible();
  for (const text of ["Single 1", "100", "Three 6s", "600", "Four of a kind", "1,000", "2,000", "3,000", "Straight 1–6", "Three pairs", "1,500", "Four of a kind with a pair", "Two triplets", "2,500", "Hot dice", "10,000", "500"]) {
    await expect(modal).toContainText(text);
  }
  await page.screenshot({ path: "/tmp/farkle-shots/rules.png" });
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("hot dice keeps the turn score and 10000 starts the last round", async ({ page }) => {
  await startMatch(page, ["Ada", "Bo"]);
  await queue(page, [1, 1, 1, 1, 1, 1]);
  await page.getByTestId("roll-button").click();
  await waitSelect(page);
  await selectAll(page);
  await expect(page.getByTestId("selection-points")).toContainText("3,000");
  await expect(page.getByTestId("turn-score")).toHaveText("0");

  for (let wave = 0; wave < 3; wave += 1) {
    await queue(page, [1, 1, 1, 1, 1, 1]);
    await page.getByTestId("roll-button").click();
    await waitSelect(page);
    await expect(page.getByTestId("hot-dice")).toBeVisible();
    await expect(page.getByTestId("turn-score")).toHaveText((3000 * (wave + 1)).toLocaleString("en-US"));
    await selectAll(page);
  }

  await expect(page.getByTestId("bank-button")).toContainText("12,000");
  await page.screenshot({ path: "/tmp/farkle-shots/hot-dice.png" });
  await page.getByTestId("bank-button").click();
  await expect(page.getByTestId("last-round")).toContainText("10,000");
  await expect(page.getByTestId("last-round")).toContainText("one last turn");
  await expect(page.getByTestId("current-player")).toContainText("Bo");
  await expect(page.locator("[data-name='Ada'] [data-testid='score-value']")).toHaveText("12,000");
  await page.screenshot({ path: "/tmp/farkle-shots/last-round.png" });
});
