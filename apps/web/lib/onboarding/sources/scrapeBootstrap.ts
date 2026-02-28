import { access, mkdtemp, readFile, rm } from "fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "path";
import { promisify } from "util";

import { importUserTweetsPayload } from "../importScrapePayload";

const execFileAsync = promisify(execFile);

async function resolveScrapeScriptPath(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "scripts", "scrape-user-tweets-http.mjs"),
    path.resolve(cwd, "apps", "web", "scripts", "scrape-user-tweets-http.mjs"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error("Could not resolve scrape-user-tweets-http.mjs for onboarding bootstrap.");
}

export async function bootstrapScrapeCapture(account: string) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "stanley-onboarding-"));
  const outputPath = path.join(tmpDir, `${account}-payload.json`);
  const scriptPath = await resolveScrapeScriptPath();
  const pages = Math.max(
    1,
    Math.min(
      8,
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_PAGES))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_PAGES))
        : 5,
    ),
  );
  const count = Math.max(
    20,
    Math.min(
      100,
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_COUNT))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_COUNT))
        : 40,
    ),
  );

  try {
    await execFileAsync(
      process.execPath,
      [
        scriptPath,
        "--account",
        account,
        "--count",
        String(count),
        "--pages",
        String(pages),
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 8,
      },
    );

    const payload = JSON.parse(await readFile(outputPath, "utf8"));
    return await importUserTweetsPayload({
      account,
      payload,
      source: "bootstrap",
      userAgent: "onboarding-bootstrap",
    });
  } catch (error) {
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const detail =
      execError?.stderr?.trim() ||
      execError?.stdout?.trim() ||
      execError?.message ||
      "unknown scrape bootstrap failure";

    throw new Error(`Live scrape bootstrap failed for @${account}: ${detail}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
