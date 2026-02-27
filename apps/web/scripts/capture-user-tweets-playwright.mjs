#!/usr/bin/env node

import { mkdir, writeFile } from "fs/promises";
import path from "path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/capture-user-tweets-playwright.mjs --account <username> [options]",
      "",
      "Options:",
      "  --account <value>         X username (or @username or x.com/username).",
      "  --output <path>           Where to save payload JSON.",
      "  --user-data-dir <path>    Playwright persistent profile directory.",
      "  --timeout-ms <number>     Max wait for interception (default: 300000).",
      "  --headless                Run browser in headless mode (default: false).",
      "  --login-username <value>  X login username/email (or env X_LOGIN_USERNAME).",
      "  --login-password <value>  X login password (or env X_LOGIN_PASSWORD).",
      "  --login-email <value>     Fallback identifier for X challenge step (or env X_LOGIN_EMAIL).",
      "  --import                  POST captured payload to onboarding scrape import endpoint.",
      "  --endpoint <url>          Import endpoint (default: http://localhost:3000/api/onboarding/scrape/import).",
      "  --help                    Show this help text.",
      "",
      "Examples:",
      "  node scripts/capture-user-tweets-playwright.mjs --account shernanjavier",
      "  node scripts/capture-user-tweets-playwright.mjs --account @shernanjavier --import",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const parsed = {
    account: null,
    output: null,
    userDataDir: null,
    timeoutMs: 300000,
    headless: false,
    shouldImport: false,
    endpoint: "http://localhost:3000/api/onboarding/scrape/import",
    loginUsername: null,
    loginPassword: null,
    loginEmail: null,
    help: false,
  };

  const args = [...argv];
  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      continue;
    }

    if (token === "--") {
      continue;
    }

    if (!token.startsWith("--")) {
      if (!parsed.account) {
        parsed.account = token;
      }
      continue;
    }

    if (token === "--help") {
      parsed.help = true;
      continue;
    }

    if (token === "--headless") {
      parsed.headless = true;
      continue;
    }

    if (token === "--import") {
      parsed.shouldImport = true;
      continue;
    }

    const value = args.shift();
    if (!value) {
      throw new Error(`Missing value for ${token}`);
    }

    if (token === "--account") {
      parsed.account = value;
      continue;
    }

    if (token === "--output") {
      parsed.output = value;
      continue;
    }

    if (token === "--user-data-dir") {
      parsed.userDataDir = value;
      continue;
    }

    if (token === "--endpoint") {
      parsed.endpoint = value;
      continue;
    }

    if (token === "--login-username") {
      parsed.loginUsername = value;
      continue;
    }

    if (token === "--login-password") {
      parsed.loginPassword = value;
      continue;
    }

    if (token === "--login-email") {
      parsed.loginEmail = value;
      continue;
    }

    if (token === "--timeout-ms") {
      const timeoutMs = Number(value);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
        throw new Error("--timeout-ms must be a number >= 1000.");
      }

      parsed.timeoutMs = Math.floor(timeoutMs);
      continue;
    }

    throw new Error(`Unknown flag: ${token}`);
  }

  return parsed;
}

