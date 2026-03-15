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
  const visibleComposer = page.locator(
    'textarea[placeholder="What are we creating today?"]:visible',
  ).first();
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
