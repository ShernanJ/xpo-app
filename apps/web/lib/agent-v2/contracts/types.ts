export interface GhostwriterStyleCard {
  lexicon: {
    topAdjectives: string[];
    transitionPhrases: string[];
    greetings: string[];
  };
  formatting: {
    casingPreference: "lowercase" | "sentence" | "title" | "mixed";
    avgParagraphLengthWords: number;
    lineBreakFrequency: "high" | "medium" | "low";
  };
  punctuationAndSyntax: {
    usesEmDashes: boolean;
    usesEllipses: boolean;
    rhetoricalQuestionFrequency: "high" | "medium" | "low";
    topEmojis: string[];
  };
}