function normalizeAccount(rawValue) {
  const raw = rawValue.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("@")) {
    const handle = raw.slice(1).trim();
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
  }

  if (/^[A-Za-z0-9_]{1,15}$/.test(raw)) {
    return raw;
  }

  const urlCandidate =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw}`;

  try {
    const parsed = new URL(urlCandidate);
    const host = parsed.hostname.toLowerCase();
    if (!["x.com", "www.x.com", "mobile.x.com"].includes(host)) {
      return null;
    }

    const [username = ""] = parsed.pathname.split("/").filter(Boolean);
    return /^[A-Za-z0-9_]{1,15}$/.test(username) ? username : null;
  } catch {
    return null;
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function extractPayloadUsername(payload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);
  if (!userResult) {
    return null;
  }

  const core = asRecord(userResult?.core);
  const userCore = asRecord(core?.core);
  if (typeof userCore?.screen_name === "string") {
    return userCore.screen_name;
  }

  const legacy = asRecord(userResult?.legacy);
  if (typeof legacy?.screen_name === "string") {
    return legacy.screen_name;
  }

  return null;
}

function looksLikeUserTweetsPayload(payload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);
  if (!userResult) {
    return false;
  }

  const timeline = asRecord(asRecord(userResult.timeline)?.timeline);
  const timelineV2 = asRecord(asRecord(userResult.timeline_v2)?.timeline);
  if (!(timeline || timelineV2)) {
    return false;
  }

  return true;
}

async function resolvePlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      [
        "The `playwright` package is not installed in apps/web.",
        "Run:",
        "  cd apps/web",
        "  npm i -D playwright",
        "  npx playwright install chromium",
      ].join("\n"),
    );
  }
}

async function clickFirstVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const target = locator.nth(index);
    if (await target.isVisible().catch(() => false)) {
      await target.click();
      return true;
    }
  }

  return false;
}

async function clickButtonByLabels(page, labels) {
  for (const label of labels) {
    const roleLocator = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
    if (await clickFirstVisible(roleLocator)) {
      return true;
    }

    const textLocator = page.locator(`button:has-text("${label}")`);
    if (await clickFirstVisible(textLocator)) {
      return true;
    }
  }

  return false;
}

async function ensureLoggedIn(page, credentials) {
  const { loginUsername, loginPassword, loginEmail } = credentials;

  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/i/flow/login")) {
    return { loggedIn: true, usedCredentials: false };
  }

  if (!loginUsername || !loginPassword) {
    return { loggedIn: false, usedCredentials: false };
  }

  console.log("[login] Attempting credential-based login.");
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" });

  const usernameInput = page.locator('input[autocomplete="username"], input[name="text"]').first();
  await usernameInput.waitFor({ state: "visible", timeout: 30000 });
  await usernameInput.fill(loginUsername);

  if (!(await clickButtonByLabels(page, ["Next", "Log in", "Sign in"]))) {
    throw new Error("Login failed: unable to click Next button.");
  }

  await sleep(1200);

  const challengeInput = page.locator('input[name="text"]').first();
  const hasChallengeInput = await challengeInput.isVisible().catch(() => false);
  const passwordInputNowVisible = await page
    .locator('input[name="password"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (hasChallengeInput && !passwordInputNowVisible) {
    await challengeInput.fill(loginEmail ?? loginUsername);
    if (!(await clickButtonByLabels(page, ["Next", "Continue"]))) {
      throw new Error("Login failed at challenge step (could not continue).");
    }
  }

  const passwordInput = page.locator('input[name="password"]').first();
  await passwordInput.waitFor({ state: "visible", timeout: 30000 });
  await passwordInput.fill(loginPassword);

  if (!(await clickButtonByLabels(page, ["Log in", "Sign in"]))) {
    throw new Error("Login failed: unable to click Log in button.");
  }

  await page.waitForURL((url) => !url.toString().includes("/i/flow/login"), {
    timeout: 45000,
  }).catch(() => undefined);

  if (page.url().includes("/i/flow/login")) {
    const hasOtpPrompt = await page
      .locator('input[data-testid="ocfEnterTextTextInput"], input[inputmode="numeric"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (hasOtpPrompt) {
      throw new Error(
        "Login requires verification/2FA. Complete it manually in the opened browser, then rerun.",
      );
    }

    throw new Error("Login did not complete. X likely presented an additional challenge.");
  }

  return { loggedIn: true, usedCredentials: true };
}

async function warmProfileTimeline(page, account) {
  const urls = [
    `https://x.com/${account}`,
    `https://x.com/${account}/with_replies`,
    `https://x.com/${account}/media`,
    `https://mobile.x.com/${account}`,
  ];

  for (const url of urls) {
    console.log(`[capture] Visiting ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const currentUrl = page.url();
    if (currentUrl.includes("/i/flow/login")) {
      console.log("[capture] Login required. Sign in, then reload the profile tab.");
      return;
    }

    await sleep(1200);
    await page.mouse.wheel(0, 1400);
    await sleep(1200);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
}

function waitForUserTweetsCapture(context, params) {
  const { timeoutMs, expectedAccount } = params;

  return new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = Date.now();

    const finalize = (fn) => {
      if (settled) {
        return;
      }

      settled = true;
      context.off("response", onResponse);
      clearTimeout(timeoutId);
      fn();
    };

    const timeoutId = setTimeout(() => {
      finalize(() => {
        reject(
          new Error(
            [
              `Timed out after ${timeoutMs}ms waiting for UserTweets GraphQL response.`,
              "Keep the browser open, ensure you are logged in, and reload the target profile page.",
            ].join(" "),
          ),
        );
      });
    }, timeoutMs);

    const onResponse = async (response) => {
      const url = response.url();
      if (!url.includes("/i/api/graphql/") || !url.includes("/UserTweets")) {
        return;
      }

      if (!response.ok()) {
        return;
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        return;
      }

      if (!looksLikeUserTweetsPayload(payload)) {
        return;
      }

      const payloadAccount = extractPayloadUsername(payload);
      if (
        expectedAccount &&
        payloadAccount &&
        payloadAccount.toLowerCase() !== expectedAccount.toLowerCase()
      ) {
        return;
      }

      finalize(() => {
        resolve({
          payload,
          meta: {
            url,
            status: response.status(),
            payloadAccount,
            elapsedMs: Date.now() - startedAt,
          },
        });
      });
    };

    context.on("response", onResponse);
  });
}

function buildDefaultOutputPath(account) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(process.cwd(), "tmp", `user-tweets-${account}-${stamp}.json`);
}

async function maybeImportCapture(params) {
  const { endpoint, account, payload } = params;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account,
      payload,
      source: "agent",
    }),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // Keep null when response is non-JSON.
  }

  if (!response.ok) {
    throw new Error(
      [
        `Import request failed with status ${response.status}.`,
        json ? JSON.stringify(json, null, 2) : "No JSON response body.",
      ].join("\n"),
    );
  }

  return json;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown argument error.";
    console.error(message);
    printUsage();
    process.exit(1);
  }

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.account) {
    printUsage();
    process.exit(1);
  }

  const account = normalizeAccount(options.account);
  if (!account) {
    console.error("Invalid --account value. Use @username, username, or x.com/username.");
    process.exit(1);
  }

  const outputPath = path.resolve(
    options.output ?? buildDefaultOutputPath(account),
  );
  const userDataDir = path.resolve(
    options.userDataDir ?? path.resolve(process.cwd(), ".playwright-x-profile"),
  );
  const loginUsername = options.loginUsername ?? process.env.X_LOGIN_USERNAME ?? null;
  const loginPassword = options.loginPassword ?? process.env.X_LOGIN_PASSWORD ?? null;
  const loginEmail = options.loginEmail ?? process.env.X_LOGIN_EMAIL ?? null;

  const { chromium } = await resolvePlaywright();

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: options.headless,
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const targetUrl = `https://x.com/${account}`;

    console.log(`[capture] Opening ${targetUrl}`);
    const capturePromise = waitForUserTweetsCapture(context, {
      timeoutMs: options.timeoutMs,
      expectedAccount: account,
    });

    const loginState = await ensureLoggedIn(page, {
      loginUsername,
      loginPassword,
      loginEmail,
    });
    if (!loginState.loggedIn) {
      console.log(
        "[login] Not logged in and no credentials provided. Log in manually in the opened browser.",
      );
    } else if (loginState.usedCredentials) {
      console.log("[login] Programmatic login succeeded.");
    } else {
      console.log("[login] Existing session detected.");
    }

    await warmProfileTimeline(page, account);
    if (!options.headless) {
      await page.bringToFront();
    }

    console.log(
      `[capture] Waiting up to ${options.timeoutMs}ms. If prompted, log in and reload the profile page.`,
    );
    console.log(
      "[capture] If posts look empty, click Posts/Replies tabs or refresh; network interception is still active.",
    );

    const captured = await capturePromise;
    await writeFile(outputPath, `${JSON.stringify(captured.payload, null, 2)}\n`, "utf8");

    console.log(`[capture] Saved payload: ${outputPath}`);
    console.log(
      `[capture] Source: ${captured.meta.url} (status=${captured.meta.status}, elapsed=${captured.meta.elapsedMs}ms)`,
    );

    if (options.shouldImport) {
      console.log(`[import] Posting capture to ${options.endpoint}`);
      const importResult = await maybeImportCapture({
        endpoint: options.endpoint,
        account,
        payload: captured.payload,
      });
      console.log(`[import] Success:\n${JSON.stringify(importResult, null, 2)}`);
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(message);
  process.exit(1);
});
