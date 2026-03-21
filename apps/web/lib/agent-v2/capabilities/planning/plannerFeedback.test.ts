import { interpretPlannerFeedback } from "./plannerFeedback";

async function runTest() {
  const basePlan = {
    objective: "Write about shipping a tough refactor",
    angle: "The messy middle matters more than the clean launch post",
    targetLane: "original" as const,
    mustInclude: [],
    mustAvoid: [],
    hookType: "Counter-narrative",
    pitchResponse: "i'm thinking we lean into the messy middle. sound good?",
    extractedConstraints: [],
  };

  console.log("approve:", await interpretPlannerFeedback("yes", basePlan));
  console.log(
    "revise:",
    await interpretPlannerFeedback("make it more personal and less polished", basePlan),
  );
  console.log("reject:", await interpretPlannerFeedback("nah, different angle", basePlan));
}

runTest().catch(console.error);
