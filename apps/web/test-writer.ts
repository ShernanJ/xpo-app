import { config } from "dotenv";
config();
import { generateDrafts } from "./lib/agent-v2/agents/writer";
import { PlannerOutput } from "./lib/agent-v2/agents/planner";

async function run() {
  const mockPlan: PlannerOutput = {
    objective: "im building xpo, which is basically stanley for x, to try to impress stan's cto to hire me",
    angle: "building a side project to get a job",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: ["emojis"],
    hookType: "Direct Action"
  };

  const styleCard = {
    sentenceOpenings: ["im", "just", "so"],
    sentenceClosers: [""],
    pacing: "fast, lowercase, stream of consciousness",
    emojiPatterns: [],
    slangAndVocabulary: ["stanley", "xpo", "cto"],
    formattingRules: ["all lowercase always", "no punctuation"]
  };

  const topicAnchors = [
    "i swear im not an ampm promoter (yet) but a harvard business review study says 73% of knowledge workers feel more exhausted after adopting productivity hacks lol...",
    "x is ditching brainstorming for negative constraints lol throwback to my first failed thread about productivity LMAOOO..."
  ];

  console.log("Generating draft...");
  
  const result = await generateDrafts(
    mockPlan,
    styleCard,
    topicAnchors,
    [],
    "ideator: what project have you worked on recently?\nuser: im building xpo, which is basically stanley for x, to try to impress stan's cto to hire me"
  );
  
  console.log(result?.draft);
}

run();
