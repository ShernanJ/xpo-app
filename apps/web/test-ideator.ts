import { config } from "dotenv";
config();
import { generateIdeasMenu } from "./lib/agent-v2/agents/ideator";

async function run() {
  const result = await generateIdeasMenu(
    "what can i write about?", 
    null, 
    "", 
    null, 
    ["I like to talk about productivity and coding and AI"]
  );
  if (result) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Ideator returned null");
  }
}

run();
