import {
  buildSemanticRepairDirective,
  buildSemanticRepairState,
  inferCorrectionRepairQuestion,
} from "./correctionRepair";

function runTest() {
  console.log(
    "asks for repair detail:",
    inferCorrectionRepairQuestion(
      "you didn't ask me what my extension does before drafting this post, you just assumed",
      "my extension for stanley",
    ),
  );

  console.log(
    "asks for relationship detail:",
    inferCorrectionRepairQuestion(
      "you flipped it around",
      "my extension for stanley",
    ),
  );

  console.log(
    "skips when the user already corrected the meaning:",
    inferCorrectionRepairQuestion(
      "you flipped it around its my extension that works for stanley",
      "my extension for stanley",
    ),
  );

  console.log(
    "repair state:",
    buildSemanticRepairState("my extension for stanley"),
  );

  console.log(
    "repair directive:",
    buildSemanticRepairDirective(
      "it's my extension that works for stanley and converts the post after stanley writes it",
      "my extension for stanley",
    ),
  );
}

runTest();
