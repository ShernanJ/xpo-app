import "dotenv/config";

import {
  findReplayFixture,
  listReplayFixtures,
  replayTranscriptFixture,
} from "./lib/creator-transcript-replay.ts";
import { CREATOR_TRANSCRIPT_FIXTURES } from "./fixtures/creator-transcript-fixtures.ts";

function parseArgs(argv) {
  let fixtureId = null;
  let listOnly = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      listOnly = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--fixture" || arg === "-f") {
      fixtureId = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (!fixtureId && !arg.startsWith("-")) {
      fixtureId = arg;
    }
  }

  return {
    fixtureId,
    listOnly,
    json,
  };
}

function printFixtureList() {
  for (const fixture of listReplayFixtures(CREATOR_TRANSCRIPT_FIXTURES)) {
    console.log(`${fixture.id}: ${fixture.title}`);
    console.log(`  ${fixture.description}`);
  }
}

function printUsage() {
  console.log("Usage:");
  console.log(
    "  pnpm --dir apps/web run replay:creator-transcript -- --list",
  );
  console.log(
    "  pnpm --dir apps/web run replay:creator-transcript -- --fixture stan-office-league-story",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listOnly) {
    printFixtureList();
    return;
  }

  if (!args.fixtureId) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const fixture = findReplayFixture(CREATOR_TRANSCRIPT_FIXTURES, args.fixtureId);
  if (!fixture) {
    console.error(`Unknown fixture: ${args.fixtureId}`);
    console.error("");
    printFixtureList();
    process.exitCode = 1;
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY is required to replay a live transcript.");
    process.exitCode = 1;
    return;
  }

  const result = await replayTranscriptFixture(fixture);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          fixture: {
            id: fixture.id,
            title: fixture.title,
          },
          turns: result.turns.map((turn) => ({
            turnNumber: turn.turnNumber,
            userMessage: turn.userMessage,
            note: turn.note || null,
            explicitIntent: turn.explicitIntent || null,
            mode: turn.output.mode,
            outputShape: turn.output.outputShape,
            surfaceMode: turn.output.surfaceMode,
            response: turn.output.response,
            draft: turn.output.data?.draft || null,
            issuesFixed: turn.output.data?.issuesFixed || [],
          })),
          finalMemory: result.finalMemory,
          finalActiveDraft: result.finalActiveDraft,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`${fixture.title}`);
  console.log(`${fixture.description}`);
  console.log("");

  for (const turn of result.turns) {
    console.log(`[Turn ${turn.turnNumber}] user: ${turn.userMessage}`);
    if (turn.note) {
      console.log(`  note: ${turn.note}`);
    }
    console.log(
      `  mode=${turn.output.mode} surface=${turn.output.surfaceMode} shape=${turn.output.outputShape}`,
    );
    console.log(`  assistant: ${turn.output.response}`);

    if (typeof turn.output.data?.draft === "string") {
      console.log(`  draft: ${turn.output.data.draft}`);
    }

    if (turn.output.data?.issuesFixed && turn.output.data.issuesFixed.length > 0) {
      console.log(`  issuesFixed: ${turn.output.data.issuesFixed.join(" | ")}`);
    }

    console.log("");
  }

  console.log(
    `Final memory: state=${result.finalMemory.conversationState}, topic=${result.finalMemory.topicSummary || "none"}`,
  );
  if (result.finalMemory.unresolvedQuestion) {
    console.log(`Outstanding clarification: ${result.finalMemory.unresolvedQuestion}`);
  }
}

main().catch((error) => {
  console.error("Transcript replay failed:", error);
  process.exitCode = 1;
});
