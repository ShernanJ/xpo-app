#!/usr/bin/env node

import {
  printUsage,
  runUserTweetsCaptureCli,
} from "../lib/x-scrape/userTweetsCapture.mjs";

try {
  const outcome = await runUserTweetsCaptureCli(process.argv.slice(2));
  if (outcome.message) {
    console.error(outcome.message);
  }

  if (outcome.shouldPrintUsage) {
    printUsage();
  }

  if (!outcome.ok) {
    process.exit(outcome.exitCode);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(message);
  process.exit(1);
}
