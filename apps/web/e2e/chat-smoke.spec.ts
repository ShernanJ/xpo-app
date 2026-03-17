import { expect, test } from "playwright/test";

import {
  CHAT_SMOKE_HANDLE,
  CHAT_SMOKE_USER,
  installChatSmokeApiMocks,
  type ChatSmokeRequestCounts,
} from "./chat-smoke.fixtures";

test("authenticated chat bootstraps cleanly and sends one reply without endpoint spam", async ({
  page,
}) => {
  const counts: ChatSmokeRequestCounts = {
    billing: 0,
    chat: 0,
    context: 0,
    contract: 0,
    imagePosts: 0,
    lastChatRequestBody: null,
    preferences: 0,
    profileScrape: 0,
    threads: 0,
  };
  await installChatSmokeApiMocks(page, counts);

  await page.goto("/");
  await page.evaluate(async (user) => {
    const response = await fetch("/api/test/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });

    if (!response.ok) {
      throw new Error(`Failed to create test session: ${response.status}`);
    }
  }, CHAT_SMOKE_USER);

  await page.goto(`/chat?xHandle=${CHAT_SMOKE_HANDLE}`);

  await expect(page).toHaveURL(new RegExp(`/chat\\?xHandle=${CHAT_SMOKE_HANDLE}$`));
  const visibleComposer = page.getByRole("textbox", { name: "Chat composer" }).first();
  await expect(visibleComposer).toBeVisible();

  await expect.poll(() => counts.context).toBeGreaterThan(0);
  await expect.poll(() => counts.contract).toBeGreaterThan(0);

  await page.waitForTimeout(1500);

  expect(counts.context).toBeLessThanOrEqual(2);
  expect(counts.contract).toBeLessThanOrEqual(2);
  expect(counts.contract).toBe(counts.context);

  const initialContextCount = counts.context;
  const initialContractCount = counts.contract;

  expect(counts.context).toBe(initialContextCount);
  expect(counts.contract).toBe(initialContractCount);

  await visibleComposer.fill(
    "Write a quick post about building in public.",
  );
  await page.locator('button[aria-label="Send message"]:visible').first().click();

  await expect(
    page.getByText("Here is a grounded reply for the smoke test."),
  ).toBeVisible();

  expect(counts.chat).toBe(1);

  await page.waitForTimeout(1200);

  expect(counts.context).toBe(initialContextCount);
  expect(counts.contract).toBe(initialContractCount);
});

test("slash thread mode sends draft intent with thread formatting", async ({ page }) => {
  const counts: ChatSmokeRequestCounts = {
    billing: 0,
    chat: 0,
    context: 0,
    contract: 0,
    imagePosts: 0,
    lastChatRequestBody: null,
    preferences: 0,
    profileScrape: 0,
    threads: 0,
  };
  await installChatSmokeApiMocks(page, counts);

  await page.goto("/");
  await page.evaluate(async (user) => {
    const response = await fetch("/api/test/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });

    if (!response.ok) {
      throw new Error(`Failed to create test session: ${response.status}`);
    }
  }, CHAT_SMOKE_USER);

  await page.goto(`/chat?xHandle=${CHAT_SMOKE_HANDLE}`);

  const visibleComposer = page.getByRole("textbox", { name: "Chat composer" }).first();
  await expect(visibleComposer).toBeVisible();

  await visibleComposer.fill("/thread break down creator systems into 5 posts");
  await expect(page.getByText("/thread")).toBeVisible();
  await page.locator('button[aria-label="Send message"]:visible').first().click();

  await expect(
    page.getByText("Here is a grounded reply for the smoke test."),
  ).toBeVisible();

  expect(counts.chat).toBe(1);
  expect(counts.lastChatRequestBody).toMatchObject({
    intent: "draft",
    formatPreference: "thread",
  });
});

test("image attachments route through the image-post workflow", async ({ page }) => {
  const counts: ChatSmokeRequestCounts = {
    billing: 0,
    chat: 0,
    context: 0,
    contract: 0,
    imagePosts: 0,
    lastChatRequestBody: null,
    preferences: 0,
    profileScrape: 0,
    threads: 0,
  };
  await installChatSmokeApiMocks(page, counts);

  await page.goto("/");
  await page.evaluate(async (user) => {
    const response = await fetch("/api/test/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });

    if (!response.ok) {
      throw new Error(`Failed to create test session: ${response.status}`);
    }
  }, CHAT_SMOKE_USER);

  await page.goto(`/chat?xHandle=${CHAT_SMOKE_HANDLE}`);

  const visibleComposer = page.getByRole("textbox", { name: "Chat composer" }).first();
  await expect(visibleComposer).toBeVisible();

  await visibleComposer.fill("write me a post using this image");
  await page.locator('input[type="file"]').setInputFiles({
    name: "draft.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture-image"),
  });

  await expect(
    page.getByText("Pulled 3 post directions from the image. Pick one and I'll draft it."),
  ).toBeVisible();

  expect(counts.imagePosts).toBe(1);
  expect(counts.chat).toBe(0);
});
