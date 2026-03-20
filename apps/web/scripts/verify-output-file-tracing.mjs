import { readdir, readFile } from "fs/promises";
import path from "path";

const APP_SERVER_ROOT = path.resolve(process.cwd(), ".next", "server", "app");
const TRACED_SCRIPT = "scripts/scrape-user-tweets-http.mjs";
const REQUIRED_DEPENDENCY = "scripts/lib/x-scrape-session-broker.mjs";

async function collectTraceFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTraceFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "route.js.nft.json") {
      files.push(entryPath);
    }
  }

  return files;
}

try {
  const traceFiles = await collectTraceFiles(APP_SERVER_ROOT);
  const failures = [];

  for (const tracePath of traceFiles) {
    const payload = JSON.parse(await readFile(tracePath, "utf8"));
    const tracedFiles = Array.isArray(payload.files) ? payload.files : [];
    const includesScrapeScript = tracedFiles.some((file) => file.includes(TRACED_SCRIPT));
    if (!includesScrapeScript) {
      continue;
    }

    const includesBroker = tracedFiles.some((file) => file.includes(REQUIRED_DEPENDENCY));
    if (!includesBroker) {
      failures.push(path.relative(APP_SERVER_ROOT, tracePath));
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Missing ${REQUIRED_DEPENDENCY} in output tracing for:\n${failures
        .map((failure) => ` - ${failure}`)
        .join("\n")}`,
    );
  }

  console.log(
    `Verified output-file tracing for ${traceFiles.length} route manifests.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
