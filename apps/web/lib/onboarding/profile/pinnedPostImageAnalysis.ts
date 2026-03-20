export interface ProfileAnalysisPinnedPostImageAnalysis {
  imageRole: "proof" | "product" | "personal_brand" | "meme" | "context" | "unknown";
  readableText: string;
  primarySubject: string;
  sceneSummary: string;
  strategicSignal: string;
  keyDetails: string[];
}
