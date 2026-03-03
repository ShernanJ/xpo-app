import { config } from "dotenv";
config();
import { generateCoachReply } from "./lib/agent-v2/agents/coach";

async function run() {
  const result = await generateCoachReply(
    "> What's a real-world project you're actually building right now?",
    "Ideator: What's a real-world project you're actually building right now?",
    null,
    null,
    [],
    ""
  );
  console.log(JSON.stringify(result, null, 2));
}

run();
