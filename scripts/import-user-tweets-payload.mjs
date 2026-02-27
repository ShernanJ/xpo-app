#!/usr/bin/env node

import { readFile } from "fs/promises";

function printUsage() {
  console.error(
    "Usage: node scripts/import-user-tweets-payload.mjs <account> <payload-json-file> [endpoint]",
  );
}

async function main() {
  const account = process.argv[2];
  const payloadFile = process.argv[3];
  const endpoint =
    process.argv[4] ?? "http://localhost:3000/api/onboarding/scrape/import";

  if (!account || !payloadFile) {
    printUsage();
    process.exit(1);
  }

  let payload;
  try {
    const raw = await readFile(payloadFile, "utf8");
    payload = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Failed reading payload file: ${message}`);
    process.exit(1);
  }

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

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Keep data null for non-JSON responses.
  }

  if (!response.ok) {
    console.error(`Import failed with status ${response.status}`);
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Unhandled error: ${message}`);
  process.exit(1);
});
