import { config } from "dotenv";
config();
import { classifyIntent } from "./lib/agent-v2/agents/classifier";

async function run() {
  const tests = [
    "> What unexpected win did you celebrate this week?",
    "> What unexpected win did you celebrate this week? I shipped the database migration.",
    "1. I finally shipped the new database migration",
    "the goat guy story from yesterday"
  ];

  for (const text of tests) {
    console.log(`\nTesting: "${text}"`);
    const result = await classifyIntent(text, "Assistant: 1. What unexpected win did you celebrate this week?");
    console.log(result?.intent);
  }
}

run();
