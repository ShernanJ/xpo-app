import { config } from "dotenv";
config();
import { generatePlan } from "./lib/agent-v2/agents/planner";

async function run() {
  const result = await generatePlan(
    "im building xpo, which is basically stanley for x, to try to impress stan's cto to hire me",
    "building xpo for stan's cto",
    [],
    "ideator: What project have you worked on recently?"
  );
  
  console.log(JSON.stringify(result, null, 2));
}

run();
